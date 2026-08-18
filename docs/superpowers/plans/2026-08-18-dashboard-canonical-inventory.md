# Dashboard Canonical Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Head Office dashboard stock and period cards use canonical balance and business transaction tables instead of requiring a complete inventory movement ledger.

**Architecture:** `dashboard.service.js` remains the dashboard orchestration boundary. Current balances come from `flowerBatch` and age-classified `branchStockLot` records; period aggregates come from receiving, distribution allocation/receipt, and daily-sales records. Inventory mutation services and movement creation remain unchanged.

**Tech Stack:** Node.js CommonJS, Express 5, Prisma 7/PostgreSQL, Jest 30

## Global Constraints

- Keep dashboard endpoints, query parameters, authorization, response field names, and pagination unchanged.
- Preserve `today`, 7-day, 30-day, and 60-day UTC period behavior.
- Do not change receiving, distribution, daily-sales, FIFO, stock validation, transaction, or movement-write logic.
- Treat `flower_batches` and `branch_stock_lots` as current balance sources.
- Do not add movement fallbacks or historical movement backfilling.
- Exclude `DAMAGED` branch lots from `totalBranchStock`, but include them in `flowerStatus`.

---

### Task 1: Current Inventory Balances and Flower Status

**Files:**
- Modify: `test/dashboard.service.test.js`
- Modify: `src/services/dashboard.service.js:6-101`

**Interfaces:**
- Consumes: existing `getHeadOfficeDashboard(daysValue, activityPageValue, activityLimitValue, branchIdValue, options)` and `calculateFlowerStatus(shippedAt, freshPeriod, gradeCPeriod)`.
- Produces: unchanged dashboard response with `summary.headOfficeStock`, `summary.totalBranchStock`, and `flowerStatus` sourced from current balances.

- [ ] **Step 1: Add Prisma mocks and deterministic defaults**

Extend the Prisma mock in `test/dashboard.service.test.js`:

```js
flowerBatch: { aggregate: jest.fn() },
distributionBatchAllocation: { aggregate: jest.fn() },
distributionReceiptItem: { aggregate: jest.fn() },
```

Give `dailySaleItem` both methods:

```js
dailySaleItem: { findMany: jest.fn(), aggregate: jest.fn() },
```

Add a `beforeEach` that resets all mocks and installs empty aggregate defaults so each test is independent:

```js
beforeEach(() => {
  jest.resetAllMocks();
  prisma.dailySale.findMany.mockResolvedValue([]);
  prisma.receiving.findMany.mockResolvedValue([]);
  prisma.branchStockLot.findMany.mockResolvedValue([]);
  prisma.flowerBatch.aggregate.mockResolvedValue({ _sum: { availableQuantity: null } });
  prisma.receivingItem.aggregate.mockResolvedValue({
    _sum: { acceptedQuantity: null, unusableQuantity: null },
  });
  prisma.distributionBatchAllocation.aggregate.mockResolvedValue({ _sum: { quantity: null } });
  prisma.distributionReceiptItem.aggregate.mockResolvedValue({ _sum: { receivedQuantity: null } });
  prisma.dailySaleItem.aggregate.mockResolvedValue({
    _sum: { soldQuantity: null, damagedQuantity: null },
  });
  prisma.branch.count.mockResolvedValue(0);
  prisma.farm.count.mockResolvedValue(0);
  prisma.dailySaleItem.findMany.mockResolvedValue([]);
  prisma.distributionOrder.count.mockResolvedValue(0);
  prisma.systemConfiguration.findMany.mockResolvedValue([]);
});
```

Remove per-test setup made redundant by these defaults and remove the unused `inventoryMovement` mock after all movement expectations are replaced.

- [ ] **Step 2: Write failing current-balance tests**

Add tests covering both canonical balance sources and current status classification:

```js
test("uses canonical balances for current Head Office and branch stock", async () => {
  prisma.flowerBatch.aggregate.mockResolvedValue({ _sum: { availableQuantity: 125 } });
  prisma.branchStockLot.findMany.mockResolvedValue([
    { quantity: 40, shippedAt: new Date(Date.now() - 2 * 86400000) },
    { quantity: 30, shippedAt: new Date(Date.now() - 8 * 86400000) },
    { quantity: 20, shippedAt: new Date(Date.now() - 20 * 86400000) },
  ]);
  prisma.systemConfiguration.findMany.mockResolvedValue([
    { key: "FRESH_PERIOD", value: "7" },
    { key: "GRADE_C_PERIOD", value: "4" },
  ]);

  const dashboard = await getHeadOfficeDashboard(7);

  expect(dashboard.summary.headOfficeStock).toBe(125);
  expect(dashboard.summary.totalBranchStock).toBe(70);
  expect(dashboard.flowerStatus).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: "FRESH", value: 40 }),
    expect.objectContaining({ key: "GRADE_C", value: 30 }),
    expect.objectContaining({ key: "DAMAGED", value: 20 }),
  ]));
});

test("filters current branch lots for a selected branch", async () => {
  await getHeadOfficeDashboard(7, "1", "10", 4);

  expect(prisma.branchStockLot.findMany).toHaveBeenCalledWith({
    where: { branchId: 4, quantity: { not: "0" } },
    select: { quantity: true, shippedAt: true },
  });
});
```

Update the existing damaged-lot branch-dashboard test to rely on the shared defaults while retaining its `70` expectation.

- [ ] **Step 3: Run tests and verify the canonical-balance test fails**

Run:

```bash
npm test -- --runInBand test/dashboard.service.test.js
```

Expected: FAIL because the Head Office path does not query `flowerBatch` or `branchStockLot` and still reconstructs balances from movements.

- [ ] **Step 4: Implement canonical current balances**

In `src/services/dashboard.service.js`:

1. Query nonzero branch lots for both dashboard scopes using `branchFilter`.
2. Query the Head Office available balance only for the Head Office scope.
3. Load age periods whenever branch lots are classified.
4. Reduce all branch lots into `FRESH`, `GRADE_C`, and `DAMAGED` current totals.
5. Set usable branch stock to `FRESH + GRADE_C`.

Use these query shapes:

```js
prisma.branchStockLot.findMany({
  where: { ...branchFilter, quantity: { not: "0" } },
  select: { quantity: true, shippedAt: true },
})
```

```js
isBranchDashboard
  ? Promise.resolve({ _sum: { availableQuantity: null } })
  : prisma.flowerBatch.aggregate({
    where: { status: "AVAILABLE", availableQuantity: { not: "0" } },
    _sum: { availableQuantity: true },
  })
```

Replace movement-derived status totals with:

```js
const { freshPeriod, gradeCPeriod } = await getAgePeriods();
const statusTotals = new Map([["FRESH", 0], ["GRADE_C", 0], ["DAMAGED", 0]]);
branchStockLots.forEach((lot) => {
  const status = calculateFlowerStatus(lot.shippedAt, freshPeriod, gradeCPeriod);
  statusTotals.set(status, statusTotals.get(status) + number(lot.quantity));
});
const currentBranchStock = statusTotals.get("FRESH") + statusTotals.get("GRADE_C");
```

Set `summary.headOfficeStock` from `headOfficeStock._sum.availableQuantity` and `summary.totalBranchStock` from `currentBranchStock`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- --runInBand test/dashboard.service.test.js
```

Expected: current-balance, status, branch filtering, and existing dashboard tests PASS.

---

### Task 2: Period Activity from Business Transactions

**Files:**
- Modify: `test/dashboard.service.test.js`
- Modify: `src/services/dashboard.service.js:50-158`

**Interfaces:**
- Consumes: `dateFrom`, `dateTo`, optional `branchId`, and Prisma aggregate models.
- Produces: existing summary activity fields populated without reading `inventoryMovement`.

- [ ] **Step 1: Replace movement fixture tests with business-aggregate tests**

Replace `returns period stock activity separately from current stock` with:

```js
test("returns period activity from canonical business transactions", async () => {
  prisma.flowerBatch.aggregate.mockResolvedValue({ _sum: { availableQuantity: 250 } });
  prisma.branchStockLot.findMany.mockResolvedValue([
    { quantity: 80, shippedAt: new Date() },
  ]);
  prisma.receivingItem.aggregate.mockResolvedValue({
    _sum: { acceptedQuantity: 100, unusableQuantity: 12 },
  });
  prisma.distributionBatchAllocation.aggregate.mockResolvedValue({ _sum: { quantity: 35 } });
  prisma.distributionReceiptItem.aggregate.mockResolvedValue({ _sum: { receivedQuantity: 40 } });
  prisma.dailySaleItem.aggregate.mockResolvedValue({
    _sum: { soldQuantity: 10, damagedQuantity: 3 },
  });

  const dashboard = await getHeadOfficeDashboard(7);

  expect(dashboard.summary).toEqual(expect.objectContaining({
    headOfficeStock: 250,
    totalBranchStock: 80,
    headOfficeStockAdded: 100,
    headOfficeStockRemoved: 35,
    headOfficeNetStockActivity: 65,
    totalBranchStockAdded: 40,
    totalBranchStockRemoved: 13,
    totalBranchNetStockActivity: 27,
    branchStockReceived: 40,
    branchStockOut: 13,
    branchSoldOut: 10,
    branchDamagedOut: 3,
    headOfficeReceivedStock: 100,
    headOfficeStockOut: 35,
    headOfficeDamagedStock: 12,
    stockAdded: 140,
    stockRemoved: 48,
  }));
});
```

- [ ] **Step 2: Add period and branch-scope query tests**

Assert that the four aggregate queries receive `gte`/`lt` date boundaries. For selected branch `4`, assert distribution allocations, branch receipts, and daily sales include branch `4`, while receiving totals remain national:

```js
test("applies branch selection to branch-related period activity", async () => {
  await getHeadOfficeDashboard(7, "1", "10", 4);

  expect(prisma.receivingItem.aggregate).toHaveBeenCalledWith({
    where: { receiving: { receivedDate: { gte: expect.any(Date), lt: expect.any(Date) } } },
    _sum: { acceptedQuantity: true, unusableQuantity: true },
  });
  expect(prisma.distributionBatchAllocation.aggregate).toHaveBeenCalledWith({
    where: { distributionOrder: { shippedAt: { gte: expect.any(Date), lt: expect.any(Date) }, branchId: 4 } },
    _sum: { quantity: true },
  });
  expect(prisma.distributionReceiptItem.aggregate).toHaveBeenCalledWith({
    where: {
      distributionReceipt: {
        receivedAt: { gte: expect.any(Date), lt: expect.any(Date) },
        distributionOrder: { branchId: 4 },
      },
    },
    _sum: { receivedQuantity: true },
  });
  expect(prisma.dailySaleItem.aggregate).toHaveBeenCalledWith({
    where: { dailySale: { salesDate: { gte: expect.any(Date), lt: expect.any(Date) }, branchId: 4 } },
    _sum: { soldQuantity: true, damagedQuantity: true },
  });
});
```

Retain the existing `today` period-boundary test and assert that current balances can remain nonzero when all period aggregates are null.

- [ ] **Step 3: Run tests and verify period tests fail**

Run:

```bash
npm test -- --runInBand test/dashboard.service.test.js
```

Expected: FAIL because period summary fields still read movement arrays.

- [ ] **Step 4: Implement period aggregate queries**

Add these Prisma calls to the main `Promise.all`:

```js
const emptyReceivingTotals = { _sum: { acceptedQuantity: null, unusableQuantity: null } };
const emptyQuantityTotal = { _sum: { quantity: null } };
```

```js
isBranchDashboard
  ? Promise.resolve(emptyReceivingTotals)
  : prisma.receivingItem.aggregate({
    where: { receiving: { receivedDate: { gte: dateFrom, lt: dateTo } } },
    _sum: { acceptedQuantity: true, unusableQuantity: true },
  })
```

```js
isBranchDashboard
  ? Promise.resolve(emptyQuantityTotal)
  : prisma.distributionBatchAllocation.aggregate({
    where: {
      distributionOrder: {
        shippedAt: { gte: dateFrom, lt: dateTo },
        ...branchFilter,
      },
    },
    _sum: { quantity: true },
  })
```

```js
prisma.distributionReceiptItem.aggregate({
  where: {
    distributionReceipt: {
      receivedAt: { gte: dateFrom, lt: dateTo },
      distributionOrder: branchFilter,
    },
  },
  _sum: { receivedQuantity: true },
})
```

```js
prisma.dailySaleItem.aggregate({
  where: {
    dailySale: {
      salesDate: { gte: dateFrom, lt: dateTo },
      ...branchFilter,
    },
  },
  _sum: { soldQuantity: true, damagedQuantity: true },
})
```

Derive summary values with `number(...)`:

```js
const headOfficeAdded = number(receivingTotals._sum.acceptedQuantity);
const headOfficeRemoved = number(distributionOutTotal._sum.quantity);
const branchAdded = number(branchReceivingTotal._sum.receivedQuantity);
const branchSoldOut = number(branchSalesTotals._sum.soldQuantity);
const branchDamagedOut = number(branchSalesTotals._sum.damagedQuantity);
const branchRemoved = branchSoldOut + branchDamagedOut;
```

Set `headOfficeDamagedStock` from `receivingTotals._sum.unusableQuantity`. Remove `movements`, `openingMovements`, `ADDITION_TYPES`, `REMOVAL_TYPES`, and movement summation code after no references remain.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- --runInBand test/dashboard.service.test.js
```

Expected: all dashboard service tests PASS.

---

### Task 3: Live Regression and Full Verification

**Files:**
- Verify: `src/services/dashboard.service.js`
- Verify: `test/dashboard.service.test.js`
- Verify: `docs/superpowers/specs/2026-08-18-dashboard-canonical-inventory-design.md`

**Interfaces:**
- Consumes: configured development `DATABASE_URL` and exported dashboard service functions.
- Produces: evidence that the original database mismatch is fixed without regressions.

- [ ] **Step 1: Run the complete Jest suite**

Run:

```bash
npm test -- --runInBand
```

Expected: all suites PASS.

- [ ] **Step 2: Re-run the original live database regression check**

Run a read-only Node invocation that loads all nonzero branch lots, excludes lots classified as `DAMAGED`, calls `getHeadOfficeDashboard("today")`, and asserts equality between usable lot stock and `dashboard.summary.totalBranchStock`.

Expected with the current development database:

```text
usableBranchLotStock: 22450
dashboardTotalBranchStock: 22450
```

The exact quantity may change if application data changes; the equality assertion is the pass condition.

- [ ] **Step 3: Verify 7-day period values against direct aggregates**

Run a read-only Node invocation that compares dashboard summary fields with direct Prisma aggregates for receiving items, distribution allocations, distribution receipt items, and daily-sale items over the same UTC range.

Expected: dashboard fields equal their corresponding direct aggregate values. For the investigated data snapshot, the source aggregates were:

```text
accepted receiving: 23579
HO distribution out: 23579
branch received: 23172
branch sold: 22609
branch damaged: 768
HO receiving damaged: 1278
```

- [ ] **Step 4: Check source cleanliness**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only the intended dashboard test, service, design, and plan files are changed.

- [ ] **Step 5: Review movement-write preservation**

Confirm `git diff -- src/services/receiving.service.js src/services/distribution-shipment.service.js src/services/distribution-receiving.service.js src/services/daily-sales.service.js` is empty.

Expected: no inventory mutation or audit-write files changed.
