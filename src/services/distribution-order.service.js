const prisma = require("../lib/prisma");
const { HttpError } = require("../utils/http-error");
const { buildPagination } = require("../utils/pagination");

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(422, "Validation failed", [
      { field: "id", message: "id must be a positive integer" },
    ]);
  }
  return id;
}

const orderDetailSelect = {
  id: true,
  distributionPlanId: true,
  branchId: true,
  status: true,
  shippedAt: true,
  branch: { select: { id: true, name: true, location: true } },
  distributionPlan: {
    select: {
      id: true,
      planningDate: true,
      items: {
        select: {
          branchId: true,
          flowerId: true,
          recommendedQuantity: true,
          finalQuantity: true,
          flower: { select: { id: true, name: true, variety: true } },
        },
      },
    },
  },
  allocations: {
    select: {
      id: true,
      quantity: true,
      batch: {
        select: {
          id: true,
          batchNumber: true,
          flowerId: true,
          flower: { select: { id: true, name: true, variety: true } },
        },
      },
    },
    orderBy: { id: "asc" },
  },
};

const orderListSelect = {
  id: true,
  distributionPlanId: true,
  branchId: true,
  status: true,
  shippedAt: true,
  branch: { select: { id: true, name: true, location: true } },
  distributionPlan: { select: { id: true, planningDate: true } },
};

const SORTS = new Set(["newest", "branch", "status"]);
const STATUS_ORDER = new Map([
  ["DRAFT", 1],
  ["IN_TRANSIT", 2],
  ["RECEIVED", 3],
  ["CANCELLED", 4],
]);

function parseSort(value) {
  if (value === undefined) return "newest";
  if (typeof value !== "string" || !SORTS.has(value)) {
    throw new HttpError(422, "Validation failed", [
      { field: "sort", message: "sort must be one of newest, branch, or status" },
    ]);
  }
  return value;
}

function orderByFor(sort) {
  if (sort === "branch") return [{ branch: { name: "asc" } }, { id: "desc" }];
  return [{ id: "desc" }];
}

async function list(pagination, user, sortValue, dependencies = { prismaClient: prisma }) {
  const sort = parseSort(sortValue);
  const where = user?.role === "STAFF_BRANCH" ? { branchId: user.branchId } : {};

  if (sort === "status") {
    const [rows, totalItems] = await dependencies.prismaClient.$transaction([
      dependencies.prismaClient.distributionOrder.findMany({
        where,
        orderBy: orderByFor(sort),
        select: orderListSelect,
      }),
      dependencies.prismaClient.distributionOrder.count({ where }),
    ]);
    const data = rows
      .sort((left, right) => (
        (STATUS_ORDER.get(left.status) || 99) - (STATUS_ORDER.get(right.status) || 99)
        || right.id - left.id
      ))
      .slice(pagination.skip, pagination.skip + pagination.take);

    return { data, pagination: { ...buildPagination(pagination.page, pagination.limit, totalItems), sort } };
  }

  const [data, totalItems] = await dependencies.prismaClient.$transaction([
    dependencies.prismaClient.distributionOrder.findMany({
      where,
      orderBy: orderByFor(sort),
      skip: pagination.skip,
      take: pagination.take,
      select: orderListSelect,
    }),
    dependencies.prismaClient.distributionOrder.count({ where }),
  ]);

  return { data, pagination: { ...buildPagination(pagination.page, pagination.limit, totalItems), sort } };
}

async function getById(idValue, user, dependencies = { prismaClient: prisma }) {
  const id = parseId(idValue);
  const order = await dependencies.prismaClient.distributionOrder.findUnique({
    where: { id },
    select: orderDetailSelect,
  });

  if (!order) throw new HttpError(404, "Distribution order not found");

  if (user?.role === "STAFF_BRANCH" && order.branchId !== user.branchId) {
    throw new HttpError(404, "Distribution order not found");
  }

  if (!order.distributionPlan) return order;

  return {
    ...order,
    distributionPlan: {
      id: order.distributionPlan.id,
      planningDate: order.distributionPlan.planningDate,
    },
    items: order.distributionPlan.items
      .filter((item) => item.branchId === order.branchId)
      .map((item) => ({
        flowerId: item.flowerId,
        recommendedQuantity: item.recommendedQuantity,
        finalQuantity: item.finalQuantity,
        flower: item.flower,
      })),
  };
}

async function createOrders(idValue, dependencies = { prismaClient: prisma }) {
  const planId = parseId(idValue);

  return dependencies.prismaClient.$transaction(async (tx) => {
    const plan = await tx.distributionPlan.findUnique({
      where: { id: planId },
      select: {
        id: true,
        status: true,
        items: {
          select: { branchId: true, recommendedQuantity: true, finalQuantity: true },
        },
      },
    });
    if (!plan) throw new HttpError(404, "Distribution plan not found");
    if (plan.status !== "FINALIZED") {
      throw new HttpError(409, "Only FINALIZED distribution plans can create orders");
    }

    const branchIds = [...new Set(
      plan.items
        .filter((item) => Number(item.finalQuantity ?? item.recommendedQuantity) > 0)
        .map((item) => item.branchId)
    )].sort((left, right) => left - right);
    const orders = [];
    for (const branchId of branchIds) {
      const order = await tx.distributionOrder.create({
        data: { distributionPlanId: plan.id, branchId, status: "DRAFT" },
        select: { id: true },
      });
      orders.push({ orderId: order.id, branchId, status: "DRAFT" });
    }

    await tx.distributionPlan.update({
      where: { id: plan.id },
      data: { status: "ORDER_CREATED" },
    });

    return { planId: plan.id, orders };
  });
}

async function cancel(idValue, dependencies = { prismaClient: prisma }) {
  const id = parseId(idValue);

  await dependencies.prismaClient.$transaction(async (tx) => {
    const order = await tx.distributionOrder.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!order) throw new HttpError(404, "Distribution order not found");
    if (order.status !== "DRAFT") {
      throw new HttpError(409, "Only DRAFT distribution orders can be cancelled");
    }

    await tx.distributionOrder.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  });

  return getById(id, null, dependencies);
}

module.exports = { cancel, createOrders, getById, list, orderByFor, parseId, parseSort };
