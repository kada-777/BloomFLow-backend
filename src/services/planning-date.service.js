const { HttpError } = require("../utils/http-error");

const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

function jakartaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(dateText, days) {
  const date = parseDateOnly(dateText);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function planningHorizon(cutoffDate, planningDate) {
  return (parseDateOnly(planningDate) - parseDateOnly(cutoffDate)) / DAY_MS;
}

function validationError(message) {
  throw new HttpError(422, "Validation failed", [{ field: "planningDate", message }]);
}

function validatePlanningDate({ planningDate, cutoffDate, serverDate }) {
  const planningDateValue = parseDateOnly(planningDate);
  if (!planningDateValue) validationError("planningDate must use YYYY-MM-DD");
  if (planningDate < serverDate) validationError("planningDate cannot be before the server date");
  if (planningDate <= cutoffDate) validationError("planningDate must be after the Daily Sales cutoff");

  const horizon = planningHorizon(cutoffDate, planningDate);
  if (horizon < 1 || horizon > 3) {
    validationError("planningDate must be within forecast horizon 1-3");
  }

  return { planningDate, planningDateValue, horizon };
}

function dateText(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return parseDateOnly(value)?.toISOString().slice(0, 10) ?? null;
}

function getDefaultDependencies() {
  return { prismaClient: require("../lib/prisma"), now: () => new Date() };
}

async function getPlanningMetadata(dependencies = getDefaultDependencies()) {
  const serverDate = jakartaDate(dependencies.now());
  const sales = await dependencies.prismaClient.dailySale.findMany({ select: { salesDate: true } });
  const cutoffDate = sales.map(({ salesDate }) => dateText(salesDate)).filter(Boolean).sort().at(-1) ?? null;

  if (!cutoffDate) {
    return {
      serverDate,
      cutoffDate: null,
      minimumPlanningDate: null,
      maximumPlanningDate: null,
      planningDates: [],
      unavailableReason: "DAILY_SALES_REQUIRED",
    };
  }

  const minimumPlanningDate = serverDate > addDays(cutoffDate, 1) ? serverDate : addDays(cutoffDate, 1);
  const maximumPlanningDate = addDays(cutoffDate, 3);
  if (minimumPlanningDate > maximumPlanningDate) {
    return {
      serverDate,
      cutoffDate,
      minimumPlanningDate,
      maximumPlanningDate,
      planningDates: [],
      unavailableReason: "SALES_DATA_OUTDATED",
    };
  }

  const plans = await dependencies.prismaClient.distributionPlan.findMany({
    where: {
      planningDate: {
        gte: parseDateOnly(minimumPlanningDate),
        lte: parseDateOnly(maximumPlanningDate),
      },
    },
    select: { planningDate: true },
  });
  const plannedDates = new Set(plans.map(({ planningDate }) => dateText(planningDate)));
  const planningDates = [];

  for (let date = minimumPlanningDate; date <= maximumPlanningDate; date = addDays(date, 1)) {
    const hasPlan = plannedDates.has(date);
    planningDates.push({
      date,
      horizon: planningHorizon(cutoffDate, date),
      available: !hasPlan,
      reason: hasPlan ? "PLAN_ALREADY_EXISTS" : null,
    });
  }

  return {
    serverDate,
    cutoffDate,
    minimumPlanningDate,
    maximumPlanningDate,
    planningDates,
    unavailableReason: planningDates.every(({ available }) => !available) ? "ALL_DATES_HAVE_PLANS" : null,
  };
}

module.exports = { addDays, getPlanningMetadata, jakartaDate, planningHorizon, validatePlanningDate };
