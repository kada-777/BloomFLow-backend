const { minorUnitsToString, toMinorUnits } = require("../utils/branch-stock");
const { HttpError } = require("../utils/http-error");
const {
  calculateFlowerStatus,
  DEFAULT_FRESH_PERIOD,
  DEFAULT_GRADE_C_PERIOD,
} = require("../utils/flower-status");
const { requestForecast } = require("./forecast-client");
const { validateForecastResponse } = require("./forecast-validation.service");
const {
  getPlanningMetadata,
  jakartaDate,
  validatePlanningDate,
} = require("./planning-date.service");

function addQuantity(map, key, value) {
  map.set(key, (map.get(key) ?? 0n) + toMinorUnits(value ?? "0"));
}

function aggregateReceivingItems(receivings) {
  const quantities = new Map();
  for (const receiving of receivings) {
    for (const item of receiving.items ?? []) {
      addQuantity(quantities, item.flowerId, item.acceptedQuantity);
    }
  }
  return [...quantities.entries()].map(([flowerId, quantity]) => ({
    flowerId,
    acceptedQuantity: minorUnitsToString(quantity),
  }));
}

function validationError(errors) {
  throw new HttpError(422, "Validation failed", errors);
}

function parseOptionalReceivingId(value) {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    validationError([{ field: "receivingId", message: "receivingId must be a positive integer" }]);
  }
  return id;
}

function toWholeUnits(value) {
  return toMinorUnits(value) / 100n;
}

function wholeUnitsToString(value) {
  return minorUnitsToString(value * 100n);
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

function allocateIntegerByWeight(totalUnits, weightedBranches) {
  if (totalUnits <= 0n || !weightedBranches.length) return new Map();

  const totalWeight = weightedBranches.reduce((sum, entry) => sum + entry.weight, 0n);
  const allocations = [];
  let allocated = 0n;

  for (const entry of weightedBranches) {
    const numerator = totalUnits * entry.weight;
    const quantity = numerator / totalWeight;
    const remainder = numerator % totalWeight;
    allocations.push({ ...entry, quantity, remainder });
    allocated += quantity;
  }

  let remaining = totalUnits - allocated;
  allocations.sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    return left.branchId - right.branchId;
  });

  for (const allocation of allocations) {
    if (remaining <= 0n) break;
    allocation.quantity += 1n;
    remaining -= 1n;
  }

  return new Map(
    allocations.map((allocation) => [
      `${allocation.branchId}:${allocation.flowerId}`,
      wholeUnitsToString(allocation.quantity),
    ])
  );
}

function buildForcedAllocations(receiving, recommendations, selectedResults, branches) {
  if (!receiving) return new Map();

  const allocations = new Map();
  const branchIds = branches.map((branch) => branch.id).sort((left, right) => left - right);

  for (const item of receiving.items) {
    const totalReceived = toWholeUnits(item.acceptedQuantity);
    if (totalReceived <= 0n || !branchIds.length) continue;

    let weights = branchIds.map((branchId) => {
      const recommendation = recommendations.find(
        (entry) => entry.branchId === branchId && entry.flowerId === item.flowerId
      );
      return {
        branchId,
        flowerId: item.flowerId,
        weight: toMinorUnits(recommendation?.recommendedQuantity ?? "0"),
      };
    });

    const totalRecommended = weights.reduce((sum, entry) => sum + entry.weight, 0n);
    if (totalRecommended === 0n) {
      weights = branchIds.map((branchId) => {
        const forecast = selectedResults.find(
          (entry) => entry.branchId === branchId && entry.flowerId === item.flowerId
        );
        return {
          branchId,
          flowerId: item.flowerId,
          weight: toMinorUnits(forecast?.forecastDemand ?? "0"),
        };
      });
    }

    const totalWeight = weights.reduce((sum, entry) => sum + entry.weight, 0n);
    if (totalWeight === 0n) {
      weights = branchIds.map((branchId) => ({ branchId, flowerId: item.flowerId, weight: 1n }));
    }

    for (const [key, quantity] of allocateIntegerByWeight(totalReceived, weights)) {
      allocations.set(key, quantity);
    }
  }

  return allocations;
}

async function loadReceivingForAllocation(prismaClient, receivingId) {
  if (!receivingId) {
    const latest = await prismaClient.receiving.findFirst({
      where: { status: "COMPLETED" },
      select: { receivedDate: true },
      orderBy: [{ receivedDate: "desc" }, { id: "desc" }],
    });
    if (!latest) {
      throw new HttpError(
        409,
        "A completed receiving is required before generating a distribution plan",
      );
    }

    const receivings = await prismaClient.receiving.findMany({
      where: { status: "COMPLETED", receivedDate: latest.receivedDate },
      select: {
        items: { select: { flowerId: true, acceptedQuantity: true } },
      },
    });

    return {
      id: null,
      status: "COMPLETED",
      items: aggregateReceivingItems(receivings),
    };
  }

  const receiving = await prismaClient.receiving.findUnique({
    where: { id: receivingId },
    select: {
      id: true,
      status: true,
      items: { select: { flowerId: true, acceptedQuantity: true } },
    },
  });
  if (!receiving) throw new HttpError(404, "Receiving not found");
  if (receiving.status !== "COMPLETED") {
    throw new HttpError(409, "Only COMPLETED receiving can be allocated");
  }

  return receiving;
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
  if (!preliminarySales.length) {
    throw new Error("Daily sales history is required to generate a forecast");
  }
  const cutoffDate = preliminarySales.map((sale) => dateText(sale.salesDate)).sort().at(-1);
  const {
    horizon: selectedHorizon,
    planningDateValue,
  } = validatePlanningDate({
    planningDate: options.planningDate,
    cutoffDate,
    serverDate: jakartaDate(dependencies.now ? dependencies.now() : new Date()),
  });
  const existingPlan = await dependencies.prismaClient.distributionPlan.findFirst({
    where: { planningDate: planningDateValue },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (existingPlan) {
    throw new HttpError(409, "Distribution plan already exists for this planning date");
  }

  const receivingId = parseOptionalReceivingId(options.receivingId);
  const receiving = await loadReceivingForAllocation(dependencies.prismaClient, receivingId);

  const forecastHistory = await loadForecastHistory(dependencies.prismaClient, cutoffDate);
  const request = { forecastDate: cutoffDate, eligiblePairs: forecastHistory.eligiblePairs };
  if (options.modelVersion) request.modelVersion = options.modelVersion;

  let mlResults = [];
  let mlModelVersion = options.modelVersion ?? "hgb-v1";
  let useBaselineForAllPairs = false;
  if (forecastHistory.eligiblePairs.length) {
    try {
      const mlResponse = dependencies.responseValidator(await dependencies.forecastClient(request));
      if (mlResponse.cutoffDate !== cutoffDate) {
        throw new Error("Forecast service cutoff does not match the requested cutoff");
      }
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
  const selectedResults = results.filter((result) => result.horizon === selectedHorizon);

  const snapshot = await loadInventorySnapshot(dependencies.prismaClient);
  const recommendations = buildRecommendations(
    selectedResults,
    snapshot.branchLots,
    snapshot.inTransit,
    snapshot.headOfficeStock,
    snapshot.safetyStock
  );
  const receivedFlowerIds = new Set(
    receiving.items
      .filter((item) => toWholeUnits(item.acceptedQuantity) > 0n)
      .map((item) => item.flowerId)
  );
  const scopedRecommendations = recommendations.filter((recommendation) =>
    receivedFlowerIds.has(recommendation.flowerId)
  );
  const forcedAllocations = buildForcedAllocations(
    receiving,
    scopedRecommendations,
    selectedResults,
    forecastHistory.branches
  );

  let persisted;
  try {
    persisted = await dependencies.prismaClient.$transaction(async (tx) => {
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
          planningDate: planningDateValue,
          status: "DRAFT",
          items: {
            create: scopedRecommendations.map((recommendation) => {
              const key = `${recommendation.branchId}:${recommendation.flowerId}`;
              return {
                branchId: recommendation.branchId,
                flowerId: recommendation.flowerId,
                recommendedQuantity: recommendation.recommendedQuantity,
                ...(receiving ? { finalQuantity: forcedAllocations.get(key) ?? "0.00" } : {}),
              };
            }),
          },
        },
        select: { id: true },
      });

      return { forecastRunId: forecastRun.id, distributionPlanId: distributionPlan.id };
    });
  } catch (error) {
    if (
      error?.code === "P2002"
      && Array.isArray(error.meta?.target)
      && error.meta.target.includes("planningDate")
    ) {
      throw new HttpError(409, "Distribution plan already exists for this planning date");
    }
    throw error;
  }

  return persisted;
}

module.exports = {
  buildBaselineResults,
  buildForcedAllocations,
  buildRecommendations,
  generateForecast,
  getEligiblePairs,
  getPlanningMetadata,
  loadForecastHistory,
  loadInventorySnapshot,
};
