const {
  buildBaselineResults,
  getEligiblePairs,
  generateForecast,
} = require("../src/services/forecast.service");

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
    branch: {
      findMany: jest.fn().mockResolvedValue([
        { id: 1, name: "Central" },
        { id: 2, name: "New Branch" },
      ]),
    },
    flower: {
      findMany: jest.fn().mockResolvedValue([{ id: 2, name: "Rose", variety: "Red" }]),
    },
    dailySale: {
      findMany: jest.fn().mockResolvedValue([
        {
          branchId: 1,
          salesDate: "2025-06-29",
          items: [{ flowerId: 2, soldQuantity: "10.00", damagedQuantity: "0.00" }],
        },
        {
          branchId: 1,
          salesDate: "2025-06-30",
          items: [{ flowerId: 2, soldQuantity: "10.00", damagedQuantity: "0.00" }],
        },
      ]),
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
  expect(forecastClient).toHaveBeenCalledWith({
    forecastDate: "2025-06-30",
    eligiblePairs: [{ branchId: 1, flowerId: 2 }],
    modelVersion: "hgb-v1",
  });
  expect(tx.forecastRun.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ forecastMethod: "MIXED", modelVersion: "mixed" }),
    select: { id: true },
  });
  expect(tx.forecastResult.createMany).toHaveBeenCalledWith({
    data: expect.arrayContaining([
      expect.objectContaining({
        runId: 11,
        branchId: 1,
        flowerId: 2,
        forecastPeriod: "2025-07-01",
        forecastDemand: 10,
      }),
      expect.objectContaining({
        runId: 11,
        branchId: 2,
        flowerId: 2,
        forecastMethod: "BASELINE",
        modelVersion: "baseline-v1",
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
          {
            branchId: 2,
            flowerId: 2,
            recommendedQuantity: "0.00",
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

test("selects only branch and flower pairs meeting minimum history", () => {
  expect(getEligiblePairs(
    new Map([
      ["1:2", 7],
      ["2:2", 0],
      ["1:3", 6],
    ]),
    7
  )).toEqual([{ branchId: 1, flowerId: 2 }]);
});

test("builds a company-wide baseline for a branch with no history", () => {
  const rows = buildBaselineResults({
    branches: [{ id: 1, name: "Central" }, { id: 2, name: "New Branch" }],
    flowers: [{ id: 2, name: "Rose", variety: "Red" }],
    sales: [
      { branchId: 1, salesDate: "2025-07-04", items: [{ flowerId: 2, soldQuantity: "10.00", damagedQuantity: "0.00" }] },
      { branchId: 1, salesDate: "2025-07-05", items: [{ flowerId: 2, soldQuantity: "20.00", damagedQuantity: "0.00" }] },
    ],
    pairs: [{ branchId: 2, flowerId: 2 }],
    cutoffDate: "2025-07-05",
  });

  expect(rows).toHaveLength(3);
  expect(rows[0]).toEqual(expect.objectContaining({
    branchId: 2,
    flowerId: 2,
    forecastDemand: "4.29",
    forecastMethod: "BASELINE",
    modelVersion: "baseline-v1",
  }));
});
