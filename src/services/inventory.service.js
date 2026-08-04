const prisma = require("../lib/prisma");

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

module.exports = { getHOStock };
