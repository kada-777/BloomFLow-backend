const orderService = require("../src/services/distribution-order.service");

function makePrisma() {
  return {
    distributionPlan: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    distributionOrder: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

test("creates one DRAFT order per branch from a FINALIZED plan", async () => {
  const prismaClient = makePrisma();
  prismaClient.$transaction = jest.fn(async (callback) => callback(prismaClient));
  prismaClient.distributionPlan.findUnique.mockResolvedValue({
    id: 9,
    status: "FINALIZED",
    items: [
      { branchId: 3, flowerId: 10, recommendedQuantity: "10.00", finalQuantity: "8.00" },
      { branchId: 3, flowerId: 20, recommendedQuantity: "5.00", finalQuantity: null },
      { branchId: 4, flowerId: 10, recommendedQuantity: "4.00", finalQuantity: "4.00" },
    ],
  });
  prismaClient.distributionOrder.create
    .mockResolvedValueOnce({ id: 101 })
    .mockResolvedValueOnce({ id: 102 });

  await expect(orderService.createOrders(9, { prismaClient })).resolves.toEqual({
    planId: 9,
    orders: [
      { orderId: 101, branchId: 3, status: "DRAFT" },
      { orderId: 102, branchId: 4, status: "DRAFT" },
    ],
  });
  expect(prismaClient.distributionOrder.create).toHaveBeenNthCalledWith(1, {
    data: { distributionPlanId: 9, branchId: 3, status: "DRAFT" },
    select: { id: true },
  });
  expect(prismaClient.distributionPlan.update).toHaveBeenCalledWith({
    where: { id: 9 },
    data: { status: "ORDER_CREATED" },
  });
});

test("cancels a DRAFT distribution order", async () => {
  const prismaClient = makePrisma();
  prismaClient.$transaction = jest.fn(async (callback) => callback(prismaClient));
  prismaClient.distributionOrder.findUnique
    .mockResolvedValueOnce({ id: 101, status: "DRAFT" })
    .mockResolvedValueOnce({ id: 101, status: "CANCELLED" });
  prismaClient.distributionOrder.update.mockResolvedValue({ id: 101, status: "CANCELLED" });

  await expect(orderService.cancel(101, { prismaClient })).resolves.toEqual({
    id: 101,
    status: "CANCELLED",
  });
  expect(prismaClient.distributionOrder.update).toHaveBeenCalledWith({
    where: { id: 101 },
    data: { status: "CANCELLED" },
  });
});
