const prisma = require("../lib/prisma");
const { HttpError } = require("../utils/http-error");
const { buildPagination, parsePagination } = require("../utils/pagination");
const { calculateFlowerStatus, getAgePeriods } = require("../utils/flower-status");

const VALID_RANGES = new Set([1, 7, 30, 60]);

function getDateRange(daysValue) {
  const days = daysValue === "today" ? 1 : Number(daysValue);
  if (!VALID_RANGES.has(days)) {
    throw new HttpError(422, "Validation failed", [
      { field: "days", message: "period must be today, 7, 30, or 60" },
    ]);
  }

  const dateTo = new Date();
  dateTo.setUTCHours(0, 0, 0, 0);
  dateTo.setUTCDate(dateTo.getUTCDate() + 1);
  const dateFrom = new Date(dateTo);
  dateFrom.setUTCDate(dateFrom.getUTCDate() - days);

  return { days, dateFrom, dateTo };
}

function number(value) {
  return Number(value || 0);
}

async function getHeadOfficeDashboard(daysValue, activityPageValue = "1", activityLimitValue = "10", branchIdValue, options = {}) {
  const { days, dateFrom, dateTo } = getDateRange(daysValue);
  const activityPagination = parsePagination({ page: activityPageValue, limit: activityLimitValue });
  const branchId = branchIdValue === undefined || branchIdValue === "all"
    ? undefined
    : Number(branchIdValue);
  if (branchIdValue !== undefined && branchIdValue !== "all" && (!Number.isInteger(branchId) || branchId < 1)) {
    throw new HttpError(422, "Validation failed", [
      { field: "branchId", message: "branchId must be a positive integer or all" },
    ]);
  }
  const branchFilter = branchId ? { branchId } : {};
  const isBranchDashboard = options.scope === "branch";
  const [sales, receivings, headOfficeBalance, branchStockLots, totalBranches, totalFarms, flowersInTransit, receivingActivity, distributionOutActivity, branchReceivingActivity, branchSaleActivity] = await Promise.all([
    prisma.dailySale.findMany({
      where: { salesDate: { gte: dateFrom, lt: dateTo }, ...branchFilter },
      select: { id: true, salesDate: true, branch: { select: { name: true } }, _count: { select: { items: true } } },
      orderBy: [{ salesDate: "desc" }, { id: "desc" }],
    }),
    prisma.receiving.findMany({
      where: isBranchDashboard ? { id: -1 } : { receivedDate: { gte: dateFrom, lt: dateTo } },
      select: { id: true, receivedDate: true, farm: { select: { name: true } }, _count: { select: { items: true } } },
      orderBy: [{ receivedDate: "desc" }, { id: "desc" }],
    }),
    isBranchDashboard
      ? Promise.resolve({ _sum: { availableQuantity: null } })
      : prisma.flowerBatch.aggregate({
        where: { status: "AVAILABLE", availableQuantity: { not: "0" } },
        _sum: { availableQuantity: true },
      }),
    prisma.branchStockLot.findMany({
      where: { ...branchFilter, quantity: { not: "0" } },
      select: { quantity: true, shippedAt: true },
    }),
    isBranchDashboard ? Promise.resolve(0) : prisma.branch.count(),
    isBranchDashboard ? Promise.resolve(0) : prisma.farm.count(),
    prisma.distributionOrder.count({ where: { ...branchFilter, status: "IN_TRANSIT" } }),
    isBranchDashboard
      ? Promise.resolve({ _sum: { acceptedQuantity: null, unusableQuantity: null } })
      : prisma.receivingItem.aggregate({
        where: { receiving: { receivedDate: { gte: dateFrom, lt: dateTo } } },
        _sum: { acceptedQuantity: true, unusableQuantity: true },
      }),
    isBranchDashboard
      ? Promise.resolve({ _sum: { quantity: null } })
      : prisma.distributionBatchAllocation.aggregate({
        where: { distributionOrder: { shippedAt: { gte: dateFrom, lt: dateTo }, ...branchFilter } },
        _sum: { quantity: true },
      }),
    prisma.distributionReceiptItem.aggregate({
      where: {
        distributionReceipt: {
          receivedAt: { gte: dateFrom, lt: dateTo },
          distributionOrder: branchFilter,
        },
      },
      _sum: { receivedQuantity: true },
    }),
    prisma.dailySaleItem.aggregate({
      where: { dailySale: { salesDate: { gte: dateFrom, lt: dateTo }, ...branchFilter } },
      _sum: { soldQuantity: true, damagedQuantity: true },
    }),
  ]);

  const headOfficeAdded = number(receivingActivity?._sum?.acceptedQuantity);
  const headOfficeRemoved = number(distributionOutActivity?._sum?.quantity);
  const branchAdded = number(branchReceivingActivity?._sum?.receivedQuantity);
  const branchSoldOut = number(branchSaleActivity?._sum?.soldQuantity);
  const branchDamagedOut = number(branchSaleActivity?._sum?.damagedQuantity);
  const branchRemoved = branchSoldOut + branchDamagedOut;
  const { freshPeriod, gradeCPeriod } = await getAgePeriods();
  const statusTotals = new Map([["FRESH", 0], ["GRADE_C", 0], ["DAMAGED", 0]]);
  branchStockLots.forEach((lot) => {
    const status = calculateFlowerStatus(lot.shippedAt, freshPeriod, gradeCPeriod);
    statusTotals.set(status, statusTotals.get(status) + number(lot.quantity));
  });
  const currentBranchStock = statusTotals.get("FRESH") + statusTotals.get("GRADE_C");
  const flowerSales = await prisma.dailySaleItem.findMany({
    where: {
      dailySale: {
        salesDate: { gte: dateFrom, lt: dateTo },
        ...branchFilter,
      },
    },
    select: { soldQuantity: true, flower: { select: { name: true, variety: true } } },
  });
  const topFlowerSalesMap = new Map();
  flowerSales.forEach((item) => {
    const name = item.flower?.variety || item.flower?.name || "Unknown flower";
    topFlowerSalesMap.set(name, (topFlowerSalesMap.get(name) || 0) + number(item.soldQuantity));
  });

  const allActivities = [
    ...sales.map((entry) => ({ id: `sale-${entry.id}`, type: "Daily sales", title: entry.branch?.name || "Daily sales submitted", detail: `${entry._count.items} flower item(s) reported`, date: entry.salesDate })),
    ...receivings.map((entry) => ({ id: `receiving-${entry.id}`, type: "Receiving", title: entry.farm?.name || "Receiving completed", detail: `${entry._count.items} flower item(s) received`, date: entry.receivedDate })),
  ].sort((left, right) => new Date(right.date) - new Date(left.date));
  const activities = allActivities.slice(activityPagination.skip, activityPagination.skip + activityPagination.take);

  return {
    period: {
      days,
      label: days === 1 && String(daysValue).toLowerCase() === "today" ? "Today" : `Last ${days} days`,
      dateFrom: dateFrom.toISOString(),
      dateTo: new Date(dateTo.getTime() - 1).toISOString(),
    },
    summary: {
      totalBranches,
      totalFarms,
      headOfficeStock: number(headOfficeBalance?._sum?.availableQuantity),
      totalBranchStock: currentBranchStock,
      headOfficeStockAdded: headOfficeAdded,
      headOfficeStockRemoved: headOfficeRemoved,
      headOfficeNetStockActivity: headOfficeAdded - headOfficeRemoved,
      totalBranchStockAdded: branchAdded,
      totalBranchStockRemoved: branchRemoved,
      totalBranchNetStockActivity: branchAdded - branchRemoved,
      branchStockReceived: branchAdded,
      branchStockOut: branchSoldOut + branchDamagedOut,
      branchSoldOut,
      branchDamagedOut,
      headOfficeReceivedStock: headOfficeAdded,
      headOfficeStockOut: headOfficeRemoved,
      headOfficeDamagedStock: number(receivingActivity?._sum?.unusableQuantity),
      stockAdded: headOfficeAdded + branchAdded,
      stockRemoved: headOfficeRemoved + branchRemoved,
      totalSales: sales.length,
      totalReceivings: receivings.length,
      flowersInTransit,
    },
    flowerStatus: ["FRESH", "GRADE_C", "DAMAGED"].map((key) => ({
      key,
      label: key === "GRADE_C" ? "Grade C" : key[0] + key.slice(1).toLowerCase(),
      value: statusTotals.get(key) || 0,
      color: key === "FRESH" ? "#6e8b6b" : key === "GRADE_C" ? "#c99a3d" : "#c75c5c",
    })),
    topFlowerSales: [...topFlowerSalesMap.entries()]
      .map(([flowerName, soldQuantity]) => ({ flowerName, soldQuantity }))
      .sort((left, right) => right.soldQuantity - left.soldQuantity)
      .slice(0, 5),
    activities,
    activitiesPagination: buildPagination(activityPagination.page, activityPagination.limit, allActivities.length),
  };
}

async function getBranchDashboard(daysValue, activityPageValue = "1", activityLimitValue = "10", branchIdValue) {
  return getHeadOfficeDashboard(daysValue, activityPageValue, activityLimitValue, branchIdValue, { scope: "branch" });
}

module.exports = { getHeadOfficeDashboard, getBranchDashboard };
