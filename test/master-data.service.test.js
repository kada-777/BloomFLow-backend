const test = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/services/master-data.service");
const userService = require("../src/services/user.service");
const configurationService = require("../src/services/configuration.service");
const receivingService = require("../src/services/receiving.service");
const { authorizeRoles } = require("../src/middlewares/auth.middleware");

test("validates required fields and trims create data", () => {
  assert.deepEqual(
    service.validateCreatePayload("flower", {
      name: " Rose ",
      variety: " Red Naomi ",
    }),
    { name: "Rose", variety: "Red Naomi" },
  );

  assert.throws(
    () => service.validateCreatePayload("farm", { name: "Farm One" }),
    { statusCode: 422 },
  );
});

test("requires an editable field for updates", () => {
  assert.throws(
    () => service.validateUpdatePayload("branch", {}),
    { statusCode: 422 },
  );
});

test("rejects non-superadmin master-data writes", () => {
  const middleware = authorizeRoles("SUPERADMIN");
  const response = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
  };
  let nextCalled = false;

  middleware({ user: { role: "STAFF_HEAD_OFFICE" } }, response, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.success, false);
});

test("requires a valid branch assignment for branch staff", () => {
  assert.throws(
    () => userService.validateCreatePayload({
      email: "branch@example.test",
      password: "secret",
      role: "STAFF_BRANCH",
    }),
    { statusCode: 422 },
  );
});

test("normalizes a newly created user email", () => {
  assert.deepEqual(
    userService.validateCreatePayload({
      email: "  Office@BloomFlow.Test ",
      password: "secret",
      role: "STAFF_HEAD_OFFICE",
    }),
    {
      email: "office@bloomflow.test",
      password: "secret",
      role: "STAFF_HEAD_OFFICE",
      branchId: null,
    },
  );
});

test("validates configuration values against documented types", () => {
  assert.equal(configurationService.normalizeValue("DEFAULT_SAFETY_STOCK", "12.50"), "12.50");
  assert.equal(configurationService.normalizeValue("FRESH_PERIOD", 7), "7");

  assert.throws(
    () => configurationService.normalizeValue("FRESH_PERIOD", "7.5"),
    { statusCode: 422 },
  );
  assert.throws(
    () => configurationService.normalizeValue("UNSUPPORTED_KEY", 1),
    { statusCode: 422 },
  );
});

test("validates a receiving QC payload", () => {
  assert.deepEqual(
    receivingService.validatePayload({
      farmId: 1,
      receivedDate: "2026-08-04",
      items: [{
        flowerId: 2,
        shippedQuantity: 10,
        actualReceivedQuantity: 9,
        acceptedQuantity: 8,
        unusableQuantity: 1,
        unusableNotes: null,
      }],
    }),
    {
      farmId: 1,
      receivedDate: "2026-08-04",
      items: [{
        flowerId: 2,
        shippedQuantity: "10",
        actualReceivedQuantity: "9",
        acceptedQuantity: "8",
        unusableQuantity: "1",
        unusableNotes: null,
      }],
    },
  );
});

test("compares receiving decimals without floating-point errors", () => {
  assert.doesNotThrow(() => receivingService.validatePayload({
    farmId: 1,
    receivedDate: "2026-08-04",
    items: [{
      flowerId: 2,
      shippedQuantity: "0.30",
      actualReceivedQuantity: "0.30",
      acceptedQuantity: "0.10",
      unusableQuantity: "0.20",
    }],
  }));
});

test("rejects invalid receiving quantity totals and duplicate flowers", () => {
  assert.throws(
    () => receivingService.validatePayload({
      farmId: 1,
      receivedDate: "2026-08-04",
      items: [
        { flowerId: 2, shippedQuantity: 5, actualReceivedQuantity: 5, acceptedQuantity: 4, unusableQuantity: 0 },
        { flowerId: 2, shippedQuantity: 1, actualReceivedQuantity: 1, acceptedQuantity: 1, unusableQuantity: 0 },
      ],
    }),
    { statusCode: 422 },
  );
});
