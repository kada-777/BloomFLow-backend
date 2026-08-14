# Latest Receiving Distribution Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate Distribution Plans only for flowers accepted in all completed receiving records from the latest receiving date.

**Architecture:** Keep the frontend `POST /forecasts` request unchanged and make `forecast.service.js` resolve the automatic receiving scope. The service will aggregate same-date receiving quantities, filter recommendation items by positive aggregated accepted quantity, and pass the aggregate through the existing forced-allocation algorithm. Existing explicit `receivingId` behavior remains supported.

**Tech Stack:** Node.js CommonJS, Prisma, Jest 30.

## Global Constraints

- Automatically identify the latest `receivedDate` among `COMPLETED` receivings when generating a plan without an explicit receiving ID.
- Load every `COMPLETED` receiving on that date.
- Aggregate each receiving item's `acceptedQuantity` by `flowerId`.
- Exclude flowers whose aggregated accepted quantity is zero from distribution plan items.
- Use the aggregated quantities for forced branch allocation.
- Keep the frontend `POST /forecasts` payload unchanged.
- Return a clear conflict/error when no completed receiving exists instead of generating an unscoped plan.
- Receiving records from earlier dates are not included.

---

### Task 1: Resolve and Aggregate the Automatic Receiving Scope

**Files:**
- Modify: `src/services/forecast.service.js:297-314,372-445`
- Test: `test/forecast.service.test.js`

**Interfaces:**
- Consumes `prismaClient.receiving.findUnique`, `findFirst`, and `findMany`.
- Produces a receiving allocation object `{ id, status: "COMPLETED", items: [{ flowerId, acceptedQuantity }] }` for both explicit and automatic paths.

- [ ] **Step 1: Add failing unit coverage for latest-date aggregation**

Extend the forecast service test fixtures with receiving mocks and add a test whose Prisma mock returns:

```js
receiving: {
  findFirst: jest.fn().mockResolvedValue({ receivedDate: new Date("2025-07-02T00:00:00.000Z") }),
  findMany: jest.fn().mockResolvedValue([
    { items: [
      { flowerId: 2, acceptedQuantity: "10.00" },
      { flowerId: 3, acceptedQuantity: "0.00" },
    ] },
    { items: [
      { flowerId: 2, acceptedQuantity: "7.00" },
      { flowerId: 4, acceptedQuantity: "5.00" },
    ] },
  ]),
},
```

The test should assert the automatic path queries `status: "COMPLETED"`, chooses the latest date, queries that exact date, and produces a plan containing only flower IDs `2` and `4`. The same-date flower 2 must receive aggregated quantity `17.00`; flower 3 must be excluded.

- [ ] **Step 2: Add failing coverage for no completed receiving**

Add a test where `receiving.findFirst` resolves `null` and call `generateForecast` without `receivingId`. Assert it rejects with status `409` and a message stating that a completed receiving is required before generating a distribution plan. Assert `distributionPlan.create` is not called.

- [ ] **Step 3: Implement automatic receiving lookup**

Keep the explicit `receivingId` path in `loadReceivingForAllocation` unchanged. For the automatic path, query the latest completed date first:

```js
const latest = await prismaClient.receiving.findFirst({
  where: { status: "COMPLETED" },
  select: { receivedDate: true },
  orderBy: [{ receivedDate: "desc" }, { id: "desc" }],
});
if (!latest) {
  throw new HttpError(
    409,
    "A completed receiving is required before generating a distribution plan",
  );
}
```

Then load every completed receiving with `receivedDate: latest.receivedDate`, select only `items.flowerId` and `items.acceptedQuantity`, and aggregate with the existing minor-unit helpers. Preserve zero values in the aggregate only long enough to apply the positive-quantity filter.

- [ ] **Step 4: Keep explicit receiving behavior covered**

Run the existing explicit `receivingId` tests and retain the current `findUnique` and `status !== "COMPLETED"` validation. Do not make an explicit receiving ID silently include other same-date records.

- [ ] **Step 5: Run focused service tests**

From `BloomFLow-backend`:

```bash
npm test -- --runInBand test/forecast.service.test.js
```

Expected: the new automatic aggregation and no-receiving tests pass, along with existing forecast service tests.

### Task 2: Filter Plan Items and Apply Aggregated Forced Allocation

**Files:**
- Modify: `src/services/forecast.service.js:430-481`
- Test: `test/forecast.service.test.js`

**Interfaces:**
- Consumes the aggregated receiving object from Task 1.
- Produces a `DistributionPlan` whose nested `items.create` contains only positively received flower IDs, with forced final quantities based on aggregated accepted quantities.

- [ ] **Step 1: Add failing coverage for plan scoping**

Add a generation test with forecast recommendations for flowers 2 and 3 while the latest receiving aggregate contains only flower 2. Assert `tx.distributionPlan.create` receives no item for flower 3 and that flower 2 receives the expected final allocation total equal to the aggregated accepted quantity.

- [ ] **Step 2: Build the eligible flower set**

After `buildRecommendations` and before `buildForcedAllocations`, derive positive received flowers:

```js
const receivedFlowerIds = new Set(
  receiving.items
    .filter((item) => toWholeUnits(item.acceptedQuantity) > 0n)
    .map((item) => item.flowerId),
);
const scopedRecommendations = recommendations.filter((recommendation) =>
  receivedFlowerIds.has(recommendation.flowerId),
);
```

Use `scopedRecommendations` for both `buildForcedAllocations` and `distributionPlan.items.create`. Keep forecast result persistence unchanged because forecast history may still include all forecast pairs; only the operational distribution plan is receiving-scoped.

- [ ] **Step 3: Preserve forced allocation totals**

Pass the aggregated receiving object and scoped recommendations to `buildForcedAllocations`. Confirm that same-date duplicate receiving rows are already summed before allocation, so the final quantities for each flower total the combined accepted quantity.

- [ ] **Step 4: Run focused tests and inspect create payloads**

```bash
npm test -- --runInBand test/forecast.service.test.js
```

Expected: all forecast service tests pass, including assertions that unreceived flowers are absent from `items.create`.

- [ ] **Step 5: Review and commit backend implementation**

```bash
git diff -- src/services/forecast.service.js test/forecast.service.test.js
git status --short
git add src/services/forecast.service.js test/forecast.service.test.js
git commit -m "feat: scope distribution plans to latest receiving"
```

Confirm no frontend, schema, or unrelated inventory files are included.

### Task 3: Full Verification

**Files:**
- Verify: `src/services/forecast.service.js`
- Verify: `test/forecast.service.test.js`
- Verify: `../BloomFLow-frontend/src/pages/DistributionPlanning/index.jsx`

**Interfaces:**
- Consumes the scoped plan output from Tasks 1 and 2.
- Produces verified backend behavior consumed by the existing Head Office Distribution Planning page.

- [ ] **Step 1: Run the complete backend test suite**

```bash
npm test -- --runInBand
```

Expected: all backend tests pass.

- [ ] **Step 2: Build the frontend consumer**

From `BloomFLow-frontend`:

```bash
npm run build
```

Expected: Vite completes successfully with the existing chunk-size warning, if present.

- [ ] **Step 3: Verify the acceptance scenarios**

Confirm with test fixtures or a local environment that:

- Two completed receiving records on the latest date are combined per flower.
- A completed receiving on an earlier date is ignored.
- A flower with zero accepted quantity is absent from the generated plan.
- The Distribution Planning page shows only the generated plan items and requires no frontend receiving selector.
- Existing plan quantity editing and order workflow behavior remains available.

- [ ] **Step 4: Review final status**

```bash
git status --short
```

Expected: only intended commits are present and the working tree is clean.
