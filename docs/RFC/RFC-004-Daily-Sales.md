# RFC-004: Daily Sales Processing

- **Status:** Proposed
- **Owner:** Backend

## Identity and Ownership

Daily sales hanya dibuat Staff Branch untuk branch yang berasal dari JWT. Satu branch hanya dapat memiliki satu sales record per tanggal: `UNIQUE(branchId, salesDate)`.

## Rules

Setiap item memuat `flowerId`, `soldQuantity`, dan `damagedQuantity`; keduanya tidak negatif dan totalnya tidak boleh melebihi usable stock. Lot `DAMAGED` tidak dapat dijual.

## Atomic Workflow

Backend mengunci lot relevan, memvalidasi semua item, lalu mengurangi lot dengan FIFO dan membuat `SALE_OUT`/`DAMAGED_OUT` dalam satu transaksi. Tidak ada pengurangan parsial: kekurangan stok pada salah satu item membatalkan seluruh transaksi dan menghasilkan `422 Unprocessable Entity` dengan detail requested/available quantity.
