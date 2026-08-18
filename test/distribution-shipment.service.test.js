const shipmentService = require("../src/services/distribution-shipment.service");

function makeTransactionClient(planItems, options = {}) {
  return {
    distributionPlan: {
      findUnique: jest.fn().mockResolvedValue({
        id: 9,
        status: options.status || "ORDER_CREATED",
        items: planItems,
        orders: options.orders || [
          { id: 101, branchId: 3, status: "DRAFT" },
          { id: 102, branchId: 4, status: "DRAFT" },
        ],
      }),
      update: jest.fn().mockResolvedValue({ id: 9, status: "ORDER_CREATED" }),
    },
    distributionOrder: {
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    distributionBatchAllocation: {
      create: jest.fn().mockResolvedValue({}),
    },
    inventoryMovement: {
      create: jest.fn().mockResolvedValue({}),
    },
    flowerBatch: {
      findMany: jest.fn().mockImplementation(({ where }) => {
        const batches = where.flowerId === 10
          ? [{ id: 1, batchNumber: "B-1", availableQuantity: "12.00" }]
          : [{ id: 2, batchNumber: "B-2", availableQuantity: "8.00" }];
        return Promise.resolve(batches);
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

test("ships every DRAFT order in a plan transactionally", async () => {
  const transactionClient = makeTransactionClient([
    { id: 1, branchId: 3, flowerId: 10, finalQuantity: "10.00" },
    { id: 2, branchId: 4, flowerId: 20, finalQuantity: "5.00" },
  ]);
  const prismaClient = {
    $transaction: jest.fn(async (callback) => callback(transactionClient)),
  };

  const result = await shipmentService.shipPlan(9, { prismaClient });

  expect(result).toEqual({
    planId: 9,
    orders: [
      { orderId: 101, branchId: 3, status: "IN_TRANSIT" },
      { orderId: 102, branchId: 4, status: "IN_TRANSIT" },
    ],
  });
  expect(transactionClient.distributionOrder.create).not.toHaveBeenCalled();
  expect(transactionClient.inventoryMovement.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      flowerId: 10,
      locationType: "HO",
      branchId: null,
      type: "DISTRIBUTION_OUT",
      referenceType: "DISTRIBUTION_ORDER",
      referenceId: 101,
    }),
  });
  expect(transactionClient.distributionOrder.update).toHaveBeenCalledTimes(2);
  expect(prismaClient.$transaction).toHaveBeenCalledWith(
    expect.any(Function),
    { timeout: 120000 }
  );
});

test("rejects shipment when any plan item lacks stock", async () => {
  const transactionClient = makeTransactionClient([
    { id: 1, branchId: 3, flowerId: 10, finalQuantity: "20.00" },
  ]);
  const prismaClient = {
    $transaction: jest.fn(async (callback) => callback(transactionClient)),
  };

  await expect(shipmentService.shipPlan(9, { prismaClient })).rejects.toMatchObject({
    statusCode: 422,
  });
  expect(transactionClient.distributionPlan.update).not.toHaveBeenCalled();
});

test("rejects a plan that is not ORDER_CREATED", async () => {
  const transactionClient = makeTransactionClient([], { status: "FINALIZED" });
  const prismaClient = {
    $transaction: jest.fn(async (callback) => callback(transactionClient)),
  };

  await expect(shipmentService.shipPlan(9, { prismaClient })).rejects.toMatchObject({
    statusCode: 409,
  });
});

test("rejects a plan without DRAFT orders", async () => {
  const transactionClient = makeTransactionClient([], { orders: [] });
  const prismaClient = {
    $transaction: jest.fn(async (callback) => callback(transactionClient)),
  };

  await expect(shipmentService.shipPlan(9, { prismaClient })).rejects.toMatchObject({
    statusCode: 409,
  });
  expect(transactionClient.distributionOrder.update).not.toHaveBeenCalled();
});

test("ships a DRAFT order using quantities from its linked finalized plan", async () => {
  const transactionClient = makeTransactionClient([]);
  transactionClient.distributionOrder.findUnique = jest.fn().mockResolvedValue({
    id: 101,
    branchId: 3,
    status: "DRAFT",
    distributionPlan: {
      id: 9,
      items: [{ branchId: 3, flowerId: 10, finalQuantity: "10.00", recommendedQuantity: "8.00" }],
    },
  });
  transactionClient.distributionOrder.update.mockResolvedValue({ id: 101, status: "IN_TRANSIT" });
  transactionClient.distributionPlan = undefined;
  const prismaClient = {
    $transaction: jest.fn(async (callback) => callback(transactionClient)),
  };

  await expect(shipmentService.shipOrder(101, { prismaClient })).resolves.toEqual({
    orderId: 101,
    branchId: 3,
    status: "IN_TRANSIT",
  });
  expect(transactionClient.distributionOrder.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 101 },
    data: expect.objectContaining({ status: "IN_TRANSIT", shippedAt: expect.any(Date) }),
  }));
});
