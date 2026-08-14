jest.mock("../src/lib/prisma", () => ({
  dailySale: { findMany: jest.fn() },
  receiving: { findMany: jest.fn() },
  inventoryMovement: { findMany: jest.fn() },
  distributionOrder: { count: jest.fn() },
  branch: { count: jest.fn() },
  farm: { count: jest.fn() },
  dailySaleItem: { findMany: jest.fn() },
  receivingItem: { aggregate: jest.fn() },
  branchStockLot: { findMany: jest.fn() },
  systemConfiguration: { findMany: jest.fn() },
}));

const prisma = require("../src/lib/prisma");
const { getBranchDashboard, getHeadOfficeDashboard } = require("../src/services/dashboard.service");

test("includes in-transit orders for the selected branch", async () => {
  prisma.dailySale.findMany.mockResolvedValue([]);
  prisma.receiving.findMany.mockResolvedValue([]);
  prisma.inventoryMovement.findMany.mockResolvedValue([]);
  prisma.branch.count.mockResolvedValue(2);
  prisma.farm.count.mockResolvedValue(1);
  prisma.dailySaleItem.findMany.mockResolvedValue([]);
  prisma.distributionOrder.count.mockResolvedValue(3);

  const dashboard = await getHeadOfficeDashboard(7, "1", "10", 4);

  expect(dashboard.summary.flowersInTransit).toBe(3);
  expect(prisma.distributionOrder.count).toHaveBeenCalledWith({
    where: { branchId: 4, status: "IN_TRANSIT" },
  });
});

test("excludes damaged branch lots from currently stock", async () => {
  prisma.dailySale.findMany.mockResolvedValue([]);
  prisma.receiving.findMany.mockResolvedValue([]);
  prisma.inventoryMovement.findMany.mockResolvedValue([]);
  prisma.branchStockLot.findMany.mockResolvedValue([
    { quantity: 40, shippedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    { quantity: 30, shippedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    { quantity: 20, shippedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) },
  ]);
  prisma.systemConfiguration.findMany.mockResolvedValue([
    { key: "FRESH_PERIOD", value: "7" },
    { key: "GRADE_C_PERIOD", value: "4" },
  ]);
  prisma.branch.count.mockResolvedValue(0);
  prisma.farm.count.mockResolvedValue(0);
  prisma.dailySaleItem.findMany.mockResolvedValue([]);
  prisma.distributionOrder.count.mockResolvedValue(0);

  const dashboard = await getBranchDashboard(7, "1", "10", 4);

  expect(dashboard.summary.totalBranchStock).toBe(70);
});

test("returns period stock activity separately from current stock", async () => {
  prisma.dailySale.findMany.mockResolvedValue([]);
  prisma.receiving.findMany.mockResolvedValue([]);
  prisma.inventoryMovement.findMany
    .mockResolvedValueOnce([
      { type: "RECEIVING_IN", quantity: 100, flowerStatus: "FRESH", locationType: "HO" },
      { type: "DISTRIBUTION_IN", quantity: 40, flowerStatus: "FRESH", locationType: "BRANCH" },
      { type: "SALE_OUT", quantity: 10, flowerStatus: "FRESH", locationType: "BRANCH" },
    ])
    .mockResolvedValueOnce([
      { type: "RECEIVING_IN", quantity: 200, locationType: "HO" },
      { type: "DISTRIBUTION_OUT", quantity: 50, locationType: "HO" },
      { type: "DISTRIBUTION_IN", quantity: 50, locationType: "BRANCH" },
    ]);
  prisma.branch.count.mockResolvedValue(2);
  prisma.farm.count.mockResolvedValue(1);
  prisma.dailySaleItem.findMany.mockResolvedValue([]);
  prisma.distributionOrder.count.mockResolvedValue(0);

  const dashboard = await getHeadOfficeDashboard(7);

  expect(dashboard.summary.headOfficeStock).toBe(250);
  expect(dashboard.summary.totalBranchStock).toBe(80);
  expect(dashboard.summary.headOfficeStockAdded).toBe(100);
  expect(dashboard.summary.headOfficeStockRemoved).toBe(0);
  expect(dashboard.summary.headOfficeNetStockActivity).toBe(100);
  expect(dashboard.summary.totalBranchStockAdded).toBe(40);
  expect(dashboard.summary.totalBranchStockRemoved).toBe(10);
  expect(dashboard.summary.totalBranchNetStockActivity).toBe(30);
  expect(dashboard.summary.branchStockReceived).toBe(40);
  expect(dashboard.summary.branchStockOut).toBe(10);
  expect(dashboard.summary.branchSoldOut).toBe(10);
  expect(dashboard.summary.branchDamagedOut).toBe(0);
});

test("returns head office receiving, distribution out, and damaged stock for the period", async () => {
  prisma.dailySale.findMany.mockResolvedValue([]);
  prisma.receiving.findMany.mockResolvedValue([]);
  prisma.inventoryMovement.findMany.mockResolvedValueOnce([
    { type: "RECEIVING_IN", quantity: 100, flowerStatus: "FRESH", locationType: "HO" },
    { type: "DISTRIBUTION_OUT", quantity: 35, flowerStatus: "FRESH", locationType: "HO" },
  ]).mockResolvedValueOnce([]);
  prisma.branch.count.mockResolvedValue(1);
  prisma.farm.count.mockResolvedValue(1);
  prisma.dailySaleItem.findMany.mockResolvedValue([]);
  prisma.distributionOrder.count.mockResolvedValue(0);
  prisma.receivingItem.aggregate.mockResolvedValue({ _sum: { unusableQuantity: 12 } });

  const dashboard = await getHeadOfficeDashboard(30);

  expect(dashboard.summary.headOfficeReceivedStock).toBe(100);
  expect(dashboard.summary.headOfficeStockOut).toBe(35);
  expect(dashboard.summary.headOfficeDamagedStock).toBe(12);
  expect(prisma.receivingItem.aggregate).toHaveBeenCalledWith({
    where: { receiving: { receivedDate: { gte: expect.any(Date), lt: expect.any(Date) } } },
    _sum: { unusableQuantity: true },
  });
});

test("accepts today as a one-day dashboard period", async () => {
  prisma.dailySale.findMany.mockResolvedValue([]);
  prisma.receiving.findMany.mockResolvedValue([]);
  prisma.inventoryMovement.findMany.mockResolvedValue([]);
  prisma.branch.count.mockResolvedValue(1);
  prisma.farm.count.mockResolvedValue(1);
  prisma.dailySaleItem.findMany.mockResolvedValue([]);
  prisma.distributionOrder.count.mockResolvedValue(0);
  prisma.receivingItem.aggregate.mockResolvedValue({ _sum: { unusableQuantity: 0 } });

  const dashboard = await getHeadOfficeDashboard("today");

  expect(dashboard.period.days).toBe(1);
  expect(new Date(dashboard.period.dateTo).getTime() - new Date(dashboard.period.dateFrom).getTime())
    .toBe(24 * 60 * 60 * 1000 - 1);
});
