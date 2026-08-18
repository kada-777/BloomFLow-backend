# Distribution Workflow Design

## Goal

Implement distribution-plan review and shipment behavior using the existing Prisma schema, without adding shipment or order-item tables.

## Domain Mapping

- `DistributionPlan` is the dispatch group.
- Each `DistributionPlanItem` supplies one order operation: one branch, one flower, and one quantity.
- `DistributionOrder` records the branch shipment; its flower and quantity are represented by its batch allocations.
- `DistributionBatchAllocation` records the FIFO Head Office batches used for that order.
- `InventoryMovement` records the `DISTRIBUTION_OUT` audit event.

## Plan Workflow

### Draft editing

Only `DRAFT` plans can be edited. A plan item may update `finalQuantity`. If the new value differs from `recommendedQuantity`, `adjustmentReason` is required. Quantities must be non-negative decimals and the item must belong to the selected plan.

### Finalization

Only `DRAFT` plans can be finalized. Any `finalQuantity` that is still null is set to `recommendedQuantity`. The plan then changes to `FINALIZED`. Finalized and order-created plans cannot be edited or finalized again.

## Shipment Workflow

`POST /distribution-plans/:id/ship` accepts only a `FINALIZED` plan. One Prisma transaction processes every plan item whose final quantity is greater than zero:

1. Create a `DRAFT` `DistributionOrder` for the item branch.
2. Allocate the item quantity from available Head Office flower batches in FIFO order by `receivedDate`, then `createdAt`.
3. Decrease every allocated batch's `availableQuantity` and mark exhausted batches `DEPLETED`.
4. Create `DistributionBatchAllocation` rows for the order.
5. Create `DISTRIBUTION_OUT` movements at Head Office with the source batch and order reference.
6. Set the order `shippedAt` and status to `IN_TRANSIT`.
7. Set the plan status to `ORDER_CREATED`.
8. Return the created order IDs grouped with their branch and flower plan items.

If any item cannot be fully supplied, the transaction fails with a validation error and all order, allocation, batch, movement, and plan changes roll back.

## API Surface

- `GET /distribution-plans`: paginated plan list for Superadmin and Head Office staff.
- `GET /distribution-plans/:id`: plan with its items. It cannot reliably show order status because the existing schema has no plan-to-order relation.
- `PATCH /distribution-plans/:id/items/:itemId`: edit a draft item.
- `POST /distribution-plans/:id/finalize`: finalize a draft plan.
- `POST /distribution-plans/:id/ship`: allocate and ship a finalized plan.

The ship response is the authoritative link between this plan operation and the created order IDs. Later order lookup uses `GET /distributions/:id`.

All endpoints require authentication. Superadmin has read-only access. Staff Head Office can edit, finalize, and ship. Staff Branch cannot access planning operations.

## Error Behavior

- `404` when a plan or item does not exist.
- `409` for invalid plan state transitions.
- `422` for invalid quantities, missing adjustment reasons, or insufficient Head Office stock.
- All errors use the existing structured JSON error format.

## Testing

- Draft item edits reject non-draft plans and missing adjustment reasons.
- Finalization fills null final quantities and rejects repeated finalization.
- Shipment allocates multiple batches in FIFO order.
- Shipment creates the expected movement and order state.
- Insufficient stock rolls back the entire transaction.
- Role restrictions protect planning endpoints.
