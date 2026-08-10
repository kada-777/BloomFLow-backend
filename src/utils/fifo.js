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

async function allocateHOBatches(tx, { flowerId, quantity }) {
  const requested = toMinorUnits(quantity);
  if (requested <= 0n) {
    throw new HttpError(422, "Validation failed", [
      { field: "quantity", message: "quantity must be a positive decimal" },
    ]);
  }

  const batches = await tx.flowerBatch.findMany({
    where: {
      flowerId,
      status: "AVAILABLE",
      availableQuantity: { not: "0" },
    },
    orderBy: [{ receivedDate: "asc" }, { createdAt: "asc" }],
  });

  let remaining = requested;
  const allocations = [];

  for (const batch of batches) {
    if (remaining <= 0n) break;

    const available = toMinorUnits(batch.availableQuantity);
    const allocate = remaining < available ? remaining : available;
    const newAvailable = available - allocate;

    await tx.flowerBatch.update({
      where: { id: batch.id },
      data: {
        availableQuantity: minorUnitsToString(newAvailable),
        status: newAvailable === 0n ? "DEPLETED" : "AVAILABLE",
      },
    });

    allocations.push({
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      allocatedQuantity: minorUnitsToString(allocate),
      qtyBefore: minorUnitsToString(available),
      qtyAfter: minorUnitsToString(newAvailable),
    });

    remaining -= allocate;
  }

  if (remaining > 0n) {
    const totalAvailable = batches.reduce(
      (sum, b) => sum + toMinorUnits(b.availableQuantity),
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

module.exports = { allocateHOBatches, toMinorUnits, minorUnitsToString };
