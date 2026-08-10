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
  const request = {};
  if (options.forecastDate) request.forecastDate = options.forecastDate;
  if (options.modelVersion) request.modelVersion = options.modelVersion;

  const response = dependencies.responseValidator(await dependencies.forecastClient(request));
  const dPlusOneResults = response.results.filter((result) => result.horizon === 1);

  const persisted = await dependencies.prismaClient.$transaction(async (tx) => {
    const snapshot = await loadInventorySnapshot(tx);
    const recommendations = buildRecommendations(
      dPlusOneResults,
      snapshot.branchLots,
      snapshot.inTransit,
      snapshot.headOfficeStock,
      snapshot.safetyStock
    );
    const forecastRun = await tx.forecastRun.create({
      data: {
        executedAt: new Date(response.results[0].generatedAt),
        modelVersion: response.modelVersion,
        forecastMethod: response.forecastMethod,
        trainingDataUntil: new Date(`${response.cutoffDate}T00:00:00.000Z`),
      },
      select: { id: true },
    });

    await tx.forecastResult.createMany({
      data: response.results.map((result) => ({
        runId: forecastRun.id,
        branchId: result.branchId,
        flowerId: result.flowerId,
        forecastDemand: result.forecastDemand,
        forecastPeriod: result.forecastDate,
      })),
    });

    const distributionPlan = await tx.distributionPlan.create({
      data: {
        planningDate: new Date(`${dPlusOneResults[0].forecastDate}T00:00:00.000Z`),
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

module.exports = { buildRecommendations, generateForecast, loadInventorySnapshot };
