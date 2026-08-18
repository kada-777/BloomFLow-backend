const prisma = require("../lib/prisma");
const { HttpError } = require("../utils/http-error");
const { minorUnitsToString, toMinorUnits } = require("../utils/branch-stock");
const distributionOrderService = require("./distribution-order.service");

function validationError(errors) {
  throw new HttpError(422, "Validation failed", errors);
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    validationError([{ field: "id", message: "id must be a positive integer" }]);
  }
  return id;
}

function normalizeQuantity(value, field, errors) {
  if (typeof value !== "string" && typeof value !== "number") {
    errors.push({ field, message: `${field} must be a non-negative decimal` });
    return undefined;
  }

  const normalized = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    errors.push({ field, message: `${field} must be a non-negative decimal` });
    return undefined;
  }

  return minorUnitsToString(toMinorUnits(normalized));
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    validationError([{ field: "body", message: "Request body must be an object" }]);
  }

  const errors = [];
  if (!Array.isArray(payload.items) || !payload.items.length) {
    validationError([{ field: "items", message: "items must contain at least one item" }]);
  }

  const flowerIds = new Set();
  const items = payload.items.map((item, index) => {
    const prefix = `items[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push({ field: prefix, message: "item must be an object" });
      return null;
    }

    const flowerId = Number(item.flowerId);
    if (!Number.isInteger(flowerId) || flowerId < 1) {
      errors.push({ field: `${prefix}.flowerId`, message: "flowerId must be a positive integer" });
    } else if (flowerIds.has(flowerId)) {
      errors.push({ field: `${prefix}.flowerId`, message: "flowerId must be unique" });
    } else {
      flowerIds.add(flowerId);
    }

    const receivedQuantity = normalizeQuantity(item.receivedQuantity, `${prefix}.receivedQuantity`, errors);
    const damagedQuantity = normalizeQuantity(item.damagedQuantity, `${prefix}.damagedQuantity`, errors);
    const missingQuantity = normalizeQuantity(item.missingQuantity, `${prefix}.missingQuantity`, errors);

    return { flowerId, receivedQuantity, damagedQuantity, missingQuantity };
  });

  if (errors.length) validationError(errors);
  return { items };
}

function shippedByFlower(allocations) {
  const quantities = new Map();
  for (const allocation of allocations) {
    const flowerId = allocation.batch.flowerId;
    quantities.set(
      flowerId,
      (quantities.get(flowerId) ?? 0n) + toMinorUnits(allocation.quantity)
    );
  }
  return quantities;
}

async function receive(idValue, payload, user, dependencies = { prismaClient: prisma }) {
  const id = parseId(idValue);
  const data = validatePayload(payload);

  await dependencies.prismaClient.$transaction(async (tx) => {
    const order = await tx.distributionOrder.findUnique({
      where: { id },
      select: {
        id: true,
        branchId: true,
        status: true,
        shippedAt: true,
        allocations: {
          select: { quantity: true, batch: { select: { flowerId: true } } },
        },
      },
    });

    if (!order) throw new HttpError(404, "Distribution order not found");
    if (order.branchId !== user?.branchId) {
      throw new HttpError(403, "You can only receive orders for your own branch");
    }
    if (order.status !== "IN_TRANSIT") {
      throw new HttpError(409, "Only IN_TRANSIT distribution orders can be received");
    }

    const shipped = shippedByFlower(order.allocations);
    const receivedFlowerIds = new Set(data.items.map((item) => item.flowerId));
    const errors = [];

    for (const flowerId of shipped.keys()) {
      if (!receivedFlowerIds.has(flowerId)) {
        errors.push({ field: "items", message: `flowerId ${flowerId} is required` });
      }
    }
    for (const flowerId of receivedFlowerIds) {
      if (!shipped.has(flowerId)) {
        errors.push({ field: "items", message: `flowerId ${flowerId} is not part of this order` });
      }
    }

    for (const item of data.items) {
      if (!shipped.has(item.flowerId)) continue;
      const total = toMinorUnits(item.receivedQuantity)
        + toMinorUnits(item.damagedQuantity)
        + toMinorUnits(item.missingQuantity);
      if (total !== shipped.get(item.flowerId)) {
        errors.push({
          field: `items[${data.items.indexOf(item)}]`,
          message: "receivedQuantity plus damagedQuantity plus missingQuantity must equal shippedQuantity",
        });
      }
    }
    if (errors.length) validationError(errors);

    const flowerIds = data.items.map((item) => item.flowerId);
    const existingLots = await tx.branchStockLot.findMany({
      where: { branchId: order.branchId, flowerId: { in: flowerIds } },
      select: { flowerId: true, quantity: true },
    });
    const stockBefore = new Map();
    for (const lot of existingLots) {
      stockBefore.set(
        lot.flowerId,
        (stockBefore.get(lot.flowerId) ?? 0n) + toMinorUnits(lot.quantity)
      );
    }

    await tx.distributionReceipt.create({
      data: {
        distributionOrderId: order.id,
        items: { create: data.items },
      },
      select: { id: true },
    });

    for (const item of data.items) {
      const received = toMinorUnits(item.receivedQuantity);
      if (received === 0n) continue;

      const before = stockBefore.get(item.flowerId) ?? 0n;
      const after = before + received;
      await tx.branchStockLot.create({
        data: {
          branchId: order.branchId,
          flowerId: item.flowerId,
          sourceOrderId: order.id,
          quantity: item.receivedQuantity,
          shippedAt: order.shippedAt,
        },
      });
      await tx.inventoryMovement.create({
        data: {
          flowerId: item.flowerId,
          locationType: "BRANCH",
          branchId: order.branchId,
          batchId: null,
          type: "DISTRIBUTION_IN",
          flowerStatus: "FRESH",
          quantity: item.receivedQuantity,
          qtyBefore: minorUnitsToString(before),
          qtyAfter: minorUnitsToString(after),
          referenceType: "DISTRIBUTION_ORDER",
          referenceId: order.id,
        },
      });
    }

    await tx.distributionOrder.update({
      where: { id: order.id },
      data: { status: "RECEIVED" },
    });
  });

  return distributionOrderService.getById(id, user, dependencies);
}

module.exports = { receive, validatePayload };
