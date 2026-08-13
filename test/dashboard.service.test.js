jest.mock("../src/lib/prisma", () => ({
  dailySale: { findMany: jest.fn() },
  receiving: { findMany: jest.fn() },
  inventoryMovement: { findMany: jest.fn() },
  distributionOrder: { count: jest.fn() },
  branch: { count: jest.fn() },
  farm: { count: jest.fn() },
  dailySaleItem: { findMany: jest.fn() },
}));

const prisma = require("../src/lib/prisma");
const { getHeadOfficeDashboard } = require("../src/services/dashboard.service");

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
