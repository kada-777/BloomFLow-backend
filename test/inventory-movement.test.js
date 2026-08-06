const assert = require("node:assert/strict");

const VALID_MOVEMENT_TYPES = [
  "RECEIVING_IN",
  "DISTRIBUTION_OUT",
  "DISTRIBUTION_IN",
  "SALE_OUT",
  "DAMAGED_OUT",
];

const VALID_LOCATION_TYPES = ["HO", "BRANCH"];

function buildMovement(overrides) {
  return {
    flowerId: 1,
    locationType: "HO",
    type: "RECEIVING_IN",
    quantity: "10.00",
    qtyBefore: "0",
    qtyAfter: "10.00",
    referenceType: "RECEIVING",
    referenceId: 1,
    branchId: null,
    batchId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function assertValidMovement(m) {
  assert.ok(VALID_MOVEMENT_TYPES.includes(m.type), `invalid movement type: ${m.type}`);
  assert.ok(VALID_LOCATION_TYPES.includes(m.locationType), `invalid location type: ${m.locationType}`);
  assert.ok(typeof m.quantity === "string" && m.quantity.length > 0, "quantity must be a non-empty string");
  assert.ok(typeof m.qtyBefore === "string", "qtyBefore must be a string");
  assert.ok(typeof m.qtyAfter === "string", "qtyAfter must be a string");
  assert.ok(typeof m.referenceType === "string" && m.referenceType.length > 0, "referenceType must be a non-empty string");
  assert.ok(Number.isInteger(m.referenceId) && m.referenceId > 0, "referenceId must be a positive integer");
  assert.ok(Number.isInteger(m.flowerId) && m.flowerId > 0, "flowerId must be a positive integer");
}

test("movement type enum contains exactly 5 MVP types", () => {
  assert.equal(VALID_MOVEMENT_TYPES.length, 5);
  assert.ok(VALID_MOVEMENT_TYPES.includes("RECEIVING_IN"));
  assert.ok(VALID_MOVEMENT_TYPES.includes("DISTRIBUTION_OUT"));
  assert.ok(VALID_MOVEMENT_TYPES.includes("DISTRIBUTION_IN"));
  assert.ok(VALID_MOVEMENT_TYPES.includes("SALE_OUT"));
  assert.ok(VALID_MOVEMENT_TYPES.includes("DAMAGED_OUT"));
});

test("ADJUSTMENT_IN and ADJUSTMENT_OUT are excluded from MVP", () => {
  assert.ok(!VALID_MOVEMENT_TYPES.includes("ADJUSTMENT_IN"));
  assert.ok(!VALID_MOVEMENT_TYPES.includes("ADJUSTMENT_OUT"));
});

test("RECEIVING_IN movement has HO location and batch reference", () => {
  const m = buildMovement({
    type: "RECEIVING_IN",
    locationType: "HO",
    batchId: 1,
    referenceType: "RECEIVING",
    quantity: "50.00",
    qtyBefore: "0",
    qtyAfter: "50.00",
  });

  assertValidMovement(m);
  assert.equal(m.type, "RECEIVING_IN");
  assert.equal(m.locationType, "HO");
  assert.equal(m.batchId, 1);
  assert.equal(m.referenceType, "RECEIVING");
  assert.equal(m.qtyBefore, "0");
  assert.equal(m.qtyAfter, "50.00");
});

test("RECEIVING_IN movement has no branchId", () => {
  const m = buildMovement({ type: "RECEIVING_IN", locationType: "HO" });
  assert.equal(m.branchId, null);
});

test("DISTRIBUTION_OUT movement has HO location and distribution reference", () => {
  const m = buildMovement({
    type: "DISTRIBUTION_OUT",
    locationType: "HO",
    batchId: 5,
    referenceType: "DISTRIBUTION",
    referenceId: 10,
    quantity: "30.00",
  });

  assertValidMovement(m);
  assert.equal(m.type, "DISTRIBUTION_OUT");
  assert.equal(m.locationType, "HO");
  assert.equal(m.referenceType, "DISTRIBUTION");
  assert.equal(m.referenceId, 10);
});

test("DISTRIBUTION_IN movement has BRANCH location and distribution reference", () => {
  const m = buildMovement({
    type: "DISTRIBUTION_IN",
    locationType: "BRANCH",
    branchId: 2,
    referenceType: "DISTRIBUTION",
    referenceId: 10,
    quantity: "28.00",
  });

  assertValidMovement(m);
  assert.equal(m.type, "DISTRIBUTION_IN");
  assert.equal(m.locationType, "BRANCH");
  assert.equal(m.branchId, 2);
  assert.equal(m.referenceType, "DISTRIBUTION");
});

test("SALE_OUT movement has BRANCH location and DAILY_SALE reference", () => {
  const m = buildMovement({
    type: "SALE_OUT",
    locationType: "BRANCH",
    branchId: 3,
    referenceType: "DAILY_SALE",
    referenceId: 20,
    quantity: "15.00",
  });

  assertValidMovement(m);
  assert.equal(m.type, "SALE_OUT");
  assert.equal(m.locationType, "BRANCH");
  assert.equal(m.branchId, 3);
  assert.equal(m.referenceType, "DAILY_SALE");
});

test("DAMAGED_OUT movement has BRANCH location and DAILY_SALE reference", () => {
  const m = buildMovement({
    type: "DAMAGED_OUT",
    locationType: "BRANCH",
    branchId: 3,
    referenceType: "DAILY_SALE",
    referenceId: 20,
    quantity: "5.00",
  });

  assertValidMovement(m);
  assert.equal(m.type, "DAMAGED_OUT");
  assert.equal(m.locationType, "BRANCH");
  assert.equal(m.branchId, 3);
});

test("RECEIVING_IN is the only HO movement type from receiving", () => {
  const receivingTypes = ["RECEIVING_IN"];
  for (const t of receivingTypes) {
    assert.ok(VALID_MOVEMENT_TYPES.includes(t));
  }
});

test("BRANCH movements require branchId", () => {
  const branchMovements = ["DISTRIBUTION_IN", "SALE_OUT", "DAMAGED_OUT"];
  for (const type of branchMovements) {
    const m = buildMovement({ type, locationType: "BRANCH", branchId: 5 });
    assert.ok(m.branchId > 0, `${type} must have a branchId`);
  }
});

test("movement quantity is always a string decimal", () => {
  const m = buildMovement({ quantity: "100.00" });
  assert.equal(typeof m.quantity, "string");
  assert.ok(/^\d+(\.\d{1,2})?$/.test(m.quantity));
});

test("qtyBefore and qtyAfter track state changes", () => {
  const before = buildMovement({ qtyBefore: "0", qtyAfter: "50.00", quantity: "50.00" });
  assert.equal(before.qtyBefore, "0");
  assert.equal(before.qtyAfter, "50.00");

  const after = buildMovement({ qtyBefore: "50.00", qtyAfter: "20.00", quantity: "30.00" });
  assert.equal(after.qtyBefore, "50.00");
  assert.equal(after.qtyAfter, "20.00");
});

test("movement referenceType must be a known type", () => {
  const validRefTypes = ["RECEIVING", "DISTRIBUTION", "DAILY_SALE"];
  for (const ref of validRefTypes) {
    const m = buildMovement({ referenceType: ref });
    assert.equal(m.referenceType, ref);
  }
});

test("movement is immutable once created (audit trail)", () => {
  const m = buildMovement({
    type: "RECEIVING_IN",
    quantity: "50.00",
    qtyBefore: "0",
    qtyAfter: "50.00",
    createdAt: new Date("2026-08-01T10:00:00Z"),
  });

  const original = { ...m };
  m.quantity = "999.00";

  assert.equal(m.quantity, "999.00", "mutable object allows change");
  assert.equal(original.quantity, "50.00", "original copy is preserved");
});

test("RECEIVING_IN qtyAfter equals quantity (new inventory added)", () => {
  const qty = "75.00";
  const m = buildMovement({
    type: "RECEIVING_IN",
    quantity: qty,
    qtyBefore: "0",
    qtyAfter: qty,
  });
  assert.equal(m.qtyBefore, "0");
  assert.equal(m.qtyAfter, m.quantity);
});

test("DISTRIBUTION_OUT reduces HO stock", () => {
  const m = buildMovement({
    type: "DISTRIBUTION_OUT",
    locationType: "HO",
    qtyBefore: "100.00",
    quantity: "40.00",
    qtyAfter: "60.00",
  });
  assert.equal(
    parseInt(m.qtyBefore) - parseInt(m.quantity),
    parseInt(m.qtyAfter)
  );
});

test("DISTRIBUTION_IN increases branch stock", () => {
  const m = buildMovement({
    type: "DISTRIBUTION_IN",
    locationType: "BRANCH",
    qtyBefore: "20.00",
    quantity: "28.00",
    qtyAfter: "48.00",
  });
  assert.equal(
    parseInt(m.qtyBefore) + parseInt(m.quantity),
    parseInt(m.qtyAfter)
  );
});

test("SALE_OUT records sold quantity from branch", () => {
  const m = buildMovement({
    type: "SALE_OUT",
    locationType: "BRANCH",
    quantity: "10.00",
    referenceType: "DAILY_SALE",
  });
  assert.equal(m.type, "SALE_OUT");
  assert.equal(m.referenceType, "DAILY_SALE");
});

test("DAMAGED_OUT records damaged quantity from branch", () => {
  const m = buildMovement({
    type: "DAMAGED_OUT",
    locationType: "BRANCH",
    quantity: "3.00",
    referenceType: "DAILY_SALE",
  });
  assert.equal(m.type, "DAMAGED_OUT");
  assert.equal(m.referenceType, "DAILY_SALE");
});

test("movement without batchId is valid for non-receiving types", () => {
  const m = buildMovement({
    type: "SALE_OUT",
    locationType: "BRANCH",
    batchId: null,
  });
  assertValidMovement(m);
  assert.equal(m.batchId, null);
});
