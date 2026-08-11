const { HttpError } = require("../utils/http-error");
const { buildPagination } = require("../utils/pagination");
const { minorUnitsToString, toMinorUnits } = require("../utils/branch-stock");

const planItemSelect = {
  id: true,
  branchId: true,
  flowerId: true,
  recommendedQuantity: true,
  finalQuantity: true,
  adjustmentReason: true,
  branch: { select: { id: true, name: true } },
  flower: { select: { id: true, name: true, variety: true } },
};

function validationError(errors) {
  throw new HttpError(422, "Validation failed", errors);
}

function parseId(value, field) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    validationError([{ field, message: `${field} must be a positive integer` }]);
  }
  return id;
}

function parseQuantity(value) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  return minorUnitsToString(toMinorUnits(normalized));
}

function getDefaultDependencies() {
  return { prismaClient: require("../lib/prisma") };
}

async function list(pagination, dependencies = getDefaultDependencies()) {
  const [data, totalItems] = await dependencies.prismaClient.$transaction([
    dependencies.prismaClient.distributionPlan.findMany({
      orderBy: [{ planningDate: "desc" }, { id: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        status: true,
        planningDate: true,
        _count: { select: { items: true } },
      },
    }),
    dependencies.prismaClient.distributionPlan.count(),
  ]);

  return { data, pagination: buildPagination(pagination.page, pagination.limit, totalItems) };
}

async function getById(idValue, dependencies = getDefaultDependencies()) {
  const id = parseId(idValue, "id");
  const data = await dependencies.prismaClient.distributionPlan.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      planningDate: true,
      items: {
        select: planItemSelect,
        orderBy: [{ branchId: "asc" }, { flowerId: "asc" }],
      },
    },
  });
  if (!data) throw new HttpError(404, "Distribution plan not found");
  return data;
}

async function updateItem(planIdValue, itemIdValue, payload, dependencies = getDefaultDependencies()) {
  const planId = parseId(planIdValue, "planId");
  const itemId = parseId(itemIdValue, "itemId");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    validationError([{ field: "body", message: "Request body must be an object" }]);
  }

  const unsupportedFields = Object.keys(payload).filter(
    (field) => !["finalQuantity", "adjustmentReason"].includes(field)
  );
  if (unsupportedFields.length) {
    validationError(unsupportedFields.map((field) => ({ field, message: "field is not supported" })));
  }
  if (!Object.hasOwn(payload, "finalQuantity")) {
    validationError([{ field: "finalQuantity", message: "finalQuantity is required" }]);
  }

  const finalQuantity = parseQuantity(payload.finalQuantity);
  if (finalQuantity === undefined) {
    validationError([{ field: "finalQuantity", message: "finalQuantity must be a non-negative decimal" }]);
  }

  const item = await dependencies.prismaClient.distributionPlanItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      recommendedQuantity: true,
      finalQuantity: true,
      distributionPlan: { select: { id: true, status: true } },
    },
  });
  if (!item || item.distributionPlan.id !== planId) {
    throw new HttpError(404, "Distribution plan item not found");
  }
  if (item.distributionPlan.status !== "DRAFT") {
    throw new HttpError(409, "Only DRAFT distribution plans can be edited");
  }

  const currentQuantity = item.finalQuantity ?? item.recommendedQuantity;
  if (toMinorUnits(finalQuantity) !== toMinorUnits(currentQuantity)) {
    const reason = typeof payload.adjustmentReason === "string" ? payload.adjustmentReason.trim() : "";
    if (!reason) {
      validationError([{ field: "adjustmentReason", message: "adjustmentReason is required when quantity changes" }]);
    }
    return dependencies.prismaClient.distributionPlanItem.update({
      where: { id: itemId },
      data: { finalQuantity, adjustmentReason: reason },
      select: planItemSelect,
    });
  }

  return dependencies.prismaClient.distributionPlanItem.update({
    where: { id: itemId },
    data: { finalQuantity },
    select: planItemSelect,
  });
}

async function finalize(idValue, dependencies = getDefaultDependencies()) {
  const id = parseId(idValue, "id");
  await dependencies.prismaClient.$transaction(async (tx) => {
    const plan = await tx.distributionPlan.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        items: { select: { id: true, recommendedQuantity: true, finalQuantity: true } },
      },
    });
    if (!plan) throw new HttpError(404, "Distribution plan not found");
    if (plan.status !== "DRAFT") {
      throw new HttpError(409, "Only DRAFT distribution plans can be finalized");
    }

    for (const item of plan.items) {
      if (item.finalQuantity === null) {
        await tx.distributionPlanItem.update({
          where: { id: item.id },
          data: { finalQuantity: item.recommendedQuantity },
        });
      }
    }

    await tx.distributionPlan.update({ where: { id }, data: { status: "FINALIZED" } });
  });

  return getById(id, dependencies);
}

module.exports = { finalize, getById, list, parseQuantity, updateItem };
