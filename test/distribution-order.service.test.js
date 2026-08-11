const { HttpError } = require("../src/utils/http-error");
const orderService = require("../src/services/distribution-order.service");

function makePrisma() {
  return {
    distributionOrder: {
      findUnique: jest.fn(),
    },
  };
}

const branchUser = { role: "STAFF_BRANCH", branchId: 7 };

test("returns order details with branch and flower allocations", async () => {
  const prismaClient = makePrisma();
  const order = {
    id: 11,
    branchId: 7,
    status: "IN_TRANSIT",
    shippedAt: new Date("2026-08-11T10:00:00.000Z"),
    branch: { id: 7, name: "Central", location: "Downtown" },
    allocations: [
      {
        id: 21,
        quantity: "12.00",
        batch: {
          id: 31,
          batchNumber: "REC-4-2",
          flowerId: 2,
          flower: { id: 2, name: "Rose", variety: "Red" },
        },
      },
    ],
  };
  prismaClient.distributionOrder.findUnique.mockResolvedValue(order);

  await expect(orderService.getById(11, branchUser, { prismaClient })).resolves.toEqual(order);
  expect(prismaClient.distributionOrder.findUnique).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 11 },
    select: expect.objectContaining({ allocations: expect.any(Object) }),
  }));
});

test("does not expose another branch's order", async () => {
  const prismaClient = makePrisma();
  prismaClient.distributionOrder.findUnique.mockResolvedValue({ id: 11, branchId: 8 });

  await expect(orderService.getById(11, branchUser, { prismaClient })).rejects.toMatchObject({
    statusCode: 404,
  });
});

test("allows head-office users to view any order", async () => {
  const prismaClient = makePrisma();
  const order = { id: 11, branchId: 8 };
  prismaClient.distributionOrder.findUnique.mockResolvedValue(order);

  await expect(
    orderService.getById(11, { role: "STAFF_HEAD_OFFICE" }, { prismaClient })
  ).resolves.toEqual(order);
});

test("rejects an invalid order ID", async () => {
  await expect(orderService.getById("not-an-id", branchUser, { prismaClient: makePrisma() }))
    .rejects.toBeInstanceOf(HttpError);
});
