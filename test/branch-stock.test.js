const { allocateBranchLots, calculateUsableStock, toMinorUnits, minorUnitsToString } = require("../src/utils/branch-stock");

describe("calculateUsableStock", () => {
  test("sums lot quantities", () => {
    const lots = [
      { quantity: "50.00" },
      { quantity: "30.00" },
      { quantity: "20.00" },
    ];
    expect(calculateUsableStock(lots)).toBe(10000n);
  });

  test("returns 0n for empty lots", () => {
    expect(calculateUsableStock([])).toBe(0n);
  });
});

describe("allocateBranchLots", () => {
  function mockTx(lots) {
    const updates = [];
    const tx = {
      branchStockLot: {
        findMany: jest.fn().mockResolvedValue(lots),
        update: jest.fn().mockImplementation(({ where, data }) => {
          updates.push({ id: where.id, data });
          const lot = lots.find((l) => l.id === where.id);
          return Promise.resolve({ ...lot, ...data });
        }),
      },
    };
    return { tx, updates };
  }

  test("allocates from single lot", async () => {
    const lots = [
      { id: 1, branchId: 1, flowerId: 1, quantity: "100.00", shippedAt: new Date("2026-08-01") },
    ];
    const { tx, updates } = mockTx(lots);

    const result = await allocateBranchLots(tx, { branchId: 1, flowerId: 1, quantity: "50.00" });

    expect(result).toHaveLength(1);
    expect(result[0].allocatedQuantity).toBe("50.00");
    expect(updates[0].data.quantity).toBe("50.00");
  });

  test("allocates FIFO across multiple lots", async () => {
    const lots = [
      { id: 1, branchId: 1, flowerId: 1, quantity: "30.00", shippedAt: new Date("2026-07-28") },
      { id: 2, branchId: 1, flowerId: 1, quantity: "80.00", shippedAt: new Date("2026-08-01") },
    ];
    const { tx, updates } = mockTx(lots);

    const result = await allocateBranchLots(tx, { branchId: 1, flowerId: 1, quantity: "50.00" });

    expect(result).toHaveLength(2);
    expect(result[0].allocatedQuantity).toBe("30.00");
    expect(result[1].allocatedQuantity).toBe("20.00");
    expect(updates[0].data.quantity).toBe("0.00");
    expect(updates[1].data.quantity).toBe("60.00");
  });

  test("throws 422 when insufficient stock", async () => {
    const lots = [
      { id: 1, branchId: 1, flowerId: 1, quantity: "10.00", shippedAt: new Date("2026-08-01") },
    ];
    const { tx } = mockTx(lots);

    try {
      await allocateBranchLots(tx, { branchId: 1, flowerId: 1, quantity: "50.00" });
      fail("should have thrown");
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.errors[0].message).toContain("Insufficient stock");
    }
  });

  test("throws 422 when quantity is zero", async () => {
    const { tx } = mockTx([]);

    try {
      await allocateBranchLots(tx, { branchId: 1, flowerId: 1, quantity: "0.00" });
      fail("should have thrown");
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.errors[0].message).toBe("quantity must be a positive decimal");
    }
  });
});
