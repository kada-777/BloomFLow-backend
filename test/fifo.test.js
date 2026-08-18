const { allocateHOBatches } = require("../src/utils/fifo");

test("allocates FIFO batches with quantity movement metadata", async () => {
  const tx = {
    flowerBatch: {
      findMany: jest.fn().mockResolvedValue([
        { id: 1, batchNumber: "B-1", availableQuantity: "5.00" },
        { id: 2, batchNumber: "B-2", availableQuantity: "7.00" },
      ]),
      update: jest.fn().mockResolvedValue({}),
    },
  };

  const allocations = await allocateHOBatches(tx, { flowerId: 10, quantity: "8.00" });

  expect(allocations).toEqual([
    {
      batchId: 1,
      batchNumber: "B-1",
      allocatedQuantity: "5.00",
      qtyBefore: "5.00",
      qtyAfter: "0.00",
    },
    {
      batchId: 2,
      batchNumber: "B-2",
      allocatedQuantity: "3.00",
      qtyBefore: "7.00",
      qtyAfter: "4.00",
    },
  ]);
});
