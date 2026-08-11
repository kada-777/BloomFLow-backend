const { minorUnitsToString, toMinorUnits } = require("../utils/branch-stock");
const {
  calculateFlowerStatus,
  DEFAULT_FRESH_PERIOD,
  DEFAULT_GRADE_C_PERIOD,
} = require("../utils/flower-status");
const { requestForecast } = require("./forecast-client");
const { validateForecastResponse } = require("./forecast-validation.service");

function addQuantity(map, key, value) {
  map.set(key, (map.get(key) ?? 0n) + toMinorUnits(value ?? "0"));
}

function getEligiblePairs(historyByPair, minimumHistory) {
  return [...historyByPair.entries()]
    .filter(([, historyDays]) => historyDays >= minimumHistory)
    .map(([key]) => {
      const [branchId, flowerId] = key.split(":").map(Number);
      return { branchId, flowerId };
    })
    .sort((left, right) => left.branchId - right.branchId || left.flowerId - right.flowerId);
}

function dateText(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function buildBaselineResults({ branches, flowers, sales, pairs, cutoffDate, window = 7 }) {
  const cutoff = new Date(`${dateText(cutoffDate)}T00:00:00.000Z`);
  const firstDate = new Date(cutoff);
  firstDate.setUTCDate(firstDate.getUTCDate() - window + 1);
  const totalsByFlower = new Map();

  for (const sale of sales) {
    const salesDate = new Date(`${dateText(sale.salesDate)}T00:00:00.000Z`);
    if (salesDate < firstDate || salesDate > cutoff) continue;
    for (const item of sale.items ?? []) {
      const demand = toMinorUnits(item.soldQuantity ?? "0") + toMinorUnits(item.damagedQuantity ?? "0");
      totalsByFlower.set(item.flowerId, (totalsByFlower.get(item.flowerId) ?? 0n) + demand);
    }
  }

  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const flowerById = new Map(flowers.map((flower) => [flower.id, flower]));
  const generatedAt = new Date().toISOString();
  const results = [];

  for (const pair of pairs) {
    const branch = branchById.get(pair.branchId);
    const flower = flowerById.get(pair.flowerId);
    const demand = Number(totalsByFlower.get(pair.flowerId) ?? 0n) / 100 / window;
    const forecastDemand = demand.toFixed(2);
    for (let horizon = 1; horizon <= 3; horizon += 1) {
      const forecastDate = new Date(cutoff);
      forecastDate.setUTCDate(forecastDate.getUTCDate() + horizon);
      results.push({
        branchId: pair.branchId,
        branchName: branch.name,
        flowerId: pair.flowerId,
        flowerName: flower.name,
        forecastDate: forecastDate.toISOString().slice(0, 10),
        horizon,
        forecastDemand,
        forecastMethod: "BASELINE",
        modelVersion: "baseline-v1",
        generatedAt,
      });
    }
  }

  return results;
}

function nextPlanningDate(cutoffDate) {
  const planningDate = new Date(`${dateText(cutoffDate)}T00:00:00.000Z`);
  planningDate.setUTCDate(planningDate.getUTCDate() + 1);
  return planningDate;
}

async function loadForecastHistory(tx, cutoffDate) {
  const cutoff = new Date(`${dateText(cutoffDate)}T00:00:00.000Z`);
  const [branches, flowers, sales, minimumHistoryConfig] = await Promise.all([
    tx.branch.findMany({ select: { id: true, name: true } }),
    tx.flower.findMany({ select: { id: true, name: true, variety: true } }),
    tx.dailySale.findMany({
      where: { salesDate: { lte: cutoff } },
      select: {
        branchId: true,
        salesDate: true,
        items: { select: { flowerId: true, soldQuantity: true, damagedQuantity: true } },
      },
    }),
    tx.systemConfiguration.findUnique({
      where: { key: "AI_MINIMUM_HISTORY" },
      select: { value: true },
    }),
  ]);

  const historyDates = new Map();
  for (const sale of sales) {
    const saleDate = dateText(sale.salesDate);
    for (const item of sale.items) {
      const key = `${sale.branchId}:${item.flowerId}`;
      const dates = historyDates.get(key) ?? new Set();
      dates.add(saleDate);
      historyDates.set(key, dates);
    }
  }

  const historyByPair = new Map(
    [...historyDates.entries()].map(([key, dates]) => [key, dates.size])
  );
  const allPairs = branches.flatMap((branch) => flowers.map((flower) => ({
    branchId: branch.id,
    flowerId: flower.id,
  })));
  const minimumHistory = Number.parseInt(minimumHistoryConfig?.value ?? "28", 10);
  if (!Number.isInteger(minimumHistory) || minimumHistory < 1) {
    throw new Error("AI_MINIMUM_HISTORY must be a positive integer");
  }

  const eligiblePairs = getEligiblePairs(historyByPair, minimumHistory);
  const eligibleKeys = new Set(eligiblePairs.map((pair) => `${pair.branchId}:${pair.flowerId}`));
  const baselinePairs = allPairs.filter((pair) => !eligibleKeys.has(`${pair.branchId}:${pair.flowerId}`));

  return { allPairs, baselinePairs, branches, flowers, eligiblePairs, historyByPair, sales, cutoffDate };
}

function validateEligibleResults(results, eligiblePairs) {
  const eligibleKeys = new Set(eligiblePairs.map((pair) => `${pair.branchId}:${pair.flowerId}`));
  const resultKeys = new Set(results.map((result) => `${result.branchId}:${result.flowerId}`));
  if (resultKeys.size !== eligibleKeys.size || [...resultKeys].some((key) => !eligibleKeys.has(key))) {
    throw new Error("Forecast service returned results outside eligiblePairs");
  }
}

function buildRecommendations(results, branchLots, inTransit, headOfficeStock, safetyStock) {
  const stockByPair = new Map();
  const inTransitByPair = new Map();
  const candidatesByFlower = new Map();
  const safetyStockUnits = toMinorUnits(safetyStock);

  for (const lot of branchLots) {
    addQuantity(stockByPair, `${lot.branchId}:${lot.flowerId}`, lot.quantity);
  }
  for (const allocation of inTransit) {
    addQuantity(
      inTransitByPair,
      `${allocation.distributionOrder.branchId}:${allocation.batch.flowerId}`,
      allocation.quantity
    );
  }

  const recommendations = results.map((result) => {
    const pair = `${result.branchId}:${result.flowerId}`;
    const currentStock = stockByPair.get(pair) ?? 0n;
    const arrivingStock = inTransitByPair.get(pair) ?? 0n;
    const demand = toMinorUnits(result.forecastDemand);
    const shortage = demand + safetyStockUnits - currentStock - arrivingStock;
    const candidate = { ...result, shortage: shortage > 0n ? shortage : 0n };
    const candidates = candidatesByFlower.get(result.flowerId) ?? [];
    candidates.push(candidate);
    candidatesByFlower.set(result.flowerId, candidates);
    return candidate;
  });

  const recommendedByPair = new Map();
  for (const [flowerId, candidates] of candidatesByFlower) {
    let remaining = headOfficeStock.get(flowerId) ?? 0n;
    candidates
      .sort((left, right) => {
        if (left.shortage !== right.shortage) return left.shortage > right.shortage ? -1 : 1;
        return left.branchId - right.branchId;
      })
      .forEach((candidate) => {
        const recommended = candidate.shortage < remaining ? candidate.shortage : remaining;
        recommendedByPair.set(`${candidate.branchId}:${candidate.flowerId}`, recommended);
        remaining -= recommended;
      });
  }

  return recommendations.map((result) => ({
    branchId: result.branchId,
    flowerId: result.flowerId,
    recommendedQuantity: minorUnitsToString(
      recommendedByPair.get(`${result.branchId}:${result.flowerId}`) ?? 0n
    ),
  }));
}

async function loadInventorySnapshot(tx) {
  const [branchLots, inTransit, groupedHeadOfficeStock, configuration, ageConfigurations] = await Promise.all([
    tx.branchStockLot.findMany({
      where: { quantity: { not: "0" } },
      select: { branchId: true, flowerId: true, quantity: true, shippedAt: true },
    }),
    tx.distributionBatchAllocation.findMany({
      where: { distributionOrder: { status: "IN_TRANSIT" } },
      select: {
        quantity: true,
        batch: { select: { flowerId: true } },
        distributionOrder: { select: { branchId: true } },
      },
    }),
    tx.flowerBatch.groupBy({
      by: ["flowerId"],
      where: { status: "AVAILABLE", availableQuantity: { not: "0" } },
      _sum: { availableQuantity: true },
    }),
    tx.systemConfiguration.findUnique({
      where: { key: "DEFAULT_SAFETY_STOCK" },
      select: { value: true },
    }),
    tx.systemConfiguration.findMany({
      where: { key: { in: ["FRESH_PERIOD", "GRADE_C_PERIOD"] } },
      select: { key: true, value: true },
    }),
  ]);

  const agePeriods = new Map(ageConfigurations.map((config) => [config.key, config.value]));
  const freshPeriod = parseInt(agePeriods.get("FRESH_PERIOD"), 10) || DEFAULT_FRESH_PERIOD;
  const gradeCPeriod = parseInt(agePeriods.get("GRADE_C_PERIOD"), 10) || DEFAULT_GRADE_C_PERIOD;
  const usableBranchLots = branchLots.filter(
    (lot) => calculateFlowerStatus(lot.shippedAt, freshPeriod, gradeCPeriod) !== "DAMAGED"
  );

  const headOfficeStock = new Map(
    groupedHeadOfficeStock.map((entry) => [entry.flowerId, toMinorUnits(entry._sum.availableQuantity ?? "0")])
  );

  return {
    branchLots: usableBranchLots,
    inTransit,
    headOfficeStock,
    safetyStock: configuration?.value ?? "0",
  };
}

function getDefaultDependencies() {
  return {
    prismaClient: require("../lib/prisma"),
    forecastClient: requestForecast,
    responseValidator: validateForecastResponse,
  };
}

async function generateForecast(options = {}, dependencies = getDefaultDependencies()) {
  const preliminarySales = await dependencies.prismaClient.dailySale.findMany({
    select: { salesDate: true },
  });
  if (!preliminarySales.length && !options.forecastDate) {
    throw new Error("Daily sales history is required to generate a forecast");
  }
  const cutoffDate = options.forecastDate
    ?? preliminarySales.map((sale) => dateText(sale.salesDate)).sort().at(-1);
  const planningDate = nextPlanningDate(cutoffDate);
  const existingPlan = await dependencies.prismaClient.distributionPlan.findFirst({
    where: { planningDate },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (existingPlan) {
    return { distributionPlanId: existingPlan.id, reused: true };
  }

  const forecastHistory = await loadForecastHistory(dependencies.prismaClient, cutoffDate);
  const request = { forecastDate: cutoffDate, eligiblePairs: forecastHistory.eligiblePairs };
  if (options.modelVersion) request.modelVersion = options.modelVersion;

  let mlResults = [];
  let mlModelVersion = options.modelVersion ?? "hgb-v1";
  let useBaselineForAllPairs = false;
  if (forecastHistory.eligiblePairs.length) {
    try {
      const mlResponse = dependencies.responseValidator(await dependencies.forecastClient(request));
      validateEligibleResults(mlResponse.results, forecastHistory.eligiblePairs);
      mlResults = mlResponse.results;
      mlModelVersion = mlResponse.modelVersion;
    } catch {
      useBaselineForAllPairs = true;
    }
  }
  const baselineResults = buildBaselineResults({
    branches: forecastHistory.branches,
    flowers: forecastHistory.flowers,
    sales: forecastHistory.sales,
    pairs: useBaselineForAllPairs ? forecastHistory.allPairs : forecastHistory.baselinePairs,
    cutoffDate,
  });
  const results = [...mlResults, ...baselineResults];
  const forecastMethod = mlResults.length && baselineResults.length
    ? "MIXED"
    : (mlResults.length ? "ML" : "BASELINE");
  const modelVersion = forecastMethod === "MIXED"
    ? "mixed"
    : (mlResults.length ? mlModelVersion : "baseline-v1");
  const dPlusOneResults = results.filter((result) => result.horizon === 1);

  const snapshot = await loadInventorySnapshot(dependencies.prismaClient);
  const recommendations = buildRecommendations(
    dPlusOneResults,
    snapshot.branchLots,
    snapshot.inTransit,
    snapshot.headOfficeStock,
    snapshot.safetyStock
  );

  const persisted = await dependencies.prismaClient.$transaction(async (tx) => {
    const forecastRun = await tx.forecastRun.create({
      data: {
        executedAt: new Date(results[0].generatedAt),
        modelVersion,
        forecastMethod,
        trainingDataUntil: new Date(`${cutoffDate}T00:00:00.000Z`),
      },
      select: { id: true },
    });

    await tx.forecastResult.createMany({
      data: results.map((result) => ({
        runId: forecastRun.id,
        branchId: result.branchId,
        flowerId: result.flowerId,
        forecastDemand: result.forecastDemand,
        forecastPeriod: result.forecastDate,
        forecastMethod: result.forecastMethod,
        modelVersion: result.modelVersion,
      })),
    });

    const distributionPlan = await tx.distributionPlan.create({
      data: {
        planningDate,
        status: "DRAFT",
        items: {
          create: recommendations.map((recommendation) => ({
            branchId: recommendation.branchId,
            flowerId: recommendation.flowerId,
            recommendedQuantity: recommendation.recommendedQuantity,
          })),
        },
      },
      select: { id: true },
    });

    return { forecastRunId: forecastRun.id, distributionPlanId: distributionPlan.id };
  });

  return persisted;
}

module.exports = {
  buildBaselineResults,
  buildRecommendations,
  generateForecast,
  getEligiblePairs,
  loadForecastHistory,
  loadInventorySnapshot,
  nextPlanningDate,
};
