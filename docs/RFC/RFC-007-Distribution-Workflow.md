# RFC-007: Distribution Planning and Order State Machine

- **Status:** Proposed
- **Owner:** Backend

## State Machine

```text
Distribution Plan:  DRAFT --finalize--> FINALIZED --create order--> ORDER_CREATED
Distribution Order: DRAFT --ship--> IN_TRANSIT --receive--> RECEIVED
                    DRAFT --cancel--> CANCELLED
```

## Rules

Hanya plan `DRAFT` dapat diedit/finalize; hanya `FINALIZED` dapat membuat order; `ORDER_CREATED` tidak boleh digunakan kembali. Perubahan final quantity dari recommendation harus menyertakan adjustment reason. Staff Head Office mengelola plan/order; Staff Branch hanya menerima order untuk branch JWT-nya.

## Shipping

Saat ship, backend memvalidasi status dan semua quantity, mengunci batch HO, mengalokasikan FIFO, menolak seluruh shipment bila stok kurang, mengurangi stok HO, membuat `DISTRIBUTION_OUT`, menyimpan `shippedAt`, lalu mengubah status menjadi `IN_TRANSIT` dalam satu transaksi.
