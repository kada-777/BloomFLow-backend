const test = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/services/master-data.service");
const userService = require("../src/services/user.service");
const configurationService = require("../src/services/configuration.service");
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
