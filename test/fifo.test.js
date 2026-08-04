const { allocateHOBatches } = require("../src/utils/fifo");

describe("allocateHOBatches", () => {
  function mockTx(batches) {
    const updates = [];
    const tx = {
      flowerBatch: {
        findMany: jest.fn().mockResolvedValue(batches),
        update: jest.fn().mockImplementation(({ where, data }) => {
          updates.push({ id: where.id, data });
          return Promise.resolve({ ...batches.find((b) => b.id === where.id), ...data });
        }),
      },
    };
    return { tx, updates };
  }

  test("allocates from single batch when sufficient", async () => {
    const batches = [
      { id: 1, batchNumber: "REC-1-1", flowerId: 1, availableQuantity: "100.00", receivedDate: new Date("2026-08-01"), createdAt: new Date("2026-08-01T10:00:00Z") },
    ];
    const { tx, updates } = mockTx(batches);

    const result = await allocateHOBatches(tx, { flowerId: 1, quantity: "50.00" });

    expect(result).toEqual([
      { batchId: 1, batchNumber: "REC-1-1", allocatedQuantity: "50.00" },
    ]);
    expect(updates[0].data.availableQuantity).toBe("50.00");
  });

  test("allocates across multiple batches FIFO", async () => {
    const batches = [
      { id: 1, batchNumber: "REC-1-1", flowerId: 1, availableQuantity: "30.00", receivedDate: new Date("2026-08-01"), createdAt: new Date("2026-08-01T10:00:00Z") },
      { id: 2, batchNumber: "REC-2-1", flowerId: 1, availableQuantity: "80.00", receivedDate: new Date("2026-08-02"), createdAt: new Date("2026-08-02T10:00:00Z") },
    ];
    const { tx, updates } = mockTx(batches);

    const result = await allocateHOBatches(tx, { flowerId: 1, quantity: "50.00" });

    expect(result).toEqual([
      { batchId: 1, batchNumber: "REC-1-1", allocatedQuantity: "30.00" },
      { batchId: 2, batchNumber: "REC-2-1", allocatedQuantity: "20.00" },
    ]);
    expect(updates[0].data.availableQuantity).toBe("0.00");
    expect(updates[0].data.status).toBe("DEPLETED");
    expect(updates[1].data.availableQuantity).toBe("60.00");
  });

  test("throws 422 when insufficient stock", async () => {
    const batches = [
      { id: 1, batchNumber: "REC-1-1", flowerId: 1, availableQuantity: "10.00", receivedDate: new Date("2026-08-01"), createdAt: new Date("2026-08-01T10:00:00Z") },
    ];
    const { tx } = mockTx(batches);

    try {
      await allocateHOBatches(tx, { flowerId: 1, quantity: "50.00" });
      fail("should have thrown");
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.errors[0].message).toContain("Insufficient stock");
    }
  });

  test("throws 422 when quantity is zero or negative", async () => {
    const { tx } = mockTx([]);

    try {
      await allocateHOBatches(tx, { flowerId: 1, quantity: "0.00" });
      fail("should have thrown");
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.errors[0].message).toBe("quantity must be a positive decimal");
    }
  });

  test("handles exact batch amount", async () => {
    const batches = [
      { id: 1, batchNumber: "REC-1-1", flowerId: 1, availableQuantity: "50.00", receivedDate: new Date("2026-08-01"), createdAt: new Date("2026-08-01T10:00:00Z") },
    ];
    const { tx, updates } = mockTx(batches);

    const result = await allocateHOBatches(tx, { flowerId: 1, quantity: "50.00" });

    expect(result).toEqual([
      { batchId: 1, batchNumber: "REC-1-1", allocatedQuantity: "50.00" },
    ]);
    expect(updates[0].data.status).toBe("DEPLETED");
  });
});
