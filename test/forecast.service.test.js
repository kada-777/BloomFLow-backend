const { generateForecast } = require("../src/services/forecast.service");

function forecastResponse() {
  return {
    cutoffDate: "2025-06-30",
    forecastMethod: "ML",
    modelVersion: "hgb-v1",
    results: [1, 2, 3].map((horizon) => ({
      branchId: 1,
      branchName: "Central",
      flowerId: 2,
      flowerName: "Rose",
      forecastDate: `2025-07-0${horizon}`,
      horizon,
      forecastDemand: 10,
      forecastMethod: "ML",
      modelName: "HistGradientBoostingRegressor",
      modelVersion: "hgb-v1",
      generatedAt: "2025-06-30T12:00:00+00:00",
    })),
  };
}

test("persists forecasts and creates a capped D+1 draft plan in one transaction", async () => {
  const tx = {
    systemConfiguration: {
      findUnique: jest.fn().mockResolvedValue({ value: "2" }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    branchStockLot: {
      findMany: jest.fn().mockResolvedValue([{ branchId: 1, flowerId: 2, quantity: "5.00" }]),
    },
    distributionBatchAllocation: {
      findMany: jest.fn().mockResolvedValue([
        {
          quantity: "1.00",
          batch: { flowerId: 2 },
          distributionOrder: { branchId: 1 },
        },
      ]),
    },
    flowerBatch: {
      groupBy: jest.fn().mockResolvedValue([{ flowerId: 2, _sum: { availableQuantity: "4.00" } }]),
    },
    forecastRun: {
      create: jest.fn().mockResolvedValue({ id: 11 }),
    },
    forecastResult: {
      createMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
    distributionPlan: {
      create: jest.fn().mockResolvedValue({ id: 22 }),
    },
  };
  const prismaClient = {
    $transaction: jest.fn(async (callback) => callback(tx)),
  };
  const forecastClient = jest.fn().mockResolvedValue(forecastResponse());
  const responseValidator = jest.fn((response) => response);

  const result = await generateForecast(
    { forecastDate: "2025-06-30", modelVersion: "hgb-v1" },
    { prismaClient, forecastClient, responseValidator }
  );

  expect(result).toEqual({ forecastRunId: 11, distributionPlanId: 22 });
  expect(tx.forecastResult.createMany).toHaveBeenCalledWith({
    data: expect.arrayContaining([
      expect.objectContaining({
        runId: 11,
        branchId: 1,
        flowerId: 2,
        forecastPeriod: "2025-07-01",
        forecastDemand: 10,
      }),
    ]),
  });
  expect(tx.distributionPlan.create).toHaveBeenCalledWith({
    data: {
      planningDate: new Date("2025-07-01T00:00:00.000Z"),
      status: "DRAFT",
      items: {
        create: [
          {
            branchId: 1,
            flowerId: 2,
            recommendedQuantity: "4.00",
          },
        ],
      },
    },
    select: { id: true },
  });
});

test("excludes damaged branch stock from recommendation inventory", async () => {
  const tx = {
    systemConfiguration: {
      findUnique: jest.fn().mockResolvedValue({ value: "0" }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    branchStockLot: {
      findMany: jest.fn().mockResolvedValue([
        { branchId: 1, flowerId: 2, quantity: "100.00", shippedAt: new Date("2020-01-01") },
        { branchId: 1, flowerId: 2, quantity: "5.00", shippedAt: new Date(Date.now() + 86400000) },
      ]),
    },
    distributionBatchAllocation: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    flowerBatch: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };

  const { loadInventorySnapshot } = require("../src/services/forecast.service");
  const snapshot = await loadInventorySnapshot(tx);

  expect(snapshot.branchLots).toHaveLength(1);
  expect(snapshot.branchLots[0].quantity).toBe("5.00");
});
