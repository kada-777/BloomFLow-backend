# RFC-008: Distribution Receiving and Reconciliation

- **Status:** Proposed
- **Owner:** Backend

## Validation

Untuk setiap receipt item:

```text
receivedQuantity + damagedQuantity + missingQuantity = shippedQuantity
all quantities >= 0
```

## Processing Decision

Backend memvalidasi ownership branch dan status `IN_TRANSIT`, lalu memvalidasi seluruh item dalam satu transaksi. Hanya `receivedQuantity` yang membuat branch stock lot dan `DISTRIBUTION_IN` movement. `damagedQuantity` serta `missingQuantity` tidak masuk stok cabang dan tidak membuat `DAMAGED_OUT`; keduanya disimpan untuk rekonsiliasi/audit logistik. Order baru berubah menjadi `RECEIVED` setelah transaksi berhasil.
