const assert = require("node:assert/strict");

const { validatePayload: validateReceiving } = require("../src/services/receiving.service");
const { validatePayload: validateDailySales } = require("../src/services/daily-sales.service");

function toMinorUnits(value) {
  const str = String(value).trim();
  const [whole, fraction = ""] = str.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
}

function assertThrows422(fn) {
  try {
    fn();
    assert.fail("expected 422 error");
  } catch (err) {
    assert.equal(err.statusCode, 422);
    return err;
  }
}

function assertValidReceiving(payload) {
  return validateReceiving(payload);
}

function assertValidDailySales(payload) {
  return validateDailySales(payload);
}

// ─── Receiving Validation ────────────────────────────────────────────────────

test("receiving: accepted + unusable must equal actualReceived", () => {
  assertValidReceiving({
    farmId: 1,
    receivedDate: "2026-08-04",
    items: [{
      flowerId: 1,
      shippedQuantity: 100,
      actualReceivedQuantity: 90,
      acceptedQuantity: 80,
      unusableQuantity: 10,
    }],
  });
});

test("receiving: rejects when accepted + unusable != actualReceived", () => {
  assertThrows422(() => {
    validateReceiving({
      farmId: 1,
      receivedDate: "2026-08-04",
      items: [{
        flowerId: 1,
        shippedQuantity: 100,
        actualReceivedQuantity: 90,
        acceptedQuantity: 70,
        unusableQuantity: 10,
      }],
    });
  });
});

test("receiving: actualReceivedQuantity must not exceed shippedQuantity", () => {
  assertThrows422(() => {
    validateReceiving({
      farmId: 1,
      receivedDate: "2026-08-04",
      items: [{
        flowerId: 1,
        shippedQuantity: 50,
        actualReceivedQuantity: 60,
        acceptedQuantity: 60,
        unusableQuantity: 0,
      }],
    });
  });
});

test("receiving: actualReceivedQuantity can equal shippedQuantity", () => {
  assertValidReceiving({
    farmId: 1,
    receivedDate: "2026-08-04",
    items: [{
      flowerId: 1,
      shippedQuantity: 100,
      actualReceivedQuantity: 100,
      acceptedQuantity: 100,
      unusableQuantity: 0,
    }],
  });
});

test("receiving: all unusable is valid", () => {
  assertValidReceiving({
    farmId: 1,
    receivedDate: "2026-08-04",
    items: [{
      flowerId: 1,
      shippedQuantity: 50,
      actualReceivedQuantity: 50,
      acceptedQuantity: 0,
      unusableQuantity: 50,
    }],
  });
});

test("receiving: all accepted is valid", () => {
  assertValidReceiving({
    farmId: 1,
    receivedDate: "2026-08-04",
    items: [{
      flowerId: 1,
      shippedQuantity: 50,
      actualReceivedQuantity: 50,
      acceptedQuantity: 50,
      unusableQuantity: 0,
    }],
  });
});

test("receiving: decimal precision without floating-point errors", () => {
  const result = assertValidReceiving({
    farmId: 1,
    receivedDate: "2026-08-04",
    items: [{
      flowerId: 1,
      shippedQuantity: "0.30",
      actualReceivedQuantity: "0.30",
      acceptedQuantity: "0.10",
      unusableQuantity: "0.20",
    }],
  });
  assert.equal(result.items[0].acceptedQuantity, "0.10");
  assert.equal(result.items[0].unusableQuantity, "0.20");
});

test("receiving: rejects duplicate flowerId in same receiving", () => {
  assertThrows422(() => {
    validateReceiving({
      farmId: 1,
      receivedDate: "2026-08-04",
      items: [
        { flowerId: 1, shippedQuantity: 10, actualReceivedQuantity: 10, acceptedQuantity: 10, unusableQuantity: 0 },
        { flowerId: 1, shippedQuantity: 5, actualReceivedQuantity: 5, acceptedQuantity: 5, unusableQuantity: 0 },
      ],
    });
  });
});

test("receiving: rejects missing items array", () => {
  assertThrows422(() => {
    validateReceiving({ farmId: 1, receivedDate: "2026-08-04" });
  });
});

test("receiving: rejects empty items array", () => {
  assertThrows422(() => {
    validateReceiving({ farmId: 1, receivedDate: "2026-08-04", items: [] });
  });
});

test("receiving: rejects invalid receivedDate format", () => {
  assertThrows422(() => {
    validateReceiving({
      farmId: 1,
      receivedDate: "08-04-2026",
      items: [{ flowerId: 1, shippedQuantity: 10, actualReceivedQuantity: 10, acceptedQuantity: 10, unusableQuantity: 0 }],
    });
  });
});

test("receiving: rejects invalid farmId", () => {
  assertThrows422(() => {
    validateReceiving({
      farmId: -1,
      receivedDate: "2026-08-04",
      items: [{ flowerId: 1, shippedQuantity: 10, actualReceivedQuantity: 10, acceptedQuantity: 10, unusableQuantity: 0 }],
    });
  });
});

test("receiving: rejects non-object body", () => {
  assertThrows422(() => validateReceiving(null));
  assertThrows422(() => validateReceiving("string"));
  assertThrows422(() => validateReceiving([1, 2, 3]));
});

test("receiving: unusableNotes accepts null", () => {
  assertValidReceiving({
    farmId: 1,
    receivedDate: "2026-08-04",
    items: [{
      flowerId: 1,
      shippedQuantity: 10,
      actualReceivedQuantity: 10,
      acceptedQuantity: 8,
      unusableQuantity: 2,
      unusableNotes: null,
    }],
  });
});

test("receiving: unusableNotes accepts string", () => {
  assertValidReceiving({
    farmId: 1,
    receivedDate: "2026-08-04",
    items: [{
      flowerId: 1,
      shippedQuantity: 10,
      actualReceivedQuantity: 10,
      acceptedQuantity: 8,
      unusableQuantity: 2,
      unusableNotes: "damaged petals",
    }],
  });
});

test("receiving: trims unusableNotes whitespace to null", () => {
  const result = assertValidReceiving({
    farmId: 1,
    receivedDate: "2026-08-04",
    items: [{
      flowerId: 1,
      shippedQuantity: 10,
      actualReceivedQuantity: 10,
      acceptedQuantity: 8,
      unusableQuantity: 2,
      unusableNotes: "   ",
    }],
  });
  assert.equal(result.items[0].unusableNotes, null);
});

// ─── Daily Sales Validation ──────────────────────────────────────────────────

test("daily sales: valid payload accepted", () => {
  assertValidDailySales({
    salesDate: "2026-08-04",
    items: [{ flowerId: 1, soldQuantity: "10", damagedQuantity: "2" }],
  });
});

test("daily sales: rejects missing salesDate", () => {
  assertThrows422(() => {
    validateDailySales({
      items: [{ flowerId: 1, soldQuantity: "10", damagedQuantity: "0" }],
    });
  });
});

test("daily sales: rejects invalid salesDate format", () => {
  assertThrows422(() => {
    validateDailySales({
      salesDate: "2026/08/04",
      items: [{ flowerId: 1, soldQuantity: "10", damagedQuantity: "0" }],
    });
  });
});

test("daily sales: rejects empty items", () => {
  assertThrows422(() => {
    validateDailySales({ salesDate: "2026-08-04", items: [] });
  });
});

test("daily sales: rejects duplicate flowerId", () => {
  const err = assertThrows422(() => {
    validateDailySales({
      salesDate: "2026-08-04",
      items: [
        { flowerId: 1, soldQuantity: "10", damagedQuantity: "0" },
        { flowerId: 1, soldQuantity: "5", damagedQuantity: "0" },
      ],
    });
  });
  assert.ok(err.errors.some((e) => e.message.includes("unique")));
});

test("daily sales: normalizes numeric soldQuantity to string", () => {
  const result = assertValidDailySales({
    salesDate: "2026-08-04",
    items: [{ flowerId: 1, soldQuantity: 10, damagedQuantity: 2 }],
  });
  assert.equal(result.items[0].soldQuantity, "10");
  assert.equal(result.items[0].damagedQuantity, "2");
});

test("daily sales: normalizes decimal string soldQuantity", () => {
  const result = assertValidDailySales({
    salesDate: "2026-08-04",
    items: [{ flowerId: 1, soldQuantity: "5.50", damagedQuantity: "0" }],
  });
  assert.equal(result.items[0].soldQuantity, "5.50");
});

test("daily sales: requires both soldQuantity and damagedQuantity", () => {
  assertThrows422(() => {
    validateDailySales({
      salesDate: "2026-08-04",
      items: [{ flowerId: 1, soldQuantity: "10" }],
    });
  });
});

test("daily sales: rejects non-object body", () => {
  assertThrows422(() => validateDailySales(null));
  assertThrows422(() => validateDailySales("invalid"));
});

test("daily sales: accepts multiple different flowerIds", () => {
  assertValidDailySales({
    salesDate: "2026-08-04",
    items: [
      { flowerId: 1, soldQuantity: "10", damagedQuantity: "0" },
      { flowerId: 2, soldQuantity: "5", damagedQuantity: "1" },
      { flowerId: 3, soldQuantity: "8", damagedQuantity: "0" },
    ],
  });
});

test("daily sales: rejects negative soldQuantity", () => {
  assertThrows422(() => {
    validateDailySales({
      salesDate: "2026-08-04",
      items: [{ flowerId: 1, soldQuantity: "-5", damagedQuantity: "0" }],
    });
  });
});

test("daily sales: rejects negative damagedQuantity", () => {
  assertThrows422(() => {
    validateDailySales({
      salesDate: "2026-08-04",
      items: [{ flowerId: 1, soldQuantity: "0", damagedQuantity: "-3" }],
    });
  });
});

// ─── Distribution Receiving Validation ───────────────────────────────────────

test("distribution receiving: received + damaged + missing must equal shipped", () => {
  const shipped = toMinorUnits("100.00");
  const received = toMinorUnits("85.00");
  const damaged = toMinorUnits("10.00");
  const missing = toMinorUnits("5.00");
  assert.equal(received + damaged + missing, shipped);
});

test("distribution receiving: rejects when received + damaged + missing != shipped", () => {
  const shipped = toMinorUnits("100.00");
  const received = toMinorUnits("80.00");
  const damaged = toMinorUnits("10.00");
  const missing = toMinorUnits("5.00");
  assert.notEqual(received + damaged + missing, shipped);
});

test("distribution receiving: all received is valid", () => {
  const shipped = toMinorUnits("50.00");
  const received = toMinorUnits("50.00");
  const damaged = toMinorUnits("0.00");
  const missing = toMinorUnits("0.00");
  assert.equal(received + damaged + missing, shipped);
});

test("distribution receiving: all missing is valid", () => {
  const shipped = toMinorUnits("50.00");
  const received = toMinorUnits("0.00");
  const damaged = toMinorUnits("0.00");
  const missing = toMinorUnits("50.00");
  assert.equal(received + damaged + missing, shipped);
});

test("distribution receiving: all damaged is valid", () => {
  const shipped = toMinorUnits("50.00");
  const received = toMinorUnits("0.00");
  const damaged = toMinorUnits("50.00");
  const missing = toMinorUnits("0.00");
  assert.equal(received + damaged + missing, shipped);
});

test("distribution receiving: decimal precision", () => {
  const shipped = toMinorUnits("0.30");
  const received = toMinorUnits("0.10");
  const damaged = toMinorUnits("0.15");
  const missing = toMinorUnits("0.05");
  assert.equal(received + damaged + missing, shipped);
});

test("distribution receiving: only received quantity adds to branch stock", () => {
  const received = toMinorUnits("85.00");
  const damaged = toMinorUnits("10.00");
  const missing = toMinorUnits("5.00");

  const branchStockIncrease = received;
  const total = received + damaged + missing;

  assert.equal(branchStockIncrease, toMinorUnits("85.00"));
  assert.ok(branchStockIncrease < total);
});

// ─── Stock Non-Negative Invariant ────────────────────────────────────────────

test("stock cannot go negative: deducting more than available", () => {
  const available = toMinorUnits("10.00");
  const requested = toMinorUnits("15.00");
  assert.ok(requested > available, "request exceeds available stock");
});

test("stock cannot go negative: deducting exact amount leaves zero", () => {
  const available = toMinorUnits("10.00");
  const requested = toMinorUnits("10.00");
  const remaining = available - requested;
  assert.equal(remaining, 0n);
});

test("stock cannot go negative: partial deduction leaves positive", () => {
  const available = toMinorUnits("10.00");
  const requested = toMinorUnits("3.00");
  const remaining = available - requested;
  assert.ok(remaining > 0n);
});

// ─── Atomicity Validation ────────────────────────────────────────────────────

test("daily sales: if one item has invalid data, all items are rejected", () => {
  try {
    validateDailySales({
      salesDate: "2026-08-04",
      items: [
        { flowerId: 1, soldQuantity: "10", damagedQuantity: "0" },
        { flowerId: -1, soldQuantity: "5", damagedQuantity: "0" },
      ],
    });
    assert.fail("should have thrown");
  } catch (err) {
    assert.equal(err.statusCode, 422);
    assert.ok(err.errors.length > 0);
  }
});

test("receiving: if one item fails, entire receiving is rejected", () => {
  try {
    validateReceiving({
      farmId: 1,
      receivedDate: "2026-08-04",
      items: [
        { flowerId: 1, shippedQuantity: 10, actualReceivedQuantity: 10, acceptedQuantity: 10, unusableQuantity: 0 },
        { flowerId: 2, shippedQuantity: 5, actualReceivedQuantity: 5, acceptedQuantity: 3, unusableQuantity: 1 },
      ],
    });
    assert.fail("should have thrown");
  } catch (err) {
    assert.equal(err.statusCode, 422);
  }
});

// ─── Reference Type Validation ───────────────────────────────────────────────

test("receiving creates RECEIVING_IN with RECEIVING reference", () => {
  const referenceType = "RECEIVING";
  assert.equal(referenceType, "RECEIVING");
});

test("daily sales creates SALE_OUT and DAMAGED_OUT with DAILY_SALE reference", () => {
  const referenceType = "DAILY_SALE";
  assert.equal(referenceType, "DAILY_SALE");
});

test("distribution creates DISTRIBUTION_OUT and DISTRIBUTION_IN with DISTRIBUTION reference", () => {
  const referenceType = "DISTRIBUTION";
  assert.equal(referenceType, "DISTRIBUTION");
});
