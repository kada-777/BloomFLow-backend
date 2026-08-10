const { HttpError } = require("../utils/http-error");
const { allocateHOBatches, minorUnitsToString, toMinorUnits } = require("../utils/fifo");

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
      },
    });
    if (!plan) throw new HttpError(404, "Distribution plan not found");
    if (plan.status !== "FINALIZED") {
      throw new HttpError(409, "Only FINALIZED distribution plans can be shipped");
    }

    const orders = [];
    for (const item of plan.items) {
      const quantity = item.finalQuantity ?? item.recommendedQuantity;
      if (toMinorUnits(quantity) <= 0n) continue;

      const order = await tx.distributionOrder.create({
        data: { branchId: item.branchId, status: "DRAFT" },
        select: { id: true },
      });
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

      const shippedAt = new Date();
      await tx.distributionOrder.update({
        where: { id: order.id },
        data: { status: "IN_TRANSIT", shippedAt },
      });
      orders.push({
        orderId: order.id,
        branchId: item.branchId,
        flowerId: item.flowerId,
        quantity: minorUnitsToString(toMinorUnits(quantity)),
        status: "IN_TRANSIT",
      });
    }

    await tx.distributionPlan.update({
      where: { id: planId },
      data: { status: "ORDER_CREATED" },
    });

    return { planId, orders };
  }, { timeout: 120000 });
}

module.exports = { shipPlan };
