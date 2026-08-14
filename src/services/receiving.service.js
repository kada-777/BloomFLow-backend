const prisma = require("../lib/prisma");
const { HttpError } = require("../utils/http-error");
const { buildPagination } = require("../utils/pagination");

function validationError(errors) {
  throw new HttpError(422, "Validation failed", errors);
}

function parsePositiveInteger(value, field, errors) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    errors.push({ field, message: `${field} must be a positive integer` });
    return undefined;
  }
  return parsed;
}

function normalizeInteger(value, field, errors) {
  if (typeof value !== "string" && typeof value !== "number") {
    errors.push({ field, message: `${field} must be a non-negative integer` });
    return undefined;
  }

  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    errors.push({ field, message: `${field} must be a non-negative integer` });
    return undefined;
  }

  return normalized;
}

function toMinorUnits(value) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    validationError([{ field: "body", message: "Request body must be an object" }]);
  }

  const errors = [];
  const farmId = parsePositiveInteger(payload.farmId, "farmId", errors);
  const receivedDate = typeof payload.receivedDate === "string" ? payload.receivedDate : "";
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!isValidDate(receivedDate)) {
    errors.push({ field: "receivedDate", message: "receivedDate must use YYYY-MM-DD" });
  }
  if (!items.length) errors.push({ field: "items", message: "items must contain at least one item" });

  const flowerIds = new Set();
  const normalizedItems = items.map((item, index) => {
    const prefix = `items[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push({ field: prefix, message: "item must be an object" });
      return null;
    }

    const flowerId = parsePositiveInteger(item.flowerId, `${prefix}.flowerId`, errors);
    if (flowerId) {
      if (flowerIds.has(flowerId)) {
        errors.push({ field: `${prefix}.flowerId`, message: "flowerId must be unique per receiving" });
      }
      flowerIds.add(flowerId);
    }

    const shippedQuantity = normalizeInteger(item.shippedQuantity, `${prefix}.shippedQuantity`, errors);
    const actualReceivedQuantity = normalizeInteger(item.actualReceivedQuantity, `${prefix}.actualReceivedQuantity`, errors);
    const acceptedQuantity = normalizeInteger(item.acceptedQuantity, `${prefix}.acceptedQuantity`, errors);
    const unusableQuantity = normalizeInteger(item.unusableQuantity, `${prefix}.unusableQuantity`, errors);
    if (item.unusableNotes !== undefined && item.unusableNotes !== null && typeof item.unusableNotes !== "string") {
      errors.push({ field: `${prefix}.unusableNotes`, message: "unusableNotes must be a string or null" });
    }
    const unusableNotes = typeof item.unusableNotes === "string" ? item.unusableNotes.trim() || null : null;

    if (shippedQuantity !== undefined && actualReceivedQuantity !== undefined
      && toMinorUnits(actualReceivedQuantity) > toMinorUnits(shippedQuantity)) {
      errors.push({ field: prefix, message: "actualReceivedQuantity cannot exceed shippedQuantity" });
    }
    if (actualReceivedQuantity !== undefined && acceptedQuantity !== undefined && unusableQuantity !== undefined
      && toMinorUnits(acceptedQuantity) + toMinorUnits(unusableQuantity) !== toMinorUnits(actualReceivedQuantity)) {
      errors.push({ field: prefix, message: "acceptedQuantity plus unusableQuantity must equal actualReceivedQuantity" });
    }

    return {
      flowerId,
      shippedQuantity,
      actualReceivedQuantity,
      acceptedQuantity,
      unusableQuantity,
      unusableNotes,
    };
  });

  if (errors.length) validationError(errors);
  return { farmId, receivedDate, items: normalizedItems };
}

const detailSelect = {
  id: true,
  farmId: true,
  receivedDate: true,
  status: true,
  farm: { select: { id: true, name: true, location: true } },
  items: {
    select: {
      id: true,
      flowerId: true,
      shippedQuantity: true,
      actualReceivedQuantity: true,
      acceptedQuantity: true,
      unusableQuantity: true,
      unusableNotes: true,
      flower: { select: { id: true, name: true, variety: true } },
    },
    orderBy: { id: "asc" },
  },
  batches: {
    select: {
      id: true,
      batchNumber: true,
      flowerId: true,
      receivedDate: true,
      initialQuantity: true,
      availableQuantity: true,
      status: true,
      flower: { select: { id: true, name: true, variety: true } },
    },
    orderBy: { id: "asc" },
  },
};

function parseReceivedDateFilter(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (!isValidDate(value)) {
    validationError([{ field: "receivedDate", message: "receivedDate must use YYYY-MM-DD" }]);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

async function list(pagination, filters = {}, dependencies = { prismaClient: prisma }) {
  const receivedDate = parseReceivedDateFilter(filters.receivedDate);
  const where = receivedDate ? { receivedDate } : {};
  const select = {
    id: true,
    farmId: true,
    receivedDate: true,
    status: true,
    farm: { select: { id: true, name: true } },
    _count: { select: { items: true, batches: true } },
  };
  const orderBy = [{ receivedDate: "desc" }, { id: "desc" }];
  const [data, totalItems] = await dependencies.prismaClient.$transaction([
    dependencies.prismaClient.receiving.findMany({
      where,
      select,
      orderBy,
      skip: pagination.skip,
      take: pagination.take,
    }),
    dependencies.prismaClient.receiving.count({ where }),
  ]);

  return { data, pagination: buildPagination(pagination.page, pagination.limit, totalItems) };
}

async function getById(idValue) {
  const id = Number(idValue);
  if (!Number.isInteger(id) || id < 1) {
    validationError([{ field: "id", message: "id must be a positive integer" }]);
  }

  const receiving = await prisma.receiving.findUnique({ where: { id }, select: detailSelect });
  if (!receiving) throw new HttpError(404, "Receiving not found");
  return receiving;
}

async function create(payload) {
  const data = validatePayload(payload);

  const receivingId = await prisma.$transaction(async (tx) => {
    const farm = await tx.farm.findUnique({ where: { id: data.farmId }, select: { id: true } });
    if (!farm) validationError([{ field: "farmId", message: "farmId is invalid" }]);

    const flowerIds = data.items.map((item) => item.flowerId);
    const flowers = await tx.flower.findMany({
      where: { id: { in: flowerIds } },
      select: { id: true },
    });
    if (flowers.length !== flowerIds.length) {
      validationError([{ field: "items", message: "one or more flowerId values are invalid" }]);
    }

    const receiving = await tx.receiving.create({
      data: {
        farmId: data.farmId,
        receivedDate: new Date(`${data.receivedDate}T00:00:00.000Z`),
        status: "COMPLETED",
        items: { create: data.items },
      },
      select: { id: true },
    });

    for (const item of data.items) {
      if (toMinorUnits(item.acceptedQuantity) === 0n) continue;

      const batch = await tx.flowerBatch.create({
        data: {
          batchNumber: `REC-${receiving.id}-${item.flowerId}`,
          receivingId: receiving.id,
          flowerId: item.flowerId,
          receivedDate: new Date(`${data.receivedDate}T00:00:00.000Z`),
          initialQuantity: item.acceptedQuantity,
          availableQuantity: item.acceptedQuantity,
          status: "AVAILABLE",
        },
        select: { id: true },
      });

      await tx.inventoryMovement.create({
        data: {
          flowerId: item.flowerId,
          locationType: "HO",
          batchId: batch.id,
          type: "RECEIVING_IN",
          flowerStatus: "FRESH",
          quantity: item.acceptedQuantity,
          qtyBefore: "0",
          qtyAfter: item.acceptedQuantity,
          referenceType: "RECEIVING",
          referenceId: receiving.id,
        },
      });
    }

    return receiving.id;
  });

  return getById(receivingId);
}

module.exports = { create, getById, list, validatePayload };
