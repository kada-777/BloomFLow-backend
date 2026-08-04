const prisma = require("../lib/prisma");

const DEFAULT_FRESH_PERIOD = 7;
const DEFAULT_GRADE_C_PERIOD = 4;

async function getAgePeriods() {
  const configs = await prisma.systemConfiguration.findMany({
    where: { key: { in: ["FRESH_PERIOD", "GRADE_C_PERIOD"] } },
    select: { key: true, value: true },
  });

  const map = new Map(configs.map((c) => [c.key, c.value]));
  const freshPeriod = parseInt(map.get("FRESH_PERIOD"), 10) || DEFAULT_FRESH_PERIOD;
  const gradeCPeriod = parseInt(map.get("GRADE_C_PERIOD"), 10) || DEFAULT_GRADE_C_PERIOD;

  return { freshPeriod, gradeCPeriod };
}

function calculateFlowerStatus(shippedAt, freshPeriod, gradeCPeriod) {
  const now = new Date();
  const diffMs = now.getTime() - new Date(shippedAt).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < freshPeriod) return "FRESH";
  if (diffDays < freshPeriod + gradeCPeriod) return "GRADE_C";
  return "DAMAGED";
}

module.exports = { calculateFlowerStatus, getAgePeriods, DEFAULT_FRESH_PERIOD, DEFAULT_GRADE_C_PERIOD };
