jest.mock("../src/lib/prisma", () => ({
  dailySale: { findMany: jest.fn() },
  receiving: { findMany: jest.fn() },
  distributionOrder: { count: jest.fn() },
  branch: { count: jest.fn() },
  farm: { count: jest.fn() },
  dailySaleItem: { findMany: jest.fn(), aggregate: jest.fn() },
  receivingItem: { aggregate: jest.fn() },
  flowerBatch: { aggregate: jest.fn() },
  distributionBatchAllocation: { aggregate: jest.fn() },
  distributionReceiptItem: { aggregate: jest.fn() },
  branchStockLot: { findMany: jest.fn() },
  systemConfiguration: { findMany: jest.fn() },
}));

const prisma = require("../src/lib/prisma");
const { getBranchDashboard, getHeadOfficeDashboard } = require("../src/services/dashboard.service");

beforeEach(() => {
  jest.resetAllMocks();
  prisma.dailySale.findMany.mockResolvedValue([]);
  prisma.receiving.findMany.mockResolvedValue([]);
  prisma.distributionOrder.count.mockResolvedValue(0);
  prisma.branch.count.mockResolvedValue(0);
  prisma.farm.count.mockResolvedValue(0);
  prisma.dailySaleItem.findMany.mockResolvedValue([]);
  prisma.dailySaleItem.aggregate.mockResolvedValue({ _sum: { soldQuantity: null, damagedQuantity: null } });
  prisma.receivingItem.aggregate.mockResolvedValue({ _sum: { acceptedQuantity: null, unusableQuantity: null } });
  prisma.flowerBatch.aggregate.mockResolvedValue({ _sum: { availableQuantity: null } });
  prisma.distributionBatchAllocation.aggregate.mockResolvedValue({ _sum: { quantity: null } });
  prisma.distributionReceiptItem.aggregate.mockResolvedValue({ _sum: { receivedQuantity: null } });
  prisma.branchStockLot.findMany.mockResolvedValue([]);
  prisma.systemConfiguration.findMany.mockResolvedValue([
    { key: "FRESH_PERIOD", value: "7" },
    { key: "GRADE_C_PERIOD", value: "4" },
  ]);
});

test("includes in-transit orders for the selected branch", async () => {
  prisma.dailySale.findMany.mockResolvedValue([]);
  prisma.receiving.findMany.mockResolvedValue([]);
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

test("returns canonical current inventory balances and flower status", async () => {
  prisma.flowerBatch.aggregate.mockResolvedValue({ _sum: { availableQuantity: 125 } });
  prisma.branchStockLot.findMany.mockResolvedValue([
    { quantity: 40, shippedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    { quantity: 30, shippedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    { quantity: 20, shippedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) },
  ]);

  const dashboard = await getHeadOfficeDashboard(7);

  expect(dashboard.summary.headOfficeStock).toBe(125);
  expect(dashboard.summary.totalBranchStock).toBe(70);
  expect(dashboard.flowerStatus).toEqual([
    { key: "FRESH", label: "Fresh", value: 40, color: "#6e8b6b" },
    { key: "GRADE_C", label: "Grade C", value: 30, color: "#c99a3d" },
    { key: "DAMAGED", label: "Damaged", value: 20, color: "#c75c5c" },
  ]);
});

test("queries current stock lots for the selected branch", async () => {
  await getHeadOfficeDashboard(7, "1", "10", 4);

  expect(prisma.branchStockLot.findMany).toHaveBeenCalledWith({
    where: { branchId: 4, quantity: { not: "0" } },
    select: { quantity: true, shippedAt: true },
  });
});

test("returns period stock activity separately from current stock", async () => {
  prisma.flowerBatch.aggregate.mockResolvedValue({ _sum: { availableQuantity: 250 } });
  prisma.branchStockLot.findMany.mockResolvedValue([
    { quantity: 80, shippedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
  ]);
  prisma.receivingItem.aggregate.mockResolvedValue({ _sum: { acceptedQuantity: 100, unusableQuantity: 12 } });
  prisma.distributionBatchAllocation.aggregate.mockResolvedValue({ _sum: { quantity: 35 } });
  prisma.distributionReceiptItem.aggregate.mockResolvedValue({ _sum: { receivedQuantity: 40 } });
  prisma.dailySaleItem.aggregate.mockResolvedValue({ _sum: { soldQuantity: 10, damagedQuantity: 3 } });

  const dashboard = await getHeadOfficeDashboard(7);

  expect(dashboard.summary.headOfficeStock).toBe(250);
  expect(dashboard.summary.totalBranchStock).toBe(80);
  expect(dashboard.summary.headOfficeStockAdded).toBe(100);
  expect(dashboard.summary.headOfficeStockRemoved).toBe(35);
  expect(dashboard.summary.headOfficeNetStockActivity).toBe(65);
  expect(dashboard.summary.totalBranchStockAdded).toBe(40);
  expect(dashboard.summary.totalBranchStockRemoved).toBe(13);
  expect(dashboard.summary.totalBranchNetStockActivity).toBe(27);
  expect(dashboard.summary.branchStockReceived).toBe(40);
  expect(dashboard.summary.branchStockOut).toBe(13);
  expect(dashboard.summary.branchSoldOut).toBe(10);
  expect(dashboard.summary.branchDamagedOut).toBe(3);
  expect(dashboard.summary.headOfficeReceivedStock).toBe(100);
  expect(dashboard.summary.headOfficeStockOut).toBe(35);
  expect(dashboard.summary.headOfficeDamagedStock).toBe(12);
  expect(dashboard.summary.stockAdded).toBe(140);
  expect(dashboard.summary.stockRemoved).toBe(48);
});

test("uses business transaction dates and the selected branch for period aggregates", async () => {
  await getHeadOfficeDashboard(30, "1", "10", 4);

  const range = { gte: expect.any(Date), lt: expect.any(Date) };
  expect(prisma.receivingItem.aggregate).toHaveBeenCalledWith({
    where: { receiving: { receivedDate: range } },
    _sum: { acceptedQuantity: true, unusableQuantity: true },
  });
  expect(prisma.distributionBatchAllocation.aggregate).toHaveBeenCalledWith({
    where: { distributionOrder: { shippedAt: range, branchId: 4 } },
    _sum: { quantity: true },
  });
  expect(prisma.distributionReceiptItem.aggregate).toHaveBeenCalledWith({
    where: { distributionReceipt: { receivedAt: range, distributionOrder: { branchId: 4 } } },
    _sum: { receivedQuantity: true },
  });
  expect(prisma.dailySaleItem.aggregate).toHaveBeenCalledWith({
    where: { dailySale: { salesDate: range, branchId: 4 } },
    _sum: { soldQuantity: true, damagedQuantity: true },
  });
});

test("keeps head office activity zero on a branch dashboard", async () => {
  prisma.receivingItem.aggregate.mockResolvedValue({ _sum: { acceptedQuantity: 100, unusableQuantity: 12 } });
  prisma.distributionBatchAllocation.aggregate.mockResolvedValue({ _sum: { quantity: 35 } });
  prisma.distributionReceiptItem.aggregate.mockResolvedValue({ _sum: { receivedQuantity: 40 } });
  prisma.dailySaleItem.aggregate.mockResolvedValue({ _sum: { soldQuantity: 10, damagedQuantity: 3 } });

  const dashboard = await getBranchDashboard(7, "1", "10", 4);

  expect(dashboard.summary.headOfficeStockAdded).toBe(0);
  expect(dashboard.summary.headOfficeStockRemoved).toBe(0);
  expect(dashboard.summary.headOfficeNetStockActivity).toBe(0);
  expect(dashboard.summary.headOfficeReceivedStock).toBe(0);
  expect(dashboard.summary.headOfficeStockOut).toBe(0);
  expect(dashboard.summary.totalBranchStockAdded).toBe(40);
  expect(dashboard.summary.totalBranchStockRemoved).toBe(13);
});

test("accepts today and keeps current balances when period aggregates are null", async () => {
  prisma.flowerBatch.aggregate.mockResolvedValue({ _sum: { availableQuantity: 250 } });
  prisma.branchStockLot.findMany.mockResolvedValue([
    { quantity: 80, shippedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
  ]);

  const dashboard = await getHeadOfficeDashboard("today");

  expect(dashboard.period.days).toBe(1);
  expect(new Date(dashboard.period.dateTo).getTime() - new Date(dashboard.period.dateFrom).getTime())
    .toBe(24 * 60 * 60 * 1000 - 1);
  expect(dashboard.summary.headOfficeStock).toBe(250);
  expect(dashboard.summary.totalBranchStock).toBe(80);
  expect(dashboard.summary.stockAdded).toBe(0);
  expect(dashboard.summary.stockRemoved).toBe(0);
});
