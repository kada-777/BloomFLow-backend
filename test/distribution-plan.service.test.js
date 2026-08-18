const { HttpError } = require("../src/utils/http-error");
const planService = require("../src/services/distribution-plan.service");

function makePrisma() {
  return {
    distributionPlan: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    distributionPlanItem: {
      findUnique: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    distributionOrder: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(async (callback) => callback(makePrisma())),
  };
}

test("rejects editing a plan that is not DRAFT", async () => {
  const prismaClient = makePrisma();
  prismaClient.distributionPlanItem.findUnique.mockResolvedValue({
    id: 4,
    distributionPlan: { id: 2, status: "FINALIZED" },
    recommendedQuantity: "10.00",
    finalQuantity: "10.00",
  });

  await expect(
    planService.updateItem(2, 4, { finalQuantity: "8.00" }, { prismaClient })
  ).rejects.toMatchObject({ statusCode: 409 });
});

test("requires an adjustment reason when final quantity changes", async () => {
  const prismaClient = makePrisma();
  prismaClient.distributionPlanItem.findUnique.mockResolvedValue({
    id: 4,
    distributionPlan: { id: 2, status: "DRAFT" },
    recommendedQuantity: "10.00",
    finalQuantity: null,
  });

  await expect(
    planService.updateItem(2, 4, { finalQuantity: "8.00" }, { prismaClient })
  ).rejects.toMatchObject({ statusCode: 422 });
});

test("requires an adjustment reason of at least five characters", async () => {
  const prismaClient = makePrisma();
  prismaClient.distributionPlanItem.findUnique.mockResolvedValue({
    id: 4,
    distributionPlan: { id: 2, status: "DRAFT" },
    recommendedQuantity: "10.00",
    finalQuantity: null,
  });

  await expect(
    planService.updateItem(2, 4, { finalQuantity: "8.00", adjustmentReason: "low" }, { prismaClient })
  ).rejects.toMatchObject({ statusCode: 422 });
});

test("finalization fills missing final quantities and changes plan status", async () => {
  const prismaClient = makePrisma();
  const transactionClient = makePrisma();
  transactionClient.distributionPlan.findUnique.mockResolvedValue({
    id: 2,
    status: "DRAFT",
    items: [
      { id: 4, recommendedQuantity: "10.00", finalQuantity: null },
      { id: 5, recommendedQuantity: "5.00", finalQuantity: "3.00" },
    ],
  });
  transactionClient.distributionPlanItem.update.mockResolvedValue({});
  transactionClient.distributionPlan.update.mockResolvedValue({ id: 2, status: "FINALIZED" });
  prismaClient.$transaction.mockImplementation(async (callback) => callback(transactionClient));
  prismaClient.distributionPlan.findUnique.mockResolvedValue({ id: 2, status: "FINALIZED", items: [] });

  await planService.finalize(2, { prismaClient });

  expect(transactionClient.distributionPlanItem.update).toHaveBeenCalledWith({
    where: { id: 4 },
    data: { finalQuantity: "10.00" },
  });
  expect(transactionClient.distributionPlan.update).toHaveBeenCalledWith({
    where: { id: 2 },
    data: { status: "FINALIZED" },
  });
});

test("deletes an active plan with only draft orders", async () => {
  const prismaClient = makePrisma();
  const transactionClient = makePrisma();
  transactionClient.distributionPlan.findUnique.mockResolvedValue({
    id: 2,
    orders: [{ id: 10, status: "DRAFT" }],
  });
  prismaClient.$transaction.mockImplementation(async (callback) => callback(transactionClient));

  await expect(planService.remove(2, { prismaClient })).resolves.toEqual({ id: 2, deleted: true });
  expect(transactionClient.distributionOrder.deleteMany).toHaveBeenCalledWith({
    where: { distributionPlanId: 2 },
  });
  expect(transactionClient.distributionPlanItem.deleteMany).toHaveBeenCalledWith({
    where: { distributionPlanId: 2 },
  });
  expect(transactionClient.distributionPlan.delete).toHaveBeenCalledWith({
    where: { id: 2 },
  });
});

test("rejects deleting a plan with shipped orders", async () => {
  const prismaClient = makePrisma();
  const transactionClient = makePrisma();
  transactionClient.distributionPlan.findUnique.mockResolvedValue({
    id: 2,
    orders: [{ id: 10, status: "IN_TRANSIT" }],
  });
  prismaClient.$transaction.mockImplementation(async (callback) => callback(transactionClient));

  await expect(planService.remove(2, { prismaClient })).rejects.toMatchObject({ statusCode: 409 });
  expect(transactionClient.distributionPlan.delete).not.toHaveBeenCalled();
});
