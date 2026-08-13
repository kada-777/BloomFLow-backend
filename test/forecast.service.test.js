const {
  buildBaselineResults,
  buildForcedAllocations,
  getEligiblePairs,
  generateForecast,
} = require("../src/services/forecast.service");
const { ForecastServiceError } = require("../src/services/forecast-client");

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

test("builds forced allocations from accepted receiving quantity using recommendation weights", () => {
  const allocations = buildForcedAllocations(
    { items: [{ flowerId: 2, acceptedQuantity: "120.00" }] },
    [
      { branchId: 1, flowerId: 2, recommendedQuantity: "12.00" },
      { branchId: 2, flowerId: 2, recommendedQuantity: "18.00" },
      { branchId: 3, flowerId: 2, recommendedQuantity: "30.00" },
    ],
    [
      { branchId: 1, flowerId: 2, forecastDemand: "0.00" },
      { branchId: 2, flowerId: 2, forecastDemand: "0.00" },
      { branchId: 3, flowerId: 2, forecastDemand: "0.00" },
    ],
    [{ id: 1 }, { id: 2 }, { id: 3 }]
  );

  expect(Object.fromEntries(allocations)).toEqual({
    "1:2": "24.00",
    "2:2": "36.00",
    "3:2": "60.00",
  });
});

test("falls back to forecast demand when recommendation weights are zero", () => {
  const allocations = buildForcedAllocations(
    { items: [{ flowerId: 2, acceptedQuantity: "60.00" }] },
    [
      { branchId: 1, flowerId: 2, recommendedQuantity: "0.00" },
      { branchId: 2, flowerId: 2, recommendedQuantity: "0.00" },
    ],
    [
      { branchId: 1, flowerId: 2, forecastDemand: "10.00" },
      { branchId: 2, flowerId: 2, forecastDemand: "20.00" },
    ],
    [{ id: 1 }, { id: 2 }]
  );

  expect(Object.fromEntries(allocations)).toEqual({
    "1:2": "20.00",
    "2:2": "40.00",
  });
});

test("splits equally with integer largest-remainder rounding when recommendation and demand are zero", () => {
  const allocations = buildForcedAllocations(
    { items: [{ flowerId: 2, acceptedQuantity: "10.00" }] },
    [
      { branchId: 1, flowerId: 2, recommendedQuantity: "0.00" },
      { branchId: 2, flowerId: 2, recommendedQuantity: "0.00" },
      { branchId: 3, flowerId: 2, recommendedQuantity: "0.00" },
    ],
    [
      { branchId: 1, flowerId: 2, forecastDemand: "0.00" },
      { branchId: 2, flowerId: 2, forecastDemand: "0.00" },
      { branchId: 3, flowerId: 2, forecastDemand: "0.00" },
    ],
    [{ id: 1 }, { id: 2 }, { id: 3 }]
  );

  expect(Object.fromEntries(allocations)).toEqual({
    "1:2": "4.00",
    "2:2": "3.00",
    "3:2": "3.00",
  });
});

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
      findFirst: jest.fn().mockResolvedValue(null),
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
    ...tx,
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

test("reuses an existing distribution plan for the same planning date", async () => {
  const prismaClient = {
    dailySale: {
      findMany: jest.fn().mockResolvedValue([{ salesDate: "2025-06-30" }]),
    },
    distributionPlan: {
      findFirst: jest.fn().mockResolvedValue({ id: 77 }),
    },
    $transaction: jest.fn(),
  };
  const forecastClient = jest.fn();
  const responseValidator = jest.fn();

  await expect(
    generateForecast(
      { forecastDate: "2025-06-30", modelVersion: "hgb-v1" },
      { prismaClient, forecastClient, responseValidator }
    )
  ).resolves.toEqual({ distributionPlanId: 77, reused: true });

  expect(prismaClient.distributionPlan.findFirst).toHaveBeenCalledWith({
    where: { planningDate: new Date("2025-07-01T00:00:00.000Z") },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  expect(forecastClient).not.toHaveBeenCalled();
  expect(responseValidator).not.toHaveBeenCalled();
  expect(prismaClient.$transaction).not.toHaveBeenCalled();
});

test("rejects existing distribution plan for planning date when receivingId is provided", async () => {
  const prismaClient = {
    dailySale: {
      findMany: jest.fn().mockResolvedValue([{ salesDate: "2025-06-30" }]),
    },
    distributionPlan: {
      findFirst: jest.fn().mockResolvedValue({ id: 77 }),
    },
    $transaction: jest.fn(),
  };

  await expect(
    generateForecast(
      { forecastDate: "2025-06-30", modelVersion: "hgb-v1", receivingId: 123 },
      { prismaClient, forecastClient: jest.fn(), responseValidator: jest.fn() }
    )
  ).rejects.toMatchObject({
    statusCode: 409,
    message: "Distribution plan already exists for this planning date",
  });

  expect(prismaClient.$transaction).not.toHaveBeenCalled();
});

test("rejects invalid receivingId before opening the write transaction", async () => {
  const prismaClient = {
    dailySale: {
      findMany: jest.fn().mockResolvedValue([{ salesDate: "2025-06-30" }]),
    },
    $transaction: jest.fn(),
  };

  await expect(
    generateForecast(
      { forecastDate: "2025-06-30", receivingId: "abc" },
      { prismaClient, forecastClient: jest.fn(), responseValidator: jest.fn() }
    )
  ).rejects.toMatchObject({ statusCode: 422 });

  expect(prismaClient.$transaction).not.toHaveBeenCalled();
});

test("rejects unknown receivingId before opening the write transaction", async () => {
  const prismaClient = {
    dailySale: {
      findMany: jest.fn().mockResolvedValue([{ salesDate: "2025-06-30" }]),
    },
    distributionPlan: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    receiving: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn(),
  };

  await expect(
    generateForecast(
      { forecastDate: "2025-06-30", receivingId: 123 },
      { prismaClient, forecastClient: jest.fn(), responseValidator: jest.fn() }
    )
  ).rejects.toMatchObject({ statusCode: 404 });

  expect(prismaClient.receiving.findUnique).toHaveBeenCalledWith({
    where: { id: 123 },
    select: expect.any(Object),
  });
  expect(prismaClient.$transaction).not.toHaveBeenCalled();
});

test("persists forced finalQuantity from receiving accepted quantity", async () => {
  const tx = {
    forecastRun: { create: jest.fn().mockResolvedValue({ id: 11 }) },
    forecastResult: { createMany: jest.fn().mockResolvedValue({ count: 6 }) },
    distributionPlan: { create: jest.fn().mockResolvedValue({ id: 22 }) },
  };
  const prismaClient = {
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
        {
          branchId: 2,
          salesDate: "2025-06-29",
          items: [{ flowerId: 2, soldQuantity: "10.00", damagedQuantity: "0.00" }],
        },
        {
          branchId: 2,
          salesDate: "2025-06-30",
          items: [{ flowerId: 2, soldQuantity: "10.00", damagedQuantity: "0.00" }],
        },
      ]),
    },
    distributionPlan: { findFirst: jest.fn().mockResolvedValue(null) },
    receiving: {
      findUnique: jest.fn().mockResolvedValue({
        id: 123,
        status: "COMPLETED",
        items: [{ flowerId: 2, acceptedQuantity: "30.00" }],
      }),
    },
    branch: { findMany: jest.fn().mockResolvedValue([{ id: 1, name: "A" }, { id: 2, name: "B" }]) },
    flower: { findMany: jest.fn().mockResolvedValue([{ id: 2, name: "Rose", variety: "Red" }]) },
    systemConfiguration: {
      findUnique: jest.fn(({ where }) => Promise.resolve({ value: where.key === "AI_MINIMUM_HISTORY" ? "2" : "0" })),
      findMany: jest.fn().mockResolvedValue([]),
    },
    branchStockLot: { findMany: jest.fn().mockResolvedValue([]) },
    distributionBatchAllocation: { findMany: jest.fn().mockResolvedValue([]) },
    flowerBatch: { groupBy: jest.fn().mockResolvedValue([{ flowerId: 2, _sum: { availableQuantity: "999.00" } }]) },
    $transaction: jest.fn(async (callback) => callback(tx)),
  };
  const forecastClient = jest.fn().mockResolvedValue({
    cutoffDate: "2025-06-30",
    forecastMethod: "ML",
    modelVersion: "hgb-v1",
    results: [
      {
        branchId: 1,
        branchName: "A",
        flowerId: 2,
        flowerName: "Rose",
        forecastDate: "2025-07-01",
        horizon: 1,
        forecastDemand: 10,
        forecastMethod: "ML",
        modelVersion: "hgb-v1",
        generatedAt: "2025-06-30T12:00:00+00:00",
      },
      {
        branchId: 2,
        branchName: "B",
        flowerId: 2,
        flowerName: "Rose",
        forecastDate: "2025-07-01",
        horizon: 1,
        forecastDemand: 20,
        forecastMethod: "ML",
        modelVersion: "hgb-v1",
        generatedAt: "2025-06-30T12:00:00+00:00",
      },
    ],
  });

  await expect(
    generateForecast(
      { forecastDate: "2025-06-30", modelVersion: "hgb-v1", receivingId: 123 },
      { prismaClient, forecastClient, responseValidator: (response) => response }
    )
  ).resolves.toEqual({ forecastRunId: 11, distributionPlanId: 22 });

  expect(tx.distributionPlan.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      items: {
        create: [
          { branchId: 1, flowerId: 2, recommendedQuantity: "10.00", finalQuantity: "10.00" },
          { branchId: 2, flowerId: 2, recommendedQuantity: "20.00", finalQuantity: "20.00" },
        ],
      },
    }),
    select: { id: true },
  });
});

test("falls back to baseline when the forecast service returns HTTP 500", async () => {
  const tx = {
    systemConfiguration: {
      findUnique: jest.fn().mockResolvedValue({ value: "2" }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    branchStockLot: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    distributionBatchAllocation: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    flowerBatch: {
      groupBy: jest.fn().mockResolvedValue([{ flowerId: 2, _sum: { availableQuantity: "20.00" } }]),
    },
    forecastRun: {
      create: jest.fn().mockResolvedValue({ id: 11 }),
    },
    forecastResult: {
      createMany: jest.fn().mockResolvedValue({ count: 6 }),
    },
    distributionPlan: {
      findFirst: jest.fn().mockResolvedValue(null),
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
          items: [{ flowerId: 2, soldQuantity: "7.00", damagedQuantity: "0.00" }],
        },
        {
          branchId: 1,
          salesDate: "2025-06-30",
          items: [{ flowerId: 2, soldQuantity: "14.00", damagedQuantity: "0.00" }],
        },
      ]),
    },
  };
  const prismaClient = {
    ...tx,
    $transaction: jest.fn(async (callback) => callback(tx)),
  };
  const forecastClient = jest.fn().mockRejectedValue(
    new ForecastServiceError("Forecast service returned HTTP 500", 500)
  );
  const responseValidator = jest.fn((response) => response);

  await expect(
    generateForecast(
      { forecastDate: "2025-06-30", modelVersion: "hgb-v1" },
      { prismaClient, forecastClient, responseValidator }
    )
  ).resolves.toEqual({ forecastRunId: 11, distributionPlanId: 22 });

  expect(forecastClient).toHaveBeenCalledWith({
    forecastDate: "2025-06-30",
    eligiblePairs: [{ branchId: 1, flowerId: 2 }],
    modelVersion: "hgb-v1",
  });
  expect(responseValidator).not.toHaveBeenCalled();
  expect(tx.forecastRun.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ forecastMethod: "BASELINE", modelVersion: "baseline-v1" }),
    select: { id: true },
  });
  expect(tx.forecastResult.createMany).toHaveBeenCalledWith({
    data: expect.arrayContaining([
      expect.objectContaining({
        branchId: 1,
        flowerId: 2,
        forecastMethod: "BASELINE",
        modelVersion: "baseline-v1",
      }),
      expect.objectContaining({
        branchId: 2,
        flowerId: 2,
        forecastMethod: "BASELINE",
        modelVersion: "baseline-v1",
      }),
    ]),
  });
  expect(tx.distributionPlan.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: "DRAFT" }),
  }));
});

test("keeps forecast service and inventory reads outside the write transaction", async () => {
  const calls = [];
  const historyRows = [
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
  ];
  const writeTx = {
    forecastRun: {
      create: jest.fn(async () => {
        calls.push("write:forecastRun");
        return { id: 11 };
      }),
    },
    forecastResult: {
      createMany: jest.fn(async () => {
        calls.push("write:forecastResult");
        return { count: 3 };
      }),
    },
    distributionPlan: {
      create: jest.fn(async () => {
        calls.push("write:distributionPlan");
        return { id: 22 };
      }),
    },
  };
  const prismaClient = {
    dailySale: {
      findMany: jest.fn(async (args) => {
        calls.push(args.where ? "read:history" : "read:preliminary");
        return args.where ? historyRows : [{ salesDate: "2025-06-30" }];
      }),
    },
    branch: {
      findMany: jest.fn(async () => [{ id: 1, name: "Central" }]),
    },
    flower: {
      findMany: jest.fn(async () => [{ id: 2, name: "Rose", variety: "Red" }]),
    },
    systemConfiguration: {
      findUnique: jest.fn(async ({ where }) => (where.key === "AI_MINIMUM_HISTORY" ? { value: "2" } : { value: "0" })),
      findMany: jest.fn(async () => []),
    },
    branchStockLot: {
      findMany: jest.fn(async () => {
        calls.push("read:inventory");
        return [];
      }),
    },
    distributionBatchAllocation: {
      findMany: jest.fn(async () => []),
    },
    flowerBatch: {
      groupBy: jest.fn(async () => [{ flowerId: 2, _sum: { availableQuantity: "20.00" } }]),
    },
    distributionPlan: {
      findFirst: jest.fn(async () => null),
    },
    $transaction: jest.fn(async (callback) => {
      calls.push("transaction:start");
      return callback(writeTx);
    }),
  };
  const forecastClient = jest.fn(async () => {
    calls.push("ml");
    return forecastResponse();
  });
  const responseValidator = jest.fn((response) => response);

  await expect(
    generateForecast(
      { forecastDate: "2025-06-30", modelVersion: "hgb-v1" },
      { prismaClient, forecastClient, responseValidator }
    )
  ).resolves.toEqual({ forecastRunId: 11, distributionPlanId: 22 });

  expect(calls.indexOf("ml")).toBeLessThan(calls.indexOf("transaction:start"));
  expect(calls.indexOf("read:inventory")).toBeLessThan(calls.indexOf("transaction:start"));
  expect(writeTx.forecastRun.create).toHaveBeenCalled();
  expect(writeTx.forecastResult.createMany).toHaveBeenCalled();
  expect(writeTx.distributionPlan.create).toHaveBeenCalled();
});

test("rejects empty daily sales before opening the write transaction", async () => {
  const prismaClient = {
    dailySale: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };

  await expect(
    generateForecast({}, { prismaClient, forecastClient: jest.fn(), responseValidator: jest.fn() })
  ).rejects.toThrow("Daily sales history is required to generate a forecast");
  expect(prismaClient.$transaction).not.toHaveBeenCalled();
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
