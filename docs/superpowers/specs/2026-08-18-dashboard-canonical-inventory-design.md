# Dashboard Canonical Inventory Sources

## Goal

Make the Head Office dashboard report current inventory and period activity from the records that currently contain the business data, without changing inventory mutation, FIFO, validation, or API response contracts.

## Problem

The dashboard currently reconstructs most stock metrics from `inventory_movements`. This requires a complete movement history, but the current database has no movement rows while it contains receivings, flower batches, distribution records, branch stock lots, and daily sales. As a result, the Head Office dashboard returns zero for metrics whose underlying business data exists.

Current stock is stored in `flower_batches` for Head Office and `branch_stock_lots` for branches. `inventory_movements` remains an immutable audit trail, not the authoritative balance table.

## Scope

- Keep the existing dashboard endpoints, query parameters, and response fields unchanged.
- Read current Head Office stock from available flower batch balances.
- Read current branch stock from usable branch stock lots, respecting an optional branch filter.
- Calculate period activity from receiving, distribution, receipt, and daily-sales records.
- Calculate current branch flower-status totals from branch stock lot age.
- Preserve the existing `today`, 7-day, 30-day, and 60-day periods.
- Preserve all existing inventory writes, transactions, FIFO deductions, nonnegative-stock checks, and movement creation.

Historical movement backfilling is not part of this change. It can be performed separately after defining reconstruction and validation rules.

## Data Sources

### Current Balances

- `headOfficeStock`: sum `flower_batches.availableQuantity` for available, nonzero batches.
- `totalBranchStock`: sum nonzero `branch_stock_lots.quantity` whose calculated status is `FRESH` or `GRADE_C`.
- A selected `branchId` limits branch lots and branch transaction metrics to that branch.
- Branch dashboards continue to use the authenticated user's branch ID.

Current balances do not depend on the selected dashboard period.

### Period Activity

- `headOfficeReceivedStock` and `headOfficeStockAdded`: sum `receiving_items.acceptedQuantity`, filtered by `receivings.receivedDate`.
- `headOfficeDamagedStock`: sum `receiving_items.unusableQuantity` over the same receiving period.
- `headOfficeStockOut` and `headOfficeStockRemoved`: sum shipped distribution allocations for orders whose `shippedAt` is in the period.
- `branchStockReceived` and `totalBranchStockAdded`: sum `distribution_receipt_items.receivedQuantity`, filtered by receipt time and optional order branch.
- `branchSoldOut`: sum `daily_sales_items.soldQuantity`, filtered by `daily_sales.salesDate` and optional branch.
- `branchDamagedOut`: sum `daily_sales_items.damagedQuantity` over the same sales period.
- `branchStockOut` and `totalBranchStockRemoved`: `branchSoldOut + branchDamagedOut`.
- Net activity and combined `stockAdded`/`stockRemoved` fields retain their existing formulas using these source totals.

The `today` period can correctly return zero activity when no transactions exist for the current UTC date. This does not affect current-balance fields.

### Flower Status

The `flowerStatus` summary represents current branch lot quantities classified with the configured fresh and Grade C periods:

- `FRESH`: current fresh lot quantity.
- `GRADE_C`: current Grade C lot quantity.
- `DAMAGED`: current aged/damaged lot quantity.

Damaged lots appear in the status summary but are excluded from `totalBranchStock`, matching the existing usable-stock rule.

## Inventory Movement Rule

Inventory mutation services continue creating immutable movement records:

- Receiving creates `RECEIVING_IN`.
- Distribution shipment creates `DISTRIBUTION_OUT`.
- Branch receipt creates `DISTRIBUTION_IN`.
- Daily sales create `SALE_OUT` and `DAMAGED_OUT`.

The dashboard no longer requires the audit ledger to reconstruct balances or historical activity. Direct database writes remain unsupported because they can bypass validation, stock updates, and audit creation.

## Error Handling

- Keep the current validation for period and branch query parameters.
- Null aggregate values are returned as numeric zero.
- Existing dashboard authorization and branch scoping remain unchanged.
- No fallback between movements and business tables is introduced, avoiding partial-history double counting.

## Testing

- Add a Head Office dashboard regression test where branch lots are positive and movements are empty; `totalBranchStock` must use the usable lot balance.
- Verify damaged lots are excluded from current branch stock but included in the damaged flower-status total.
- Verify current Head Office stock comes from available flower batches and is independent of the selected period.
- Verify receiving, shipment, branch receipt, sale, and damaged quantities populate their corresponding period fields without movement rows.
- Verify `today` returns zero period activity when no current-day transactions exist while current stock remains nonzero.
- Verify optional branch filtering affects branch balances, receipts, sales, and damage but not national Head Office receiving totals.
- Keep the existing branch dashboard and period-validation tests.
- Run the focused dashboard tests, then the complete Jest suite.

## Success Criteria

- The current database's Head Office dashboard reports usable branch stock from existing branch lots instead of zero.
- Current-balance cards remain correct even when the movement ledger is empty.
- Period cards reflect existing business transactions for the selected period.
- New receiving, distribution, receipt, and daily-sales workflows continue to update balances and create movements without behavior changes.
