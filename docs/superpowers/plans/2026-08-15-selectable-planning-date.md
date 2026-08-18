# Selectable Planning Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Staff Head Office select a backend-validated planning date and generate recommendations from the matching 1-3 day forecast horizon.

**Architecture:** Add a focused planning-date service as the single source of truth for Asia/Jakarta server dates, date-only arithmetic, planning windows, and metadata. Keep forecast generation orchestration in `forecast.service.js`, but replace its automatic D+1 behavior with validated `planningDate` input and matching-horizon result selection. Enforce the one-plan-per-date invariant both in application errors and with a database unique index.

**Tech Stack:** Node.js CommonJS, Express 5, Prisma 7/PostgreSQL, Jest 30

## Global Constraints

- The cutoff is the maximum `salesDate` from any Daily Sales record, matching current behavior.
- “Today” is the server calendar date in `Asia/Jakarta`.
- A planning date must be today or later, strictly after cutoff, and 1-3 calendar days after cutoff.
- Frontend supplies only `planningDate`; backend determines cutoff and horizon.
- Existing receiving scope, inventory snapshot, safety stock, baseline fallback, forced allocation, and historical plans remain unchanged.
- Forecast generation and persistence still retain all three forecast horizons; only recommendation construction uses the selected horizon.
- Duplicate planning dates return HTTP 409 and are prevented by a database unique constraint.

---

### Task 1: Planning Date Rules and Metadata

**Files:**
- Create: `src/services/planning-date.service.js`
- Create: `test/planning-date.service.test.js`

**Interfaces:**
- Produces: `jakartaDate(now?: Date): string`
- Produces: `addDays(dateText: string, days: number): string`
- Produces: `planningHorizon(cutoffDate: string, planningDate: string): number`
- Produces: `validatePlanningDate({ planningDate, cutoffDate, serverDate }): { planningDate: string, planningDateValue: Date, horizon: number }`
- Produces: `getPlanningMetadata(dependencies?): Promise<PlanningMetadata>`
- `PlanningMetadata` contains `serverDate`, nullable `cutoffDate`, nullable `minimumPlanningDate`, nullable `maximumPlanningDate`, `planningDates: [{ date, horizon, available, reason }]`, and nullable `unavailableReason`.

- [ ] **Step 1: Write failing pure-rule tests**

Add Jest tests that freeze explicit instants rather than the process clock:

```js
const {
  jakartaDate,
  planningHorizon,
  validatePlanningDate,
} = require("../src/services/planning-date.service");

test("uses the Asia/Jakarta calendar date", () => {
  expect(jakartaDate(new Date("2026-08-14T17:30:00.000Z"))).toBe("2026-08-15");
});

test("calculates horizon from calendar dates", () => {
  expect(planningHorizon("2026-08-12", "2026-08-15")).toBe(3);
});

test.each([
  ["2026-08-13", "planningDate cannot be before the server date"],
  ["2026-08-12", "planningDate must be after the Daily Sales cutoff"],
  ["2026-08-16", "planningDate must be within forecast horizon 1-3"],
])("rejects invalid planning date %s", (planningDate, message) => {
  expect(() => validatePlanningDate({
    planningDate,
    cutoffDate: "2026-08-12",
    serverDate: "2026-08-14",
  })).toThrow(message);
});
```

Also test missing values, malformed dates, impossible dates such as `2026-02-30`, and a valid `2026-08-15` result containing a UTC-midnight `Date` plus `horizon: 3`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --runInBand test/planning-date.service.test.js`

Expected: FAIL because `planning-date.service.js` does not exist.

- [ ] **Step 3: Implement strict date-only helpers and validation**

Implement date parsing through UTC midnight and format Jakarta dates with `Intl.DateTimeFormat(...).formatToParts()` so no locale-specific string layout is assumed. Throw `HttpError(422, "Validation failed", [{ field: "planningDate", message }])` for request validation failures.

```js
const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toISOString().slice(0, 10) === value ? date : null;
}

function planningHorizon(cutoffDate, planningDate) {
  return (parseDateOnly(planningDate) - parseDateOnly(cutoffDate)) / DAY_MS;
}
```

Validation order must be format, server-past, cutoff-before-or-equal, then horizon outside 1-3, producing one deterministic error.

- [ ] **Step 4: Write failing metadata tests**

Cover these metadata cases with injected `{ prismaClient, now: () => fixedDate }` dependencies:

```js
test("returns valid dates and disables dates with existing plans", async () => {
  const metadata = await getPlanningMetadata({
    prismaClient: {
      dailySale: { findMany: jest.fn().mockResolvedValue([{ salesDate: "2026-08-12" }]) },
      distributionPlan: { findMany: jest.fn().mockResolvedValue([{ planningDate: "2026-08-14" }]) },
    },
    now: () => new Date("2026-08-14T05:00:00.000Z"),
  });

  expect(metadata.planningDates).toEqual([
    { date: "2026-08-14", horizon: 2, available: false, reason: "PLAN_ALREADY_EXISTS" },
    { date: "2026-08-15", horizon: 3, available: true, reason: null },
  ]);
});
```

Also assert `SALES_DATA_OUTDATED` when cutoff is August 12 and Jakarta today is August 16, `ALL_DATES_HAVE_PLANS` when every date in the temporal range exists, and `DAILY_SALES_REQUIRED` when no sales exist.

- [ ] **Step 5: Run metadata tests and verify RED**

Run: `npm test -- --runInBand test/planning-date.service.test.js`

Expected: FAIL because `getPlanningMetadata` is not implemented.

- [ ] **Step 6: Implement metadata queries and response**

Load all sales dates using the existing query behavior and derive the lexicographic maximum normalized date. Compute:

```text
minimumPlanningDate = max(serverDate, cutoffDate + 1)
maximumPlanningDate = cutoffDate + 3
```

If the minimum exceeds the maximum, do not query plans; return an empty list with `SALES_DATA_OUTDATED`. Otherwise load plans within the inclusive range, build one entry per calendar day, and set `ALL_DATES_HAVE_PLANS` only when the non-empty list has no available entry.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run: `npm test -- --runInBand test/planning-date.service.test.js`

Expected: PASS.

### Task 2: Metadata HTTP Contract

**Files:**
- Modify: `src/controllers/forecast.controller.js`
- Modify: `src/routes/forecast.routes.js`
- Modify: `test/forecast.controller.test.js`

**Interfaces:**
- Consumes: `getPlanningMetadata()` from Task 1.
- Produces: authenticated `GET /forecasts/planning-metadata` for `STAFF_HEAD_OFFICE`.
- Produces: controller `getPlanningMetadata(req, res, next)` returning `{ success: true, data }` with HTTP 200.

- [ ] **Step 1: Write failing controller tests**

Extend the service mock with `getPlanningMetadata: jest.fn()`, import the new controller, and assert:

```js
forecastService.getPlanningMetadata.mockResolvedValue(metadata);
await getPlanningMetadata({}, response, next);
expect(response.status).toHaveBeenCalledWith(200);
expect(response.json).toHaveBeenCalledWith({ success: true, data: metadata });
```

Update generation controller expectations so body `{ planningDate, modelVersion, receivingId }` passes exactly those fields and no `forecastDate`.

- [ ] **Step 2: Run controller tests and verify RED**

Run: `npm test -- --runInBand test/forecast.controller.test.js`

Expected: FAIL because the metadata controller is absent and generation still passes `forecastDate`.

- [ ] **Step 3: Implement controller and route**

Delegate metadata retrieval to the service, return HTTP 200, export both controller functions, register GET before POST, and apply the same authentication and `STAFF_HEAD_OFFICE` authorization middleware as generation.

- [ ] **Step 4: Run controller tests and verify GREEN**

Run: `npm test -- --runInBand test/forecast.controller.test.js`

Expected: PASS.

### Task 3: Selected-Horizon Forecast Generation

**Files:**
- Modify: `src/services/forecast.service.js`
- Modify: `test/forecast.service.test.js`

**Interfaces:**
- Consumes: `validatePlanningDate()` and `jakartaDate()` from Task 1.
- Changes: `generateForecast({ planningDate, modelVersion?, receivingId? }, dependencies?)` requires a date-only `planningDate`.
- Re-exports: `getPlanningMetadata` through `forecast.service.js` for the controller.

- [ ] **Step 1: Write failing horizon-3 generation test**

Adapt the main persistence test to use cutoff `2026-08-12`, injected `now: () => new Date("2026-08-14T05:00:00.000Z")`, and `planningDate: "2026-08-15"`. Give horizon 1/2/3 distinct demands and assert:

```js
expect(tx.distributionPlan.create).toHaveBeenCalledWith({
  data: expect.objectContaining({
    planningDate: new Date("2026-08-15T00:00:00.000Z"),
    items: { create: expect.arrayContaining([
      expect.objectContaining({ recommendedQuantity: expectedFromHorizonThree }),
    ]) },
  }),
  select: { id: true },
});
```

Assert the forced-allocation fallback weights also use horizon 3 by arranging zero recommendations and distinguishable forecast demands.

- [ ] **Step 2: Write failing validation and duplicate tests**

Add cases for malformed, past, before/equal-cutoff, and D+4 planning dates. Change the existing reuse test to expect `HttpError` status 409. Add a simulated Prisma race test where `$transaction` rejects with `{ code: "P2002", meta: { target: ["planningDate"] } }` and assert it is translated to the same 409 conflict.

- [ ] **Step 3: Run service tests and verify RED**

Run: `npm test -- --runInBand test/forecast.service.test.js`

Expected: FAIL because generation still derives D+1 from caller-supplied `forecastDate`, uses horizon 1, and reuses duplicates.

- [ ] **Step 4: Implement selected-date generation**

In `generateForecast`:

1. Load Daily Sales and reject an empty history.
2. Derive cutoff exclusively from the maximum stored `salesDate`.
3. Call `validatePlanningDate` with Jakarta today.
4. Query duplicates by the validated UTC-midnight planning date and always throw 409 when found.
5. Continue sending `{ forecastDate: cutoffDate, eligiblePairs }` to ML so its existing contract stays unchanged.
6. Keep all three horizons in `forecastResult.createMany`.
7. Replace `results.filter(result => result.horizon === 1)` with the validated selected horizon for recommendation and forced-allocation weights.
8. Persist the validated selected planning date.

Wrap the write transaction with a narrow P2002 handler:

```js
try {
  return await dependencies.prismaClient.$transaction(/* existing callback */);
} catch (error) {
  const target = Array.isArray(error.meta?.target) ? error.meta.target : [];
  if (error.code === "P2002" && target.includes("planningDate")) {
    throw new HttpError(409, "Distribution plan already exists for this planning date");
  }
  throw error;
}
```

- [ ] **Step 5: Update existing fixtures without weakening assertions**

Replace test input `forecastDate` with a valid `planningDate` and inject a stable `now` dependency where system time would make historical fixtures invalid. Preserve assertions covering receiving aggregation, ML fallback, forecast persistence, and inventory behavior.

- [ ] **Step 6: Run forecast tests and verify GREEN**

Run: `npm test -- --runInBand test/forecast.service.test.js test/forecast.controller.test.js test/planning-date.service.test.js`

Expected: PASS.

### Task 4: Database Invariant and API Documentation

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260815000000_unique_distribution_plan_planning_date/migration.sql`
- Modify: `docs/API_Contract.yaml`

**Interfaces:**
- Produces: PostgreSQL unique index `distribution_plans_planningDate_key`.
- Documents: GET planning metadata response and POST generation `planningDate` request.

- [ ] **Step 1: Check existing data before migration**

Run against each target database before deployment:

```sql
SELECT "planningDate", COUNT(*)
FROM "distribution_plans"
GROUP BY "planningDate"
HAVING COUNT(*) > 1;
```

Expected: zero rows. If rows exist, stop deployment and have the product/data owner choose the historical record to retain; the migration must not delete plans automatically.

- [ ] **Step 2: Add schema and SQL migration**

Change `planningDate DateTime @db.Date` to `planningDate DateTime @unique @db.Date` and create:

```sql
CREATE UNIQUE INDEX "distribution_plans_planningDate_key"
ON "distribution_plans"("planningDate");
```

Keep the existing `(status, planningDate)` index because it serves status-filtered list queries.

- [ ] **Step 3: Update API contract**

Document `GET /forecasts/planning-metadata`, all response fields and reason values (`PLAN_ALREADY_EXISTS`, `DAILY_SALES_REQUIRED`, `SALES_DATA_OUTDATED`, `ALL_DATES_HAVE_PLANS`). Document `POST /forecasts` with required date-only `planningDate`, HTTP 201 success, HTTP 409 duplicate, and HTTP 422 date validation failures. State that backend owns cutoff, horizon, and Asia/Jakarta today.

- [ ] **Step 4: Validate Prisma schema**

Run: `npx prisma validate`

Expected: schema is valid.

- [ ] **Step 5: Run complete verification**

Run: `npm test -- --runInBand`

Expected: all suites pass.

- [ ] **Step 6: Review final diff**

Run: `git diff --check`

Expected: no whitespace errors. Inspect `git diff` to confirm no unrelated worktree changes were modified.
