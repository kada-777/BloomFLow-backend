const prisma = require("../lib/prisma");
const { calculateFlowerStatus, getAgePeriods } = require("../utils/flower-status");
const { minorUnitsToString, toMinorUnits } = require("../utils/branch-stock");
const { paginateArray } = require("../utils/pagination");

async function getHOStock(pagination) {
  const grouped = await prisma.flowerBatch.groupBy({
    by: ["flowerId"],
    where: {
      status: "AVAILABLE",
      availableQuantity: { not: "0" },
    },
    _sum: { availableQuantity: true },
  });

  if (grouped.length === 0) return paginateArray([], pagination);

  const flowerIds = grouped.map((g) => g.flowerId);
  const flowers = await prisma.flower.findMany({
    where: { id: { in: flowerIds } },
    select: { id: true, name: true, variety: true },
  });

  const flowerMap = new Map(flowers.map((f) => [f.id, f]));

  const data = grouped.map((g) => {
    const flower = flowerMap.get(g.flowerId);
    return {
      flowerId: g.flowerId,
      flowerName: flower?.name ?? null,
      variety: flower?.variety ?? null,
      totalAvailable: g._sum.availableQuantity ?? "0",
    };
  });

  return paginateArray(data, pagination);
}

async function getBranchStock(pagination) {
  const lots = await prisma.branchStockLot.findMany({
    where: { quantity: { not: "0" } },
    select: {
      branchId: true,
      flowerId: true,
      quantity: true,
      shippedAt: true,
    },
    orderBy: [{ branchId: "asc" }, { flowerId: "asc" }, { shippedAt: "asc" }],
  });

  if (lots.length === 0) return paginateArray([], pagination);

  const { freshPeriod, gradeCPeriod } = await getAgePeriods();

  const flowerIds = [...new Set(lots.map((l) => l.flowerId))];
  const branchIds = [...new Set(lots.map((l) => l.branchId))];

  const [flowers, branches] = await Promise.all([
    prisma.flower.findMany({
      where: { id: { in: flowerIds } },
      select: { id: true, name: true, variety: true },
    }),
    prisma.branch.findMany({
      where: { id: { in: branchIds } },
      select: { id: true, name: true },
    }),
  ]);

  const flowerMap = new Map(flowers.map((f) => [f.id, f]));
  const branchMap = new Map(branches.map((b) => [b.id, b]));

  const result = [];

  for (const lot of lots) {
    const flower = flowerMap.get(lot.flowerId);
    const branch = branchMap.get(lot.branchId);
    const status = calculateFlowerStatus(lot.shippedAt, freshPeriod, gradeCPeriod);

    result.push({
      branchId: lot.branchId,
      branchName: branch?.name ?? null,
      flowerId: lot.flowerId,
      flowerName: flower?.name ?? null,
      variety: flower?.variety ?? null,
      quantity: lot.quantity,
      shippedAt: lot.shippedAt,
      flowerStatus: status,
    });
  }

  return paginateArray(result, pagination);
}

async function getMyBranchStock(branchId, pagination) {
  const lots = await prisma.branchStockLot.findMany({
    where: {
      branchId,
      quantity: { not: "0" },
    },
    select: {
      flowerId: true,
      quantity: true,
      shippedAt: true,
    },
    orderBy: [{ flowerId: "asc" }, { shippedAt: "asc" }],
  });

  if (lots.length === 0) return paginateArray([], pagination);

  const { freshPeriod, gradeCPeriod } = await getAgePeriods();

  const flowerIds = [...new Set(lots.map((l) => l.flowerId))];
  const flowers = await prisma.flower.findMany({
    where: { id: { in: flowerIds } },
    select: { id: true, name: true, variety: true },
  });

  const flowerMap = new Map(flowers.map((f) => [f.id, f]));

  const grouped = new Map();

  for (const lot of lots) {
    const status = calculateFlowerStatus(lot.shippedAt, freshPeriod, gradeCPeriod);
    const flower = flowerMap.get(lot.flowerId);
    const key = lot.flowerId;

    if (!grouped.has(key)) {
      grouped.set(key, {
        flowerId: lot.flowerId,
        flowerName: flower?.name ?? null,
        variety: flower?.variety ?? null,
      totalQuantity: 0n,
        lots: [],
      });
    }

    const entry = grouped.get(key);
    entry.totalQuantity += toMinorUnits(lot.quantity);

    entry.lots.push({
      quantity: lot.quantity,
      shippedAt: lot.shippedAt,
      flowerStatus: status,
    });
  }

  const data = Array.from(grouped.values()).map((entry) => ({
    ...entry,
    totalQuantity: minorUnitsToString(entry.totalQuantity),
  }));

  return paginateArray(data, pagination);
}

module.exports = { getHOStock, getBranchStock, getMyBranchStock };
