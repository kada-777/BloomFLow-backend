jest.mock("../src/lib/prisma", () => ({
  dailySale: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
  flower: { findMany: jest.fn() },
  branchStockLot: { findMany: jest.fn() },
  inventoryMovement: { create: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma = require("../src/lib/prisma");
const { validatePayload, list, getById, create } = require("../src/services/daily-sales.service");

describe("validatePayload", () => {
  test("validates required fields", () => {
    try {
      validatePayload({});
      fail("should have thrown");
    } catch (err) {
      expect(err.statusCode).toBe(422);
    }
  });

  test("validates salesDate format", () => {
    try {
      validatePayload({ salesDate: "not-a-date", items: [{ flowerId: 1, soldQuantity: "10", damagedQuantity: "0" }] });
      fail("should have thrown");
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.errors.some((e) => e.field === "salesDate")).toBe(true);
    }
  });

  test("rejects duplicate flowerId", () => {
    try {
      validatePayload({
        salesDate: "2026-08-04",
        items: [
          { flowerId: 1, soldQuantity: "10", damagedQuantity: "0" },
          { flowerId: 1, soldQuantity: "5", damagedQuantity: "0" },
        ],
      });
      fail("should have thrown");
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.errors.some((e) => e.message.includes("unique"))).toBe(true);
    }
  });

  test("normalizes valid payload", () => {
    const result = validatePayload({
      salesDate: "2026-08-04",
      items: [
        { flowerId: 1, soldQuantity: 10, damagedQuantity: 2 },
        { flowerId: 2, soldQuantity: "5.50", damagedQuantity: "0" },
      ],
    });

    expect(result.salesDate).toBe("2026-08-04");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].soldQuantity).toBe("10");
    expect(result.items[0].damagedQuantity).toBe("2");
  });
});

describe("create", () => {
  afterEach(() => jest.clearAllMocks());

  test("creates daily sales in transaction", async () => {
    prisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        dailySale: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 1 }),
        },
        flower: {
          findMany: jest.fn().mockResolvedValue([{ id: 1 }]),
        },
        branchStockLot: {
          findMany: jest.fn().mockResolvedValue([
            { id: 1, flowerId: 1, quantity: "50.00", shippedAt: new Date("2026-08-01") },
          ]),
          update: jest.fn().mockResolvedValue({}),
        },
        inventoryMovement: {
          create: jest.fn(),
        },
      };
      return fn(tx);
    });

    prisma.dailySale.findFirst.mockResolvedValue({
      id: 1,
      branchId: 1,
      salesDate: new Date("2026-08-04T00:00:00.000Z"),
      items: [],
    });

    const result = await create(1, {
      salesDate: "2026-08-04",
      items: [{ flowerId: 1, soldQuantity: "10", damagedQuantity: "2" }],
    });

    expect(result).toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  test("rejects when daily sales already exists for date", async () => {
    prisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        dailySale: {
          findUnique: jest.fn().mockResolvedValue({ id: 99 }),
        },
      };
      try {
        return await fn(tx);
      } catch (err) {
        throw err;
      }
    });

    await expect(
      create(1, {
        salesDate: "2026-08-04",
        items: [{ flowerId: 1, soldQuantity: "10", damagedQuantity: "0" }],
      })
    ).rejects.toThrow();
  });

  test("rejects when insufficient stock", async () => {
    prisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        dailySale: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
        flower: {
          findMany: jest.fn().mockResolvedValue([{ id: 1 }]),
        },
        branchStockLot: {
          findMany: jest.fn().mockResolvedValue([
            { id: 1, flowerId: 1, quantity: "5.00", shippedAt: new Date("2026-08-01") },
          ]),
        },
      };
      return fn(tx);
    });

    await expect(
      create(1, {
        salesDate: "2026-08-04",
        items: [{ flowerId: 1, soldQuantity: "10", damagedQuantity: "0" }],
      })
    ).rejects.toThrow();
  });
});

describe("list", () => {
  test("uses page offset, page size, and branch scope", async () => {
    prisma.$transaction.mockResolvedValue([[{ id: 12, branchId: 7 }], 11]);

    const result = await list(7, { page: 2, limit: 10, skip: 10, take: 10 });

    expect(prisma.dailySale.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { branchId: 7 },
      skip: 10,
      take: 10,
    }));
    expect(prisma.dailySale.count).toHaveBeenCalledWith({ where: { branchId: 7 } });
    expect(result).toEqual(expect.objectContaining({
      data: [{ id: 12, branchId: 7 }],
      pagination: expect.objectContaining({ page: 2, limit: 10, totalItems: 11, totalPages: 2 }),
    }));
  });
});
