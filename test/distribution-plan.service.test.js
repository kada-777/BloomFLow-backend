const { HttpError } = require("../src/utils/http-error");
const planService = require("../src/services/distribution-plan.service");

function makePrisma() {
  return {
    distributionPlan: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    distributionPlanItem: {
      findUnique: jest.fn(),
      update: jest.fn(),
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
