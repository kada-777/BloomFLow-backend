# RFC-009: PostgreSQL Data Model

- **Status:** Proposed
- **Owner:** Backend and Database

## Core Tables

`users`, `farms`, `branches`, `flowers`, `system_configurations`, `receivings`, `receiving_items`, `flower_batches`, `branch_stock_lots`, `daily_sales`, `daily_sales_items`, `forecast_runs`, `forecast_results`, `distribution_plans`, `distribution_plan_items`, `distribution_orders`, `distribution_order_items`, `distribution_batch_allocations`, `distribution_receipts`, `distribution_receipt_items`, dan `inventory_movements`.

## Required Constraints

```sql
CHECK (quantity >= 0);
CHECK (accepted_quantity + unusable_quantity = actual_received_quantity);
CHECK (actual_received_quantity <= shipped_quantity);
CHECK (received_quantity + damaged_quantity + missing_quantity = shipped_quantity);
CHECK (available_quantity >= 0);
UNIQUE (branch_id, sales_date);
```

## Integrity and Transactions

Foreign keys menjaga relasi receiving-to-items, plan-to-order, order-to-allocation, receipt-to-items, dan movement-to-source. Tabel operational menyimpan audit columns. Workflow yang mengubah stok memakai transaksi PostgreSQL dan row locking (`FOR UPDATE` atau ekuivalen Prisma) agar semua mutation serta inventory movement commit atau rollback bersama.

## Recommended Indexes

Index FIFO: `flower_batches(flower_id, status, received_date, created_at)` dan `branch_stock_lots(branch_id, flower_id, status, shipped_at)`. Tambahkan index untuk query dashboard pada daily sales, forecast results, distribution orders, dan inventory movements.
