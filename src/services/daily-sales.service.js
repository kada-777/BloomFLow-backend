const prisma = require("../lib/prisma");
const { HttpError } = require("../utils/http-error");
const { allocateBranchLots, calculateUsableStock, toMinorUnits, minorUnitsToString } = require("../utils/branch-stock");
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

function normalizeDecimal(value, field, errors) {
  if (typeof value !== "string" && typeof value !== "number") {
    errors.push({ field, message: `${field} must be a non-negative decimal` });
    return undefined;
  }

  const normalized = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    errors.push({ field, message: `${field} must be a non-negative decimal` });
    return undefined;
  }

  return normalized;
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
  const salesDate = typeof payload.salesDate === "string" ? payload.salesDate : "";
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!isValidDate(salesDate)) {
    errors.push({ field: "salesDate", message: "salesDate must use YYYY-MM-DD" });
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
        errors.push({ field: `${prefix}.flowerId`, message: "flowerId must be unique per daily sales" });
      }
      flowerIds.add(flowerId);
    }

    const soldQuantity = normalizeDecimal(item.soldQuantity, `${prefix}.soldQuantity`, errors);
    const damagedQuantity = normalizeDecimal(item.damagedQuantity, `${prefix}.damagedQuantity`, errors);

    if (soldQuantity !== undefined && toMinorUnits(soldQuantity) < 0n) {
      errors.push({ field: `${prefix}.soldQuantity`, message: "soldQuantity must be non-negative" });
    }
    if (damagedQuantity !== undefined && toMinorUnits(damagedQuantity) < 0n) {
      errors.push({ field: `${prefix}.damagedQuantity`, message: "damagedQuantity must be non-negative" });
    }

    return {
      flowerId,
      soldQuantity: soldQuantity ?? "0",
      damagedQuantity: damagedQuantity ?? "0",
    };
  });

  if (errors.length) validationError(errors);
  return { salesDate, items: normalizedItems };
}

const detailSelect = {
  id: true,
  branchId: true,
  salesDate: true,
  items: {
    select: {
      id: true,
      flowerId: true,
      soldQuantity: true,
      damagedQuantity: true,
      flower: { select: { id: true, name: true, variety: true } },
    },
    orderBy: { id: "asc" },
  },
};

async function create(branchId, payload) {
  const data = validatePayload(payload);

  const dailySaleId = await prisma.$transaction(async (tx) => {
    const existing = await tx.dailySale.findUnique({
      where: { branchId_salesDate: { branchId, salesDate: new Date(`${data.salesDate}T00:00:00.000Z`) } },
      select: { id: true },
    });
    if (existing) {
      validationError([{ field: "salesDate", message: "daily sales already exists for this date" }]);
    }

    const flowerIds = data.items.map((item) => item.flowerId);
    const flowers = await tx.flower.findMany({
      where: { id: { in: flowerIds } },
      select: { id: true },
    });
    if (flowers.length !== flowerIds.length) {
      validationError([{ field: "items", message: "one or more flowerId values are invalid" }]);
    }

    const errors = [];
    for (const item of data.items) {
      const totalRequested = toMinorUnits(item.soldQuantity) + toMinorUnits(item.damagedQuantity);
      if (totalRequested === 0n) {
        errors.push({
          field: `items[flowerId=${item.flowerId}]`,
          message: "soldQuantity + damagedQuantity must be greater than zero",
        });
        continue;
      }

      const lots = await tx.branchStockLot.findMany({
        where: { branchId, flowerId: item.flowerId, quantity: { not: "0" } },
        orderBy: { shippedAt: "asc" },
      });
      const usableStock = calculateUsableStock(lots);

      if (totalRequested > usableStock) {
        errors.push({
          field: `items[flowerId=${item.flowerId}]`,
          message: `Insufficient stock: requested ${minorUnitsToString(totalRequested)}, available ${minorUnitsToString(usableStock)}`,
        });
      }
    }
    if (errors.length) validationError(errors);

    const dailySale = await tx.dailySale.create({
      data: {
        branchId,
        salesDate: new Date(`${data.salesDate}T00:00:00.000Z`),
        items: {
          create: data.items.map((item) => ({
            flowerId: item.flowerId,
            soldQuantity: item.soldQuantity,
            damagedQuantity: item.damagedQuantity,
          })),
        },
      },
      select: { id: true },
    });

    for (const item of data.items) {
      const soldAmt = toMinorUnits(item.soldQuantity);
      const damagedAmt = toMinorUnits(item.damagedQuantity);
      const totalDeduction = soldAmt + damagedAmt;

      if (totalDeduction === 0n) continue;

      const lots = await tx.branchStockLot.findMany({
        where: { branchId, flowerId: item.flowerId, quantity: { not: "0" } },
        orderBy: { shippedAt: "asc" },
      });

      let remaining = totalDeduction;
      const lotUpdates = [];

      for (const lot of lots) {
        if (remaining <= 0n) break;

        const available = toMinorUnits(lot.quantity);
        const deduct = remaining < available ? remaining : available;
        const newQty = available - deduct;

        lotUpdates.push(
          tx.branchStockLot.update({
            where: { id: lot.id },
            data: { quantity: minorUnitsToString(newQty) },
          })
        );

        remaining -= deduct;
      }

      await Promise.all(lotUpdates);

      if (soldAmt > 0n) {
        await tx.inventoryMovement.create({
          data: {
            flowerId: item.flowerId,
            locationType: "BRANCH",
            branchId,
            type: "SALE_OUT",
            flowerStatus: "FRESH",
            quantity: item.soldQuantity,
            qtyBefore: "0",
            qtyAfter: "0",
            referenceType: "DAILY_SALE",
            referenceId: dailySale.id,
          },
        });
      }

      if (damagedAmt > 0n) {
        await tx.inventoryMovement.create({
          data: {
            flowerId: item.flowerId,
            locationType: "BRANCH",
            branchId,
            type: "DAMAGED_OUT",
            flowerStatus: "DAMAGED",
            quantity: item.damagedQuantity,
            qtyBefore: "0",
            qtyAfter: "0",
            referenceType: "DAILY_SALE",
            referenceId: dailySale.id,
          },
        });
      }
    }

    return dailySale.id;
  });

  return getById(dailySaleId, branchId);
}

async function getById(idValue, branchId) {
  const id = Number(idValue);
  if (!Number.isInteger(id) || id < 1) {
    validationError([{ field: "id", message: "id must be a positive integer" }]);
  }

  const where = { id };
  if (branchId) where.branchId = branchId;

  const dailySale = await prisma.dailySale.findFirst({ where, select: detailSelect });
  if (!dailySale) throw new HttpError(404, "Daily sales not found");
  return dailySale;
}

async function list(branchId, pagination, sort = "default") {
  const where = {};
  if (branchId) where.branchId = branchId;

  const select = {
    id: true,
    branchId: true,
    salesDate: true,
    branch: { select: { id: true, name: true } },
    items: {
      select: {
        id: true,
        flowerId: true,
        soldQuantity: true,
        damagedQuantity: true,
        flower: { select: { id: true, name: true, variety: true } },
      },
      orderBy: { id: "asc" },
    },
    _count: { select: { items: true } },
  };
  const orderBy = sort === "oldest"
    ? [{ salesDate: "asc" }, { id: "asc" }]
    : [{ salesDate: "desc" }, { id: "desc" }];
  const [data, totalItems] = await prisma.$transaction([
    prisma.dailySale.findMany({ where, select, orderBy, skip: pagination.skip, take: pagination.take }),
    prisma.dailySale.count({ where }),
  ]);

  return { data, pagination: buildPagination(pagination.page, pagination.limit, totalItems) };
}

module.exports = { create, getById, list, validatePayload };
