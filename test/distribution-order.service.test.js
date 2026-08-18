const { HttpError } = require("../src/utils/http-error");
const orderService = require("../src/services/distribution-order.service");

function makePrisma() {
  return {
    distributionOrder: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(async (operations) => Promise.all(operations)),
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

test("lists orders scoped to the branch user", async () => {
  const prismaClient = makePrisma();
  prismaClient.distributionOrder.findMany.mockResolvedValue([{ id: 11, branchId: 7 }]);
  prismaClient.distributionOrder.count.mockResolvedValue(1);

  await expect(
    orderService.list({ page: 1, limit: 10, skip: 0, take: 10 }, branchUser, "newest", { prismaClient })
  ).resolves.toEqual(expect.objectContaining({
    data: [{ id: 11, branchId: 7 }],
    pagination: expect.objectContaining({ totalItems: 1 }),
  }));
  expect(prismaClient.distributionOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { branchId: 7 },
    skip: 0,
    take: 10,
  }));
});

test("supports newest and oldest sorting", () => {
  expect(orderService.orderByFor("newest")).toEqual([{ id: "desc" }]);
  expect(orderService.orderByFor("oldest")).toEqual([{ id: "asc" }]);
  expect(orderService.parseSort()).toBe("newest");
  expect(orderService.parseSort("oldest")).toBe("oldest");
  expect(() => orderService.parseSort("invalid")).toThrow();
});

test("sorts orders from oldest first", async () => {
  const prismaClient = makePrisma();
  prismaClient.distributionOrder.findMany.mockResolvedValue([
    { id: 14, status: "CANCELLED" },
    { id: 13, status: "RECEIVED" },
    { id: 12, status: "IN_TRANSIT" },
    { id: 11, status: "DRAFT" },
  ]);
  prismaClient.distributionOrder.count.mockResolvedValue(4);

  await expect(
    orderService.list({ page: 1, limit: 2, skip: 0, take: 2 }, { role: "STAFF_HEAD_OFFICE" }, "oldest", { prismaClient })
  ).resolves.toEqual(expect.objectContaining({
    data: [{ id: 14, status: "CANCELLED" }, { id: 13, status: "RECEIVED" }],
    pagination: expect.objectContaining({ totalItems: 4, totalPages: 2, sort: "oldest" }),
  }));
});

test("filters orders by status", async () => {
  const prismaClient = makePrisma();
  prismaClient.distributionOrder.findMany.mockResolvedValue([{ id: 12, status: "IN_TRANSIT" }]);
  prismaClient.distributionOrder.count.mockResolvedValue(1);

  await expect(
    orderService.list({ page: 1, limit: 10, skip: 0, take: 10 }, { role: "STAFF_HEAD_OFFICE" }, "newest", "in_transit", { prismaClient })
  ).resolves.toEqual(expect.objectContaining({ data: [{ id: 12, status: "IN_TRANSIT" }] }));
  expect(prismaClient.distributionOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { status: "IN_TRANSIT" },
  }));
});

test("rejects an invalid status filter", async () => {
  await expect(
    orderService.list({ page: 1, limit: 10, skip: 0, take: 10 }, { role: "STAFF_HEAD_OFFICE" }, "newest", "unknown", { prismaClient: makePrisma() })
  ).rejects.toMatchObject({ statusCode: 422 });
});
