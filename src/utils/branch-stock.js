const { HttpError } = require("./http-error");

function toMinorUnits(value) {
  const str = String(value).trim();
  const [whole, fraction = ""] = str.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
}

function minorUnitsToString(value) {
  const whole = value / 100n;
  const fraction = value % 100n;
  return `${whole}.${String(fraction).padStart(2, "0")}`;
}

async function allocateBranchLots(tx, { branchId, flowerId, quantity }) {
  const requested = toMinorUnits(quantity);
  if (requested <= 0n) {
    throw new HttpError(422, "Validation failed", [
      { field: "quantity", message: "quantity must be a positive decimal" },
    ]);
  }

  const lots = await tx.branchStockLot.findMany({
    where: {
      branchId,
      flowerId,
      quantity: { not: "0" },
    },
    orderBy: { shippedAt: "asc" },
  });

  let remaining = requested;
  const allocations = [];

  for (const lot of lots) {
    if (remaining <= 0n) break;

    const available = toMinorUnits(lot.quantity);
    const allocate = remaining < available ? remaining : available;
    const newAvailable = available - allocate;

    await tx.branchStockLot.update({
      where: { id: lot.id },
      data: { quantity: minorUnitsToString(newAvailable) },
    });

    allocations.push({
      lotId: lot.id,
      allocatedQuantity: minorUnitsToString(allocate),
      shippedAt: lot.shippedAt,
    });

    remaining -= allocate;
  }

  if (remaining > 0n) {
    const totalAvailable = lots.reduce(
      (sum, l) => sum + toMinorUnits(l.quantity),
      0n
    );
    throw new HttpError(422, "Validation failed", [
      {
        field: "quantity",
        message: `Insufficient stock: requested ${minorUnitsToString(requested)}, available ${minorUnitsToString(totalAvailable)}`,
      },
    ]);
  }

  return allocations;
}

function calculateUsableStock(lots) {
  return lots.reduce((sum, lot) => sum + toMinorUnits(lot.quantity), 0n);
}

module.exports = { allocateBranchLots, calculateUsableStock, toMinorUnits, minorUnitsToString };
