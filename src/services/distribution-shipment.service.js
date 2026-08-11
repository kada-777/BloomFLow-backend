const { HttpError } = require("../utils/http-error");
const { allocateHOBatches, toMinorUnits } = require("../utils/fifo");

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(422, "Validation failed", [
      { field: "id", message: "id must be a positive integer" },
    ]);
  }
  return id;
}

function getDefaultDependencies() {
  return { prismaClient: require("../lib/prisma") };
}

async function shipItemsForOrder(tx, order, items) {
  for (const item of items) {
    const quantity = item.finalQuantity ?? item.recommendedQuantity;
    if (toMinorUnits(quantity) <= 0n) continue;

    const allocations = await allocateHOBatches(tx, {
      flowerId: item.flowerId,
      quantity,
    });
    for (const allocation of allocations) {
      await tx.distributionBatchAllocation.create({
        data: {
          distributionOrderId: order.id,
          batchId: allocation.batchId,
          quantity: allocation.allocatedQuantity,
        },
      });
      await tx.inventoryMovement.create({
        data: {
          flowerId: item.flowerId,
          locationType: "HO",
          branchId: null,
          batchId: allocation.batchId,
          type: "DISTRIBUTION_OUT",
          quantity: allocation.allocatedQuantity,
          qtyBefore: allocation.qtyBefore,
          qtyAfter: allocation.qtyAfter,
          referenceType: "DISTRIBUTION_ORDER",
          referenceId: order.id,
        },
      });
    }
  }
}

async function shipOrder(idValue, dependencies = getDefaultDependencies()) {
  const orderId = parseId(idValue);

  return dependencies.prismaClient.$transaction(async (tx) => {
    const order = await tx.distributionOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        branchId: true,
        status: true,
        distributionPlan: {
          select: {
            id: true,
            items: {
              select: { branchId: true, flowerId: true, recommendedQuantity: true, finalQuantity: true },
              orderBy: { flowerId: "asc" },
            },
          },
        },
      },
    });
    if (!order) throw new HttpError(404, "Distribution order not found");
    if (order.status !== "DRAFT") {
      throw new HttpError(409, "Only DRAFT distribution orders can be shipped");
    }
    if (!order.distributionPlan) {
      throw new HttpError(409, "Distribution order is not linked to a plan");
    }

    const items = order.distributionPlan.items.filter((item) => item.branchId === order.branchId);
    await shipItemsForOrder(tx, order, items);

    await tx.distributionOrder.update({
      where: { id: order.id },
      data: { status: "IN_TRANSIT", shippedAt: new Date() },
    });

    return { orderId: order.id, branchId: order.branchId, status: "IN_TRANSIT" };
  }, { timeout: 120000 });
}

async function shipPlan(idValue, dependencies = getDefaultDependencies()) {
  const planId = parseId(idValue);

  return dependencies.prismaClient.$transaction(async (tx) => {
    const plan = await tx.distributionPlan.findUnique({
      where: { id: planId },
      select: {
        id: true,
        status: true,
        items: {
          select: {
            id: true,
            branchId: true,
            flowerId: true,
            recommendedQuantity: true,
            finalQuantity: true,
          },
          orderBy: [{ branchId: "asc" }, { flowerId: "asc" }],
        },
        orders: {
          where: { status: "DRAFT" },
          select: { id: true, branchId: true, status: true },
          orderBy: { branchId: "asc" },
        },
      },
    });
    if (!plan) throw new HttpError(404, "Distribution plan not found");
    if (plan.status !== "ORDER_CREATED") {
      throw new HttpError(409, "Only ORDER_CREATED distribution plans can be shipped");
    }
    if (!plan.orders.length) {
      throw new HttpError(409, "Distribution plan has no DRAFT orders to ship");
    }

    const shippedAt = new Date();
    const orders = [];
    for (const order of plan.orders) {
      const items = plan.items.filter((item) => item.branchId === order.branchId);
      await shipItemsForOrder(tx, order, items);
      await tx.distributionOrder.update({
        where: { id: order.id },
        data: { status: "IN_TRANSIT", shippedAt },
      });
      orders.push({
        orderId: order.id,
        branchId: order.branchId,
        status: "IN_TRANSIT",
      });
    }

    return { planId, orders };
  }, { timeout: 120000 });
}

module.exports = { shipOrder, shipPlan };
