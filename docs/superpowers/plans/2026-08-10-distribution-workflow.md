# Distribution Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add draft distribution-plan review, finalization, and transactional FIFO shipment using the existing Prisma schema without adding shipment or order-item tables.

**Architecture:** `distribution-plan.service.js` owns plan reads, draft edits, and state transitions. `distribution-shipment.service.js` owns the single transaction that converts finalized plan items into one branch/flower order each, allocates FIFO batches, writes movements, and marks the plan `ORDER_CREATED`. Controllers and routes remain thin HTTP adapters.

**Tech Stack:** CommonJS Node.js, Express 5, Prisma 7, PostgreSQL, Jest.

## Global Constraints

- Do not add shipment or order-item tables.
- `DistributionPlan` acts as the dispatch group.
- Each non-zero `DistributionPlanItem` becomes one `DistributionOrder` for one branch and one flower.
- Only `DRAFT` plans may be edited or finalized.
- A null `finalQuantity` becomes `recommendedQuantity` during finalization.
- A changed final quantity requires `adjustmentReason`.
- Shipment must be one Prisma transaction and must roll back completely on insufficient stock.
- Shipment allocates FIFO by `receivedDate`, then `createdAt`.
- Staff Head Office manages plans and shipments; Superadmin is read-only; Staff Branch has no planning access.
- Do not commit changes unless explicitly requested.

---

### Task 1: Plan Service And Read Endpoints

**Files:**
- Create: `src/services/distribution-plan.service.js`
- Create: `src/controllers/distribution-plan.controller.js`
- Create: `src/routes/distribution-plan.routes.js`
- Modify: `src/routes/index.js`
- Create: `test/distribution-plan.service.test.js`
- Create: `test/distribution-plan.controller.test.js`

**Interfaces:**
- Produces `list(pagination)`, `getById(id)`, `updateItem(planId, itemId, payload)`, and `finalize(id)` from `distribution-plan.service.js`.
- `GET /distribution-plans` returns `{ success: true, data, pagination }`.
- `GET /distribution-plans/:id` returns `{ success: true, data }`.
- `PATCH /distribution-plans/:planId/items/:itemId` accepts `{ finalQuantity, adjustmentReason }`.
- `POST /distribution-plans/:id/finalize` returns the finalized plan.

- [ ] **Step 1: Write failing service tests**

Test that `getById` returns plan items ordered by branch and flower, rejects an unknown plan with `HttpError(404)`, and rejects updates when the plan status is not `DRAFT`.

Test that changing `finalQuantity` without a non-empty `adjustmentReason` throws status `422`, while setting a quantity equal to `recommendedQuantity` does not require a reason.

Test that finalization updates null `finalQuantity` values to `recommendedQuantity` and changes the plan to `FINALIZED` in one transaction.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```powershell
npm test -- --runInBand test/distribution-plan.service.test.js
```

Expected: FAIL because the distribution-plan service does not exist.

- [ ] **Step 3: Implement the service**

Use Prisma transactions for item updates and finalization. Validate positive plan/item IDs, non-negative decimal quantities with the existing minor-unit helpers, plan ownership of the item, and the `DRAFT` state before mutations. Finalization must update every null `finalQuantity` and then set the plan status to `FINALIZED`.

- [ ] **Step 4: Add controller and route adapters**

Use `authenticate` for every route. Allow `SUPERADMIN` and `STAFF_HEAD_OFFICE` on the two GET routes. Allow only `STAFF_HEAD_OFFICE` on PATCH and finalize routes. Pass errors to `next`.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm test -- --runInBand test/distribution-plan.service.test.js test/distribution-plan.controller.test.js
```

Expected: all focused tests pass.

---

### Task 2: FIFO Allocation Movement Details

**Files:**
- Modify: `src/utils/fifo.js`
- Create: `test/fifo.test.js` if the current test file is absent
- Modify: `test/fifo.test.js` if it exists

**Interfaces:**
- `allocateHOBatches(tx, { flowerId, quantity })` continues to return allocations, now including `qtyBefore` and `qtyAfter` for each batch.

- [ ] **Step 1: Write the failing test**

Add a test with two available batches where the requested quantity spans both batches. Assert FIFO order and that each allocation includes the batch quantity before and after allocation.

- [ ] **Step 2: Run the focused FIFO test**

Run:

```powershell
npm test -- --runInBand test/fifo.test.js
```

Expected: FAIL because allocation metadata does not currently include before/after quantities.

- [ ] **Step 3: Implement the smallest FIFO change**

Capture `qtyBefore` before each batch update and return `qtyAfter` after calculating the new quantity. Preserve the existing transaction rollback behavior when total stock is insufficient.

- [ ] **Step 4: Run the FIFO tests**

Run:

```powershell
npm test -- --runInBand test/fifo.test.js
```

Expected: all FIFO tests pass.

---

### Task 3: Transactional Plan Shipment

**Files:**
- Create: `src/services/distribution-shipment.service.js`
- Create: `test/distribution-shipment.service.test.js`

**Interfaces:**
- Produces `shipPlan(planId, { prismaClient })` for tests and `shipPlan(planId)` for production.
- Returns `{ planId, orders: [{ orderId, branchId, flowerId, quantity, status }] }`.

- [ ] **Step 1: Write failing shipment tests**

Test that a non-`FINALIZED` plan is rejected with status `409`.

Test that a finalized plan with two branch/flower items creates two orders, allocates FIFO batches, creates allocation rows, creates `DISTRIBUTION_OUT` movements with `locationType: "HO"`, `branchId: null`, `referenceType: "DISTRIBUTION_ORDER"`, and changes each order to `IN_TRANSIT` with `shippedAt`.

Test that the plan changes to `ORDER_CREATED` only after all items succeed.

Test that insufficient stock causes the transaction callback to reject and does not call the plan status update after the failed allocation.

- [ ] **Step 2: Run the focused shipment tests**

Run:

```powershell
npm test -- --runInBand test/distribution-shipment.service.test.js
```

Expected: FAIL because the shipment service does not exist.

- [ ] **Step 3: Implement the shipment transaction**

Inside one `prisma.$transaction` callback:

1. Load the plan and items using the transaction client.
2. Reject unless status is `FINALIZED`.
3. For every item with positive final quantity, create a `DRAFT` order for its branch.
4. Call `allocateHOBatches` for its flower and final quantity.
5. Create one `DistributionBatchAllocation` per returned allocation.
6. Create one `InventoryMovement` per allocation using the returned `qtyBefore` and `qtyAfter`.
7. Update the order to `IN_TRANSIT` and set `shippedAt`.
8. Update the plan to `ORDER_CREATED`.
9. Return created order IDs with their source plan item data.

Do not catch allocation errors inside the transaction. Let Prisma roll back every earlier order, batch update, allocation, movement, and plan mutation.

- [ ] **Step 4: Run shipment tests**

Run:

```powershell
npm test -- --runInBand test/distribution-shipment.service.test.js
```

Expected: all shipment tests pass.

---

### Task 4: Shipment Route And End-to-End Verification

**Files:**
- Modify: `src/controllers/distribution-plan.controller.js`
- Modify: `src/routes/distribution-plan.routes.js`
- Create: `test/distribution-plan.routes.test.js` if route coverage is not already provided

**Interfaces:**
- Adds `POST /distribution-plans/:id/ship` for `STAFF_HEAD_OFFICE`.
- Returns HTTP `201` with the shipment service result.

- [ ] **Step 1: Write the failing controller/route test**

Mock `shipPlan`, send a request as Head Office staff, and assert the controller passes the route parameter as a number and returns `{ success: true, data }`. Assert that a non-Head-Office role is rejected by `authorizeRoles`.

- [ ] **Step 2: Run the focused route test**

Run:

```powershell
npm test -- --runInBand test/distribution-plan.routes.test.js
```

Expected: FAIL because the shipment route is not registered.

- [ ] **Step 3: Wire the controller and route**

Call `distributionShipmentService.shipPlan(req.params.id)` inside the controller, pass failures to `next`, and register the route under the distribution-plan router with `authenticate` and `authorizeRoles("STAFF_HEAD_OFFICE")`.

- [ ] **Step 4: Run all backend tests and application-load verification**

Run:

```powershell
npm test -- --runInBand
node -e "require('./src/app'); console.log('Express app loaded')"
```

Expected: all tests pass and the app loads without route or Prisma import errors.

- [ ] **Step 5: Verify through Postman**

1. Login as `STAFF_HEAD_OFFICE`.
2. `GET /distribution-plans` and select a `DRAFT` plan.
3. `PATCH /distribution-plans/:id/items/:itemId` with a changed `finalQuantity` and an `adjustmentReason`.
4. `POST /distribution-plans/:id/finalize`.
5. `POST /distribution-plans/:id/ship`.
6. Confirm response order IDs, plan status `ORDER_CREATED`, order status `IN_TRANSIT`, reduced FIFO batch quantities, allocation rows, and `DISTRIBUTION_OUT` movements in PostgreSQL.
