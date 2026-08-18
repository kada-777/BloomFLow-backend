const prisma = require("../lib/prisma");
const { HttpError } = require("../utils/http-error");

const configurationDefinitions = {
  DEFAULT_SAFETY_STOCK: { type: "decimal" },
  FRESH_PERIOD: { type: "integer" },
  GRADE_C_PERIOD: { type: "integer" },
  AI_PLANNING_HORIZON: { type: "integer" },
  AI_MINIMUM_HISTORY: { type: "integer" },
};

function validationError(errors) {
  throw new HttpError(422, "Validation failed", errors);
}

function normalizeValue(key, value) {
  const definition = configurationDefinitions[key];
  if (!definition) {
    validationError([{ field: "key", message: "configuration key is not supported" }]);
  }

  if (typeof value !== "string" && typeof value !== "number") {
    validationError([{ field: "value", message: `value must be a ${definition.type}` }]);
  }

  const textValue = String(value).trim();
  const decimalPattern = /^\d+(\.\d+)?$/;
  const integerPattern = /^\d+$/;
  const isValid = definition.type === "decimal"
    ? decimalPattern.test(textValue)
    : integerPattern.test(textValue);

  if (!isValid) {
    validationError([{ field: "value", message: `value must be a ${definition.type}` }]);
  }

  return textValue;
}

async function list() {
  return prisma.systemConfiguration.findMany({
    select: {
      key: true,
      value: true,
      updatedAt: true,
      updatedBy: true,
    },
    orderBy: { key: "asc" },
  });
}

async function update(key, value, updatedBy) {
  const normalizedValue = normalizeValue(key, value);

  return prisma.systemConfiguration.upsert({
    where: { key },
    create: {
      key,
      value: normalizedValue,
      updatedBy,
    },
    update: {
      value: normalizedValue,
      updatedBy,
    },
    select: {
      key: true,
      value: true,
      updatedAt: true,
      updatedBy: true,
    },
  });
}

module.exports = { configurationDefinitions, list, normalizeValue, update };
