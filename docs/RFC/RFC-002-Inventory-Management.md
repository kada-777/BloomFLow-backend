# RFC-002: Inventory and Stock Movement

- **Status:** Proposed
- **Owner:** Backend and Database

## Decision

Stok Head Office disimpan sebagai flower batch; stok cabang disimpan sebagai branch stock lot yang melacak asal distribusi/batch. Batch dibuat otomatis dari accepted quantity pada receiving. Alokasi dan pengurangan stok menggunakan FIFO: `receivedDate`, lalu `createdAt` untuk batch HO; `shippedAt` untuk lot cabang.

## Movement Types

`RECEIVING_IN`, `DISTRIBUTION_OUT`, `DISTRIBUTION_IN`, `SALE_OUT`, dan `DAMAGED_OUT` adalah movement MVP. Setiap perubahan stok valid membuat record immutable berisi quantity before/after, reference type/id, pelaku, dan waktu.

## Invariants

- Kuantitas stok tidak boleh negatif.
- Bunga unusable saat receiving tidak masuk stok dan tidak membuat movement.
- Semua perubahan multi-item berjalan dalam satu transaksi dan rollback jika ada item gagal.
- Stok yang terkunci dan tervalidasi ulang tidak boleh dialokasikan melebihi quantity tersedia.

## Aging

Umur bunga cabang dihitung sejak `shippedAt`: default hari 0-7 `FRESH`, hari 8-11 `GRADE_C`, setelahnya `DAMAGED`. Durasi bersifat konfigurabel. Lot `DAMAGED` tidak boleh dijual.
