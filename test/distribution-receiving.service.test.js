const receivingService = require("../src/services/distribution-receiving.service");

function makePrisma() {
  return {
    distributionOrder: { findUnique: jest.fn(), update: jest.fn() },
    distributionReceipt: { create: jest.fn() },
    branchStockLot: { findMany: jest.fn(), create: jest.fn() },
    inventoryMovement: { create: jest.fn() },
    $transaction: jest.fn(),
  };
}

const branchUser = { role: "STAFF_BRANCH", branchId: 7 };
const order = {
  id: 11,
  branchId: 7,
  status: "IN_TRANSIT",
  shippedAt: new Date("2026-08-11T10:00:00.000Z"),
  allocations: [
    { quantity: "60.00", batch: { flowerId: 2 } },
    { quantity: "40.00", batch: { flowerId: 2 } },
    { quantity: "20.00", batch: { flowerId: 3 } },
  ],
};

function validPayload() {
  return {
    items: [
      { flowerId: 2, receivedQuantity: "80.00", damagedQuantity: "15.00", missingQuantity: "5.00" },
      { flowerId: 3, receivedQuantity: "20.00", damagedQuantity: "0.00", missingQuantity: "0.00" },
    ],
  };
}

function setupTransaction(prismaClient) {
  prismaClient.$transaction.mockImplementation(async (callback) => callback(prismaClient));
  prismaClient.distributionOrder.findUnique
    .mockResolvedValueOnce(order)
    .mockResolvedValueOnce({ ...order, status: "RECEIVED" });
  prismaClient.branchStockLot.findMany.mockResolvedValue([
    { flowerId: 2, quantity: "10.00" },
    { flowerId: 3, quantity: "4.00" },
  ]);
  prismaClient.distributionReceipt.create.mockResolvedValue({ id: 91 });
  prismaClient.distributionOrder.update.mockResolvedValue({ id: 11, status: "RECEIVED" });
}

test("receives an in-transit order and records only usable stock", async () => {
  const prismaClient = makePrisma();
  setupTransaction(prismaClient);

  await receivingService.receive(11, validPayload(), branchUser, { prismaClient });

  expect(prismaClient.distributionReceipt.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      distributionOrderId: 11,
      items: { create: expect.arrayContaining([
        expect.objectContaining({ flowerId: 2, receivedQuantity: "80.00", damagedQuantity: "15.00", missingQuantity: "5.00" }),
      ]) },
    }),
  }));
  expect(prismaClient.branchStockLot.create).toHaveBeenCalledTimes(2);
  expect(prismaClient.branchStockLot.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ branchId: 7, flowerId: 2, sourceOrderId: 11, quantity: "80.00" }),
  }));
  expect(prismaClient.inventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      flowerId: 2,
      branchId: 7,
      type: "DISTRIBUTION_IN",
      quantity: "80.00",
      qtyBefore: "10.00",
      qtyAfter: "90.00",
      referenceId: 11,
    }),
  }));
  expect(prismaClient.distributionOrder.update).toHaveBeenCalledWith({
    where: { id: 11 },
    data: { status: "RECEIVED" },
  });
});

test("rejects quantities that do not reconcile to shipped quantity", async () => {
  const prismaClient = makePrisma();
  const payload = validPayload();
  payload.items[0].missingQuantity = "6.00";
  prismaClient.$transaction.mockImplementation(async (callback) => callback(prismaClient));
  prismaClient.distributionOrder.findUnique.mockResolvedValue(order);

  await expect(receivingService.receive(11, payload, branchUser, { prismaClient }))
    .rejects.toMatchObject({ statusCode: 422 });
});

test("rejects a branch user receiving another branch's order", async () => {
  const prismaClient = makePrisma();
  prismaClient.$transaction.mockImplementation(async (callback) => callback(prismaClient));
  prismaClient.distributionOrder.findUnique.mockResolvedValue({ ...order, branchId: 8 });

  await expect(receivingService.receive(11, validPayload(), branchUser, { prismaClient }))
    .rejects.toMatchObject({ statusCode: 403 });
});

test("rejects an order that is not IN_TRANSIT", async () => {
  const prismaClient = makePrisma();
  prismaClient.$transaction.mockImplementation(async (callback) => callback(prismaClient));
  prismaClient.distributionOrder.findUnique.mockResolvedValue({ ...order, status: "RECEIVED" });

  await expect(receivingService.receive(11, validPayload(), branchUser, { prismaClient }))
    .rejects.toMatchObject({ statusCode: 409 });
});
