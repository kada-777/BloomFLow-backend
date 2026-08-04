const prisma = require("../lib/prisma");
const { calculateFlowerStatus, getAgePeriods } = require("../utils/flower-status");

async function getHOStock() {
  const grouped = await prisma.flowerBatch.groupBy({
    by: ["flowerId"],
    where: {
      status: "AVAILABLE",
      availableQuantity: { not: "0" },
    },
    _sum: { availableQuantity: true },
  });

  if (grouped.length === 0) return [];

  const flowerIds = grouped.map((g) => g.flowerId);
  const flowers = await prisma.flower.findMany({
    where: { id: { in: flowerIds } },
    select: { id: true, name: true, variety: true },
  });

  const flowerMap = new Map(flowers.map((f) => [f.id, f]));

  return grouped.map((g) => {
    const flower = flowerMap.get(g.flowerId);
    return {
      flowerId: g.flowerId,
      flowerName: flower?.name ?? null,
      variety: flower?.variety ?? null,
      totalAvailable: g._sum.availableQuantity ?? "0",
    };
  });
}

async function getBranchStock() {
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

  if (lots.length === 0) return [];

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

  return result;
}

async function getMyBranchStock(branchId) {
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

  if (lots.length === 0) return [];

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
        totalQuantity: "0",
        lots: [],
      });
    }

    const entry = grouped.get(key);
    entry.totalQuantity = (
      parseFloat(entry.totalQuantity) + parseFloat(lot.quantity)
    ).toFixed(2);

    entry.lots.push({
      quantity: lot.quantity,
      shippedAt: lot.shippedAt,
      flowerStatus: status,
    });
  }

  return Array.from(grouped.values());
}

module.exports = { getHOStock, getBranchStock, getMyBranchStock };
