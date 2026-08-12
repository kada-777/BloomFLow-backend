const prisma = require("../lib/prisma");
const { HttpError } = require("../utils/http-error");
const { buildPagination, parsePagination } = require("../utils/pagination");

const VALID_RANGES = new Set([7, 30, 60]);
const ADDITION_TYPES = new Set(["RECEIVING_IN", "DISTRIBUTION_IN"]);
const REMOVAL_TYPES = new Set(["DISTRIBUTION_OUT", "SALE_OUT", "DAMAGED_OUT"]);

function getDateRange(daysValue) {
  const days = Number(daysValue);
  if (!VALID_RANGES.has(days)) {
    throw new HttpError(422, "Validation failed", [
      { field: "days", message: "days must be one of 7, 30, or 60" },
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

function sumMovement(movements, predicate) {
  return movements
    .filter(predicate)
    .reduce((total, movement) => total + number(movement.quantity), 0);
}

async function getHeadOfficeDashboard(daysValue, activityPageValue = "1", activityLimitValue = "10", branchIdValue) {
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
  const [sales, receivings, movements, openingMovements, totalBranches, totalFarms] = await Promise.all([
    prisma.dailySale.findMany({
      where: { salesDate: { gte: dateFrom, lt: dateTo }, ...branchFilter },
      select: { id: true, salesDate: true, branch: { select: { name: true } }, _count: { select: { items: true } } },
      orderBy: [{ salesDate: "desc" }, { id: "desc" }],
    }),
    prisma.receiving.findMany({
      where: { receivedDate: { gte: dateFrom, lt: dateTo } },
      select: { id: true, receivedDate: true, farm: { select: { name: true } }, _count: { select: { items: true } } },
      orderBy: [{ receivedDate: "desc" }, { id: "desc" }],
    }),
    prisma.inventoryMovement.findMany({
      where: { createdAt: { gte: dateFrom, lt: dateTo }, ...branchFilter },
      select: { id: true, type: true, quantity: true, flowerStatus: true, locationType: true, createdAt: true, flower: { select: { name: true, variety: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    prisma.inventoryMovement.findMany({
      where: { createdAt: { lt: dateFrom }, ...branchFilter },
      select: { type: true, quantity: true, locationType: true },
    }),
    prisma.branch.count(),
    prisma.farm.count(),
  ]);

  const headOfficeAdded = sumMovement(movements, (movement) => movement.locationType === "HO" && movement.type === "RECEIVING_IN");
  const headOfficeRemoved = sumMovement(movements, (movement) => movement.locationType === "HO" && REMOVAL_TYPES.has(movement.type));
  const branchAdded = sumMovement(movements, (movement) => movement.locationType === "BRANCH" && ADDITION_TYPES.has(movement.type));
  const branchRemoved = sumMovement(movements, (movement) => movement.locationType === "BRANCH" && REMOVAL_TYPES.has(movement.type));
  const headOfficeOpening = sumMovement(openingMovements, (movement) => movement.locationType === "HO" && movement.type === "RECEIVING_IN")
    - sumMovement(openingMovements, (movement) => movement.locationType === "HO" && REMOVAL_TYPES.has(movement.type));
  const branchOpening = sumMovement(openingMovements, (movement) => movement.locationType === "BRANCH" && ADDITION_TYPES.has(movement.type))
    - sumMovement(openingMovements, (movement) => movement.locationType === "BRANCH" && REMOVAL_TYPES.has(movement.type));

  const statusTotals = new Map([["FRESH", 0], ["GRADE_C", 0], ["DAMAGED", 0]]);
  movements.forEach((movement) => {
    statusTotals.set(movement.flowerStatus, (statusTotals.get(movement.flowerStatus) || 0) + number(movement.quantity));
  });
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
    period: { days, dateFrom: dateFrom.toISOString(), dateTo: new Date(dateTo.getTime() - 1).toISOString() },
    summary: {
      totalBranches,
      totalFarms,
      headOfficeStock: headOfficeOpening + headOfficeAdded - headOfficeRemoved,
      totalBranchStock: branchOpening + branchAdded - branchRemoved,
      stockAdded: headOfficeAdded + branchAdded,
      stockRemoved: headOfficeRemoved + branchRemoved,
      totalSales: sales.length,
      totalReceivings: receivings.length,
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

module.exports = { getHeadOfficeDashboard };
