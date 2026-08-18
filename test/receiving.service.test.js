const receivingService = require("../src/services/receiving.service");

test("filters receiving records before pagination", async () => {
  const prismaClient = {
    receiving: {
      findMany: jest.fn().mockResolvedValue([
        { id: 21, receivedDate: new Date("2025-06-01T00:00:00.000Z") },
        { id: 22, receivedDate: new Date("2025-06-01T00:00:00.000Z") },
      ]),
      count: jest.fn().mockResolvedValue(12),
    },
    $transaction: jest.fn((operations) => Promise.all(operations)),
  };
  const pagination = { page: 1, limit: 10, skip: 0, take: 10 };

  const result = await receivingService.list(
    pagination,
    { receivedDate: "2025-06-01" },
    { prismaClient },
  );

  const expectedWhere = {
    receivedDate: new Date("2025-06-01T00:00:00.000Z"),
  };
  expect(prismaClient.receiving.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: expectedWhere, skip: 0, take: 10 }),
  );
  expect(prismaClient.receiving.count).toHaveBeenCalledWith({ where: expectedWhere });
  expect(result.data).toHaveLength(2);
  expect(result.pagination).toEqual(expect.objectContaining({
    page: 1,
    totalItems: 12,
    totalPages: 2,
    hasNextPage: true,
  }));
});

test("rejects an invalid receiving date filter", async () => {
  await expect(
    receivingService.list(
      { page: 1, limit: 10, skip: 0, take: 10 },
      { receivedDate: "01-06-2025" },
      { prismaClient: {} },
    ),
  ).rejects.toMatchObject({ statusCode: 422 });
});
