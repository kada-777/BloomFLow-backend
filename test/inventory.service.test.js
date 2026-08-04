jest.mock("../src/lib/prisma", () => ({
  flowerBatch: { groupBy: jest.fn() },
  branchStockLot: { findMany: jest.fn() },
  flower: { findMany: jest.fn() },
  branch: { findMany: jest.fn() },
  systemConfiguration: { findMany: jest.fn() },
}));

jest.mock("../src/utils/flower-status", () => ({
  calculateFlowerStatus: jest.fn(),
  getAgePeriods: jest.fn(),
}));

const prisma = require("../src/lib/prisma");
const { getHOStock, getBranchStock, getMyBranchStock } = require("../src/services/inventory.service");
const { calculateFlowerStatus, getAgePeriods } = require("../src/utils/flower-status");

describe("getHOStock", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns aggregated stock per flower", async () => {
    prisma.flowerBatch.groupBy.mockResolvedValue([
      { flowerId: 1, _sum: { availableQuantity: "150.00" } },
      { flowerId: 2, _sum: { availableQuantity: "80.00" } },
    ]);
    prisma.flower.findMany.mockResolvedValue([
      { id: 1, name: "Rose", variety: "Red Rose" },
      { id: 2, name: "Lily", variety: "White Lily" },
    ]);

    const result = await getHOStock();

    expect(result).toEqual([
      { flowerId: 1, flowerName: "Rose", variety: "Red Rose", totalAvailable: "150.00" },
      { flowerId: 2, flowerName: "Lily", variety: "White Lily", totalAvailable: "80.00" },
    ]);
    expect(prisma.flowerBatch.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["flowerId"],
        where: expect.objectContaining({ status: "AVAILABLE" }),
      })
    );
  });

  test("returns empty array when no stock", async () => {
    prisma.flowerBatch.groupBy.mockResolvedValue([]);
    prisma.flower.findMany.mockResolvedValue([]);

    const result = await getHOStock();
    expect(result).toEqual([]);
    expect(prisma.flower.findMany).not.toHaveBeenCalled();
  });

  test("queries flower details only for flowers with stock", async () => {
    prisma.flowerBatch.groupBy.mockResolvedValue([
      { flowerId: 5, _sum: { availableQuantity: "25.00" } },
    ]);
    prisma.flower.findMany.mockResolvedValue([
      { id: 5, name: "Tulip", variety: "Red Tulip" },
    ]);

    const result = await getHOStock();

    expect(prisma.flower.findMany).toHaveBeenCalledWith({
      where: { id: { in: [5] } },
      select: { id: true, name: true, variety: true },
    });
    expect(result).toEqual([
      { flowerId: 5, flowerName: "Tulip", variety: "Red Tulip", totalAvailable: "25.00" },
    ]);
  });
});

describe("getBranchStock", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns empty array when no lots", async () => {
    prisma.branchStockLot.findMany.mockResolvedValue([]);
    const result = await getBranchStock();
    expect(result).toEqual([]);
  });

  test("returns branch stock with age status", async () => {
    prisma.branchStockLot.findMany.mockResolvedValue([
      { branchId: 1, flowerId: 1, quantity: "50.00", shippedAt: new Date("2026-07-28") },
      { branchId: 1, flowerId: 1, quantity: "30.00", shippedAt: new Date("2026-08-01") },
      { branchId: 2, flowerId: 1, quantity: "20.00", shippedAt: new Date("2026-08-02") },
    ]);
    prisma.flower.findMany.mockResolvedValue([
      { id: 1, name: "Rose", variety: "Red Rose" },
    ]);
    prisma.branch.findMany.mockResolvedValue([
      { id: 1, name: "Branch A" },
      { id: 2, name: "Branch B" },
    ]);
    getAgePeriods.mockResolvedValue({ freshPeriod: 7, gradeCPeriod: 4 });
    calculateFlowerStatus.mockReturnValue("FRESH");

    const result = await getBranchStock();

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(expect.objectContaining({
      branchId: 1,
      branchName: "Branch A",
      flowerId: 1,
      flowerName: "Rose",
      flowerStatus: "FRESH",
    }));
  });
});

describe("getMyBranchStock", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns empty array when branch has no stock", async () => {
    prisma.branchStockLot.findMany.mockResolvedValue([]);
    const result = await getMyBranchStock(1);
    expect(result).toEqual([]);
  });

  test("returns grouped branch stock with age status", async () => {
    prisma.branchStockLot.findMany.mockResolvedValue([
      { flowerId: 1, quantity: "50.00", shippedAt: new Date("2026-07-28") },
      { flowerId: 1, quantity: "30.00", shippedAt: new Date("2026-08-01") },
      { flowerId: 2, quantity: "20.00", shippedAt: new Date("2026-08-02") },
    ]);
    prisma.flower.findMany.mockResolvedValue([
      { id: 1, name: "Rose", variety: "Red Rose" },
      { id: 2, name: "Lily", variety: "White Lily" },
    ]);
    getAgePeriods.mockResolvedValue({ freshPeriod: 7, gradeCPeriod: 4 });
    calculateFlowerStatus.mockReturnValue("FRESH");

    const result = await getMyBranchStock(1);

    expect(result).toHaveLength(2);
    expect(result[0].flowerId).toBe(1);
    expect(result[0].totalQuantity).toBe("80.00");
    expect(result[0].lots).toHaveLength(2);
    expect(result[1].flowerId).toBe(2);
    expect(result[1].totalQuantity).toBe("20.00");
  });
});
