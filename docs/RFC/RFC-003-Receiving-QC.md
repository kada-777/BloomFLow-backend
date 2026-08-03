# RFC-003: Receiving and Quality Control

- **Status:** Proposed
- **Owner:** Backend

## Validation

Untuk setiap receiving item:

```text
acceptedQuantity + unusableQuantity = actualReceivedQuantity
actualReceivedQuantity <= shippedQuantity
all quantities >= 0
```

Satu receiving memiliki banyak receiving item. `unusableQuantity` tetap disimpan bersama catatannya untuk audit dan evaluasi farm.

## Processing Decision

Penyelesaian receiving dan QC memakai satu transaksi database: validasi header dan semua item, simpan receiving/item, buat satu batch untuk setiap `acceptedQuantity > 0`, dan buat `RECEIVING_IN` untuk setiap accepted item. Hanya accepted quantity yang masuk inventory; unusable tidak membuat batch atau inventory movement. Jika satu langkah gagal, transaksi dibatalkan seluruhnya.
