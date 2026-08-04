# BloomFlow Entity Relationship Diagram

Based on RFC-009 (PostgreSQL Data Model) and the Prisma schema.

## ERD

```mermaid
erDiagram
    users {
        int id PK
        varchar email UK
        varchar password
        enum role
        int branchId FK
        boolean isActive
    }

    farms {
        int id PK
        varchar name
        text location
    }

    branches {
        int id PK
        varchar name
        text location
    }

    flowers {
        int id PK
        varchar name
        varchar variety
    }

    system_configurations {
        varchar key PK
        text value
        int updatedBy FK
        datetime updatedAt
    }

    token_blacklist {
        varchar jti PK
        datetime expiresAt
    }

    receivings {
        int id PK
        int farmId FK
        date receivedDate
        varchar status
    }

    receiving_items {
        int id PK
        int receivingId FK
        int flowerId FK
        decimal shippedQuantity
        decimal actualReceivedQuantity
        decimal acceptedQuantity
        decimal unusableQuantity
        text unusableNotes
    }

    flower_batches {
        int id PK
        varchar batchNumber UK
        int receivingId FK
        int flowerId FK
        date receivedDate
        decimal initialQuantity
        decimal availableQuantity
        enum status
        datetime createdAt
    }

    forecast_runs {
        int id PK
        datetime executedAt
        varchar modelVersion
        enum forecastMethod
        datetime trainingDataUntil
    }

    forecast_results {
        int id PK
        int runId FK
        int branchId FK
        int flowerId FK
        decimal forecastDemand
        varchar forecastPeriod
        decimal confidenceInterval
    }

    distribution_plans {
        int id PK
        enum status
        date planningDate
    }

    distribution_plan_items {
        int id PK
        int distributionPlanId FK
        int branchId FK
        int flowerId FK
        decimal recommendedQuantity
        decimal finalQuantity
        varchar adjustmentReason
    }

    distribution_orders {
        int id PK
        int branchId FK
        enum status
        datetime shippedAt
    }

    distribution_batch_allocations {
        int id PK
        int distributionOrderId FK
        int batchId FK
        decimal quantity
    }

    distribution_receipts {
        int id PK
        int distributionOrderId UK
        datetime receivedAt
    }

    distribution_receipt_items {
        int id PK
        int distributionReceiptId FK
        int flowerId FK
        decimal receivedQuantity
        decimal damagedQuantity
        decimal missingQuantity
    }

    branch_stock_lots {
        int id PK
        int branchId FK
        int flowerId FK
        int sourceOrderId FK
        decimal quantity
        datetime shippedAt
    }

    daily_sales {
        int id PK
        int branchId FK
        date salesDate
    }

    daily_sales_items {
        int id PK
        int dailySaleId FK
        int flowerId FK
        decimal soldQuantity
        decimal damagedQuantity
    }

    inventory_movements {
        bigint id PK
        int flowerId FK
        enum locationType
        int branchId FK
        int batchId FK
        enum type
        decimal quantity
        decimal qtyBefore
        decimal qtyAfter
        enum referenceType
        int referenceId
        datetime createdAt
    }

    users ||--o| branches : "belongs to"
    system_configurations ||--|| users : "updated by"
    receivings ||--|| farms : "from farm"
    receivings ||--|{ receiving_items : "has items"
    receiving_items ||--|| flowers : "for flower"
    flower_batches ||--|| receivings : "from receiving"
    flower_batches ||--|| flowers : "for flower"
    flower_batches ||--o{ distribution_batch_allocations : "allocated in"
    flower_batches ||--o{ inventory_movements : "tracked by"
    forecast_runs ||--|{ forecast_results : "produces"
    forecast_results ||--|| branches : "for branch"
    forecast_results ||--|| flowers : "for flower"
    distribution_plans ||--|{ distribution_plan_items : "has items"
    distribution_plan_items ||--|| branches : "for branch"
    distribution_plan_items ||--|| flowers : "for flower"
    distribution_orders ||--|| branches : "to branch"
    distribution_orders ||--o{ distribution_batch_allocations : "allocates batches"
    distribution_orders ||--o| distribution_receipts : "has receipt"
    distribution_receipts ||--|{ distribution_receipt_items : "has items"
    distribution_receipt_items ||--|| flowers : "for flower"
    branch_stock_lots ||--|| branches : "at branch"
    branch_stock_lots ||--|| flowers : "for flower"
    branch_stock_lots ||--|| distribution_orders : "from order"
    daily_sales ||--|| branches : "at branch"
    daily_sales ||--|{ daily_sales_items : "has items"
    daily_sales_items ||--|| flowers : "for flower"
    inventory_movements ||--|| flowers : "for flower"
    inventory_movements ||--o| branches : "at branch"
    inventory_movements ||--o| flower_batches : "for batch"
```

## Tables

| Table | Description |
|-------|-------------|
| `users` | System users with roles (SUPERADMIN, STAFF_HEAD_OFFICE, STAFF_BRANCH) |
| `farms` | Flower supplier farms |
| `branches` | Distribution branches |
| `flowers` | Flower catalog (name + variety) |
| `system_configurations` | Key-value system settings |
| `token_blacklist` | JWT blacklist for logout |
| `receivings` | Head Office receiving records from farms |
| `receiving_items` | Line items per receiving (per flower) |
| `flower_batches` | HO inventory batches created from accepted receiving quantities |
| `forecast_runs` | ML/baseline forecast execution metadata |
| `forecast_results` | Per branch+flower demand forecasts |
| `distribution_plans` | Distribution planning sessions |
| `distribution_plan_items` | Recommended/final quantities per branch+flower |
| `distribution_orders` | Shipment orders to branches |
| `distribution_batch_allocations` | FIFO batch allocation per order |
| `distribution_receipts` | Branch-side receiving confirmation |
| `distribution_receipt_items` | Received/damaged/missing quantities per flower |
| `branch_stock_lots` | Branch inventory lots (age tracked from shippedAt) |
| `daily_sales` | Daily sales report per branch |
| `daily_sales_items` | Sold/damaged quantities per flower |
| `inventory_movements` | Immutable audit trail for all stock changes |

## Key Constraints

```sql
-- Receiving validation
CHECK (accepted_quantity + unusable_quantity = actual_received_quantity)
CHECK (actual_received_quantity <= shipped_quantity)

-- Distribution receiving validation
CHECK (received_quantity + damaged_quantity + missing_quantity = shipped_quantity)

-- General
CHECK (quantity >= 0)
CHECK (available_quantity >= 0)

-- Uniqueness
UNIQUE (branch_id, sales_date)
UNIQUE (distribution_order_id, batch_id)
```

## Movement Types

| Type | Description |
|------|-------------|
| `RECEIVING_IN` | Stock enters HO from farm receiving |
| `DISTRIBUTION_OUT` | Stock leaves HO during shipment |
| `DISTRIBUTION_IN` | Stock arrives at branch |
| `SALE_OUT` | Stock sold to customer |
| `DAMAGED_OUT` | Stock marked as damaged |

## Status Enums

| Enum | Values |
|------|--------|
| `BatchStatus` | AVAILABLE, DEPLETED |
| `DistributionPlanStatus` | DRAFT, FINALIZED, ORDER_CREATED |
| `DistributionOrderStatus` | DRAFT, IN_TRANSIT, RECEIVED, CANCELLED |
| `ForecastMethod` | ML, BASELINE |
| `InventoryMovementType` | RECEIVING_IN, DISTRIBUTION_OUT, DISTRIBUTION_IN, SALE_OUT, DAMAGED_OUT |
| `UserRole` | SUPERADMIN, STAFF_HEAD_OFFICE, STAFF_BRANCH |

## Recommended Indexes

```sql
-- FIFO batch allocation
CREATE INDEX idx_flower_batches_fifo ON flower_batches(flower_id, status, received_date, created_at);
CREATE INDEX idx_branch_stock_lots_fifo ON branch_stock_lots(branch_id, flower_id, status, shipped_at);

-- Dashboard queries
CREATE INDEX idx_daily_sales_dashboard ON daily_sales(branch_id, sales_date);
CREATE INDEX idx_forecast_results_lookup ON forecast_results(branch_id, flower_id, forecast_period);
CREATE INDEX idx_distribution_orders_status ON distribution_orders(branch_id, status);
CREATE INDEX idx_inventory_movements_audit ON inventory_movements(reference_type, reference_id);
```
