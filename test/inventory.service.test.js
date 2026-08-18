jest.mock("../src/lib/prisma", () => ({
  flower: { findUnique: jest.fn() },
  branchStockLot: { findMany: jest.fn() },
  distributionBatchAllocation: { findMany: jest.fn() },
  distributionOrder: { findMany: jest.fn() },
}));

jest.mock("../src/utils/flower-status", () => ({
  calculateFlowerStatus: jest.fn(() => "FRESH"),
  getAgePeriods: jest.fn().mockResolvedValue({ freshPeriod: 7, gradeCPeriod: 14 }),
}));

const prisma = require("../src/lib/prisma");
const { getMyBranchFlowerDetail } = require("../src/services/inventory.service");

test("uses branch receipt date for inventory detail instead of source batch date", async () => {
  prisma.flower.findUnique.mockResolvedValue({ id: 1, name: "Rose", variety: "Red" });
  prisma.branchStockLot.findMany.mockResolvedValue([
    {
      id: 10,
      quantity: "20",
      shippedAt: new Date("2026-08-12T00:00:00.000Z"),
      sourceOrderId: 50,
    },
  ]);
  prisma.distributionBatchAllocation.findMany.mockResolvedValue([
    {
      distributionOrderId: 50,
      id: 1,
      batch: { batchNumber: "B20251004-1", receivedDate: new Date("2025-10-04T00:00:00.000Z") },
    },
  ]);
  prisma.distributionOrder.findMany.mockResolvedValue([
    { id: 50, receipt: { receivedAt: new Date("2026-08-13T00:00:00.000Z") } },
  ]);

  const detail = await getMyBranchFlowerDetail(1, 1);

  expect(detail.lots[0].receivedAt).toEqual(new Date("2026-08-13T00:00:00.000Z"));
  expect(detail.lots[0].shippedAt).toEqual(new Date("2026-08-12T00:00:00.000Z"));
  expect(detail.lots[0].sourceBatches[0].receivedDate).toEqual(new Date("2025-10-04T00:00:00.000Z"));
});
