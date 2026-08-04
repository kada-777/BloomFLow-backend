jest.mock("../src/lib/prisma", () => ({
  flowerBatch: { groupBy: jest.fn() },
  flower: { findMany: jest.fn() },
}));

const prisma = require("../src/lib/prisma");
const { getHOStock } = require("../src/services/inventory.service");

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
