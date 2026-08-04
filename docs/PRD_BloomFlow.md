# Product Requirements Document

## Flower Distribution Planning System with AI/ML Forecasting

**Jenis aplikasi:** Internal Enterprise Application  
**Nama aplikasi:** BloomFlow  
**Platform:** Web Application  
**Durasi pengembangan:** 2 minggu  
**Bahasa aplikasi:** Inggris  
**Database:** PostgreSQL  
**Fokus utama:** Pengelolaan stok dan distribusi bunga dari Head Office ke cabang dengan forecast demand dan rekomendasi distribusi menggunakan AI/ML.

---

## 1. Product Overview

Flower Distribution Planning System adalah aplikasi internal untuk membantu perusahaan florist mengelola penerimaan bunga dari kebun, quality control, stok Head Office, distribusi ke cabang, stok cabang, dan penjualan harian.

Proses bisnis dimulai ketika Staff Head Office menerima bunga dari kebun. Setiap bunga menjalani quality control dan diklasifikasikan sebagai `accepted` atau `unusable`. Hanya bunga `accepted` yang dibuatkan batch dan masuk ke stok Head Office. Bunga rusak, ditolak, atau tidak layak tetap dicatat dalam hasil receiving dan QC sebagai `unusable`, tetapi tidak pernah masuk ke inventory.

Data penjualan, stok cabang, stok dalam perjalanan, safety stock, dan data historis lain digunakan oleh engine AI/ML untuk menghasilkan forecast demand dan rekomendasi jumlah distribusi. Staff Head Office tetap menjadi pengambil keputusan akhir dan dapat mengubah hasil rekomendasi dengan alasan yang wajib dicatat.

AI/ML digunakan untuk melakukan prediksi dan rekomendasi, bukan untuk sekadar menjelaskan distribution plan. Seluruh perubahan stok dan validasi operasional tetap dilakukan oleh backend menggunakan aturan bisnis yang deterministik.

---

## 2. Problem Statement

Perusahaan florist dengan beberapa cabang perlu mengirim bunga dalam jumlah yang sesuai dengan kebutuhan masing-masing cabang. Pola penjualan setiap cabang dan setiap jenis bunga dapat berbeda, sehingga distribusi berdasarkan perkiraan manual berisiko menyebabkan kekurangan atau kelebihan stok.

Kelebihan stok dapat meningkatkan jumlah bunga Grade C dan Damaged, sedangkan kekurangan stok dapat menyebabkan hilangnya peluang penjualan. Karena bunga memiliki umur jual pendek, perencanaan distribusi perlu mempertimbangkan data historis, stok saat ini, stok dalam perjalanan, dan umur bunga.

Sistem dibutuhkan untuk:

- Mengetahui stok bunga di Head Office dan seluruh cabang.
- Mengetahui stok dalam perjalanan.
- Mengetahui riwayat penjualan setiap cabang.
- Mencatat bunga unusable dari kebun atau rusak selama pengiriman.
- Memprediksi kebutuhan bunga pada periode berikutnya.
- Menghasilkan rekomendasi distribusi berbasis AI/ML.
- Memungkinkan Staff Head Office menyesuaikan rekomendasi secara terkontrol.
- Menyediakan histori perubahan stok yang dapat diaudit.

---

## 3. Product Goals

- Memusatkan data receiving, stok, distribusi, dan penjualan seluruh cabang.
- Membantu Staff Head Office memantau kebutuhan seluruh cabang.
- Menghasilkan forecast demand menggunakan model AI/ML.
- Menghasilkan rekomendasi distribusi menggunakan hasil forecast dan kondisi inventory.
- Mempertahankan keputusan akhir pada Staff Head Office.
- Mencatat bunga rusak atau tidak layak tanpa memasukkannya ke stok.
- Memantau status Fresh, Grade C, dan Damaged.
- Menyediakan inventory movement yang lengkap dan dapat diaudit.
- Membatasi akses sesuai role dan cabang.

---

## 4. Scope Aplikasi

### 4.1 In Scope

- Authentication dan role-based access control.
- User, farm, branch, flower, dan system configuration management.
- Receiving dan quality control dari kebun ke Head Office.
- Pencatatan accepted dan unusable quantity.
- Pembuatan batch otomatis untuk bunga accepted.
- Stok Head Office dan stok seluruh cabang.
- Daily sales dan pencatatan bunga rusak di cabang.
- Forecast demand menggunakan AI/ML.
- Rekomendasi distribusi menggunakan AI/ML dan inventory constraints.
- Penyesuaian rekomendasi oleh Staff Head Office.
- Distribution plan dan distribution order.
- Distribution receiving, termasuk damaged dan missing in transit.
- Automatic flower status.
- Inventory movement.
- Dashboard Head Office dan dashboard cabang.
- Monitoring seluruh data operasional secara read-only oleh Superadmin.

### 4.2 Out of Scope

- Akun Staff Kebun.
- Pencatatan panen oleh kebun.
- Farm shipment workflow sebelum receiving di Head Office.
- Return workflow ke kebun.
- Approval distribusi oleh Superadmin.
- AI-generated explanation atau chatbot distribution plan.
- Generative AI yang mengubah data atau membuat order.
- Transaksi pelanggan, invoice, dan pembayaran.
- Manual stock adjustment tanpa workflow resmi.
- Auto retraining kompleks dan MLOps penuh.
- Forecast accuracy dashboard tingkat lanjut.

---

## 5. User Roles and Access

### 5.1 Superadmin

Superadmin berfokus pada konfigurasi dan monitoring. Superadmin dapat melihat seluruh data, tetapi tidak menjalankan aktivitas operasional.

#### Akses Konfigurasi

- Membuat dan mengubah pengguna.
- Menentukan role dan cabang pengguna.
- Mengaktifkan atau menonaktifkan pengguna.
- Reset password.
- Mengelola master data kebun.
- Mengelola master data cabang.
- Mengelola master data bunga.
- Mengatur default safety stock.
- Mengatur parameter umur Fresh dan Grade C.
- Mengatur parameter model AI/ML yang diperbolehkan, seperti planning horizon dan minimum history.

#### Akses Lihat Seluruh Data

- Receiving dan hasil QC.
- Batch dan stok Head Office.
- Stok seluruh cabang.
- Daily sales seluruh cabang.
- Forecast dan rekomendasi AI/ML.
- Distribution plan dan distribution order.
- Distribution receiving.
- Inventory movement.

#### Batasan

Superadmin tidak dapat:

- Melakukan receiving atau QC.
- Membuat atau mengubah plan.
- Mengirim distribusi.
- Menerima distribusi cabang.
- Mencatat daily sales.
- Mengubah stok secara langsung.

### 5.2 Staff Head Office

Staff Head Office memiliki akses operasional pusat dan akses lihat ke seluruh cabang.

#### Fitur

- Membuat receiving dan melakukan QC.
- Melihat bunga accepted dan unusable.
- Melihat batch dan stok Head Office.
- Melihat stok seluruh cabang.
- Melihat histori dan tren penjualan seluruh cabang.
- Melihat stok Fresh, Grade C, Damaged, dan in transit per cabang.
- Menjalankan forecast dan recommendation generation.
- Membuat dan mengubah distribution plan berstatus `DRAFT`.
- Menyesuaikan rekomendasi dengan alasan wajib.
- Memfinalisasi distribution plan.
- Membuat distribution order.
- Mengalokasikan batch berdasarkan FIFO.
- Mengirim bunga ke cabang.
- Memantau penerimaan cabang.
- Melihat dashboard Head Office.
- Melihat inventory movement seluruh lokasi.

### 5.3 Staff Branch

Staff Branch hanya dapat mengakses data cabangnya sendiri.

#### Fitur

- Melihat stok cabang sendiri.
- Melihat status Fresh, Grade C, dan Damaged.
- Melihat distribusi yang menuju cabangnya.
- Menerima distribusi.
- Mencatat received, damaged in transit, dan missing quantity.
- Membuat daily sales.
- Mencatat sold dan damaged quantity.
- Melihat histori daily sales cabangnya.
- Melihat dashboard cabang.
- Melihat inventory movement cabangnya.

#### Batasan

Staff Branch tidak dapat melihat:

- Detail cabang lain.
- Stok Head Office.
- Master data.
- Forecast seluruh perusahaan.
- Distribution plan.
- Rekomendasi cabang lain.

---

## 6. Main Features

### 6.1 Authentication and Authorization

- Login dan logout.
- JWT authentication.
- Protected route.
- Role-based access control.
- Branch-level access control untuk Staff Branch.
- Akun aktif dan nonaktif.
- Tidak ada registrasi publik.

#### Role

- `SUPERADMIN`
- `STAFF_HEAD_OFFICE`
- `STAFF_BRANCH`

### 6.2 Configuration and Master Data

Dikelola oleh Superadmin.

- User management.
- Farm management.
- Branch management.
- Flower management.
- Safety stock configuration.
- Fresh period dan Grade C period configuration.
- Planning horizon configuration.
- Minimum historical data untuk model.
- Perubahan konfigurasi wajib menyimpan `updatedBy` dan `updatedAt`.

### 6.3 Receiving and Quality Control

Receiving dan QC digabung dalam satu modul yang dijalankan Staff Head Office.

#### Data Item Receiving

- Flower.
- Shipped quantity dari kebun.
- Actual received quantity di Head Office.
- Accepted quantity.
- Unusable quantity.
- Unusable notes.

#### Validasi

```text
acceptedQuantity + unusableQuantity = actualReceivedQuantity
actualReceivedQuantity <= shippedQuantity
```

`unusableQuantity` mencakup bunga rusak, ditolak, atau tidak layak dari pengiriman kebun ke Head Office. Data tersebut tetap disimpan dalam receiving/QC untuk kebutuhan audit dan evaluasi kebun, tetapi tidak masuk ke stok dan tidak menghasilkan inventory movement karena barang belum pernah menjadi inventory perusahaan.

Hanya `acceptedQuantity` yang menghasilkan batch dan `RECEIVING_IN`.

### 6.4 Automatic Batch and Head Office Stock

Setelah receiving selesai, sistem membuat satu batch untuk setiap flower item dengan accepted quantity lebih dari nol.

#### Data Batch

- Batch number.
- Receiving ID.
- Farm ID.
- Flower ID.
- Received date.
- Initial quantity.
- Available quantity.
- Status.

#### Status

- `AVAILABLE`
- `DEPLETED`

Alokasi stok untuk distribusi menggunakan FIFO berdasarkan `receivedDate` dan `createdAt`.

### 6.5 Branch Inventory and Flower Status

Stok cabang disimpan berdasarkan flower dan sumber distribusi/batch.

Status umur dihitung dari `shippedAt`:

- Hari 0–7: `FRESH`
- Hari 8–11: `GRADE_C`
- Setelah 11 hari: `DAMAGED`

Nilai periode dapat disimpan sebagai system configuration, dengan default Fresh tujuh hari dan Grade C empat hari.

Bunga Damaged tidak dapat dijual. Bunga Grade C masih dapat dijual sesuai kebijakan harga perusahaan.

### 6.6 Daily Sales

Dikelola oleh Staff Branch.

#### Data Item

- Flower ID.
- Sold quantity.
- Damaged quantity.

#### Aturan

- Satu cabang hanya memiliki satu daily sales per tanggal.
- Unique constraint: `branchId + salesDate`.

#### Saat Submit

- Backend memvalidasi seluruh item.
- `soldQuantity + damagedQuantity` tidak boleh melebihi stok yang dapat digunakan.
- Jika satu item gagal, seluruh transaksi ditolak dengan HTTP `422`.
- Tidak ada pengurangan stok parsial.
- Stok terlama digunakan terlebih dahulu.
- `SALE_OUT` dibuat untuk penjualan.
- `DAMAGED_OUT` dibuat untuk bunga yang rusak di cabang.
- Data disimpan sebagai input historis AI/ML.

### 6.7 AI/ML Demand Forecasting

Forecast dibuat oleh AI/ML model, bukan rumus moving average statis sebagai hasil utama.

#### Input Model

- Branch ID.
- Flower ID.
- Penjualan harian historis.
- Damaged quantity historis.
- Current usable stock.
- In-transit stock.
- Day of week.
- Tanggal dan planning horizon.
- Optional event/holiday indicator jika data tersedia.

#### Output Model

- Forecast demand per branch dan flower.
- Forecast period.
- Model version.
- Confidence atau prediction interval jika didukung model.
- Generated timestamp.

#### Pendekatan MVP

Model yang digunakan harus ringan dan dapat diselesaikan dalam dua minggu, misalnya:

- Regression.
- Random Forest.
- XGBoost.
- Model time-series sederhana.

Pemilihan final disesuaikan dengan jumlah dan kualitas data.

Jika data historis belum memenuhi minimum history, sistem menggunakan fallback baseline, misalnya moving average tujuh hari.

- Hasil fallback ditandai `forecastMethod = BASELINE`.
- Hasil model ditandai `forecastMethod = ML`.

### 6.8 AI/ML Distribution Recommendation

Recommendation engine menggunakan hasil forecast dan kondisi inventory untuk menentukan recommended quantity.

#### Input Utama

- Forecast demand dari model.
- Current branch stock.
- In-transit stock.
- Safety stock.
- Available Head Office stock.
- Minimum distribution rule bila ada.

#### Output

- Recommended quantity per branch dan flower.
- Forecast method dan model version.
- Constraint notes, misalnya rekomendasi dibatasi oleh stok HO.

Rekomendasi tidak boleh menyebabkan stok Head Office negatif. Jika total kebutuhan seluruh cabang melebihi stok HO, recommendation engine harus melakukan alokasi terbatas berdasarkan hasil prediksi dan aturan prioritas yang disepakati.

Untuk MVP, prioritas dapat menggunakan:

- Forecast demand tertinggi.
- Shortage tertinggi.

AI/ML tidak boleh langsung mengubah stok atau membuat distribution order.

### 6.9 Distribution Planning

Dikelola Staff Head Office.

#### Tabel Utama

| Cabang | Bunga | Forecast Method | Forecast Demand | Stok | In Transit | Safety Stock | ML Recommendation | Final Quantity |
|---|---|---|---:|---:|---:|---:|---:|---:|

#### Workflow

1. Staff HO memilih planning date dan planning horizon.
2. Backend mengambil data historis dan inventory snapshot.
3. AI/ML menghasilkan forecast demand.
4. Recommendation engine menghasilkan recommended quantity.
5. Staff HO meninjau hasil.
6. Staff HO dapat mengubah quantity.
7. Jika diubah, adjustment reason wajib diisi.
8. Plan difinalisasi.
9. Distribution order dibuat dari final quantity.

`adjustmentReason` hanya berfungsi sebagai catatan audit. Nilai tersebut tidak digunakan untuk melatih model secara otomatis pada MVP, tidak mengubah stok, dan tidak memicu proses lain.

#### Status

- `DRAFT`
- `FINALIZED`
- `ORDER_CREATED`

### 6.10 Distribution Order

Distribution order dibuat dari plan berstatus `FINALIZED`.

#### Status

- `DRAFT`
- `IN_TRANSIT`
- `RECEIVED`
- `CANCELLED`

#### Saat Menjadi `IN_TRANSIT`

- Batch dialokasikan dengan FIFO.
- Stok Head Office berkurang.
- `DISTRIBUTION_OUT` dibuat.
- `shippedAt` disimpan.
- Quantity menjadi in-transit.
- Umur bunga mulai dihitung.

### 6.11 Distribution Receiving

Dikelola Staff Branch untuk cabangnya sendiri.

#### Validasi

```text
receivedQuantity + damagedQuantity + missingQuantity = shippedQuantity
```

- `receivedQuantity` masuk stok cabang dan menghasilkan `DISTRIBUTION_IN`.
- `damagedQuantity` mencatat bunga yang rusak selama pengiriman HO ke cabang dan tidak masuk stok cabang.
- `missingQuantity` mencatat selisih kiriman dan tidak masuk stok cabang.
- Damaged dan missing tetap tersimpan pada distribution receiving untuk audit logistik.

Karena bunga damaged in transit sudah keluar dari stok HO tetapi tidak pernah masuk stok cabang, pencatatannya menjadi bagian dari rekonsiliasi distribution order. Tidak perlu membuat `DAMAGED_OUT` cabang untuk quantity tersebut.

### 6.12 Inventory Movement

Inventory movement hanya dibuat untuk perubahan quantity yang benar-benar pernah menjadi inventory.

#### Tipe MVP

- `RECEIVING_IN`
- `DISTRIBUTION_OUT`
- `DISTRIBUTION_IN`
- `SALE_OUT`
- `DAMAGED_OUT`

`ADJUSTMENT_IN` dan `ADJUSTMENT_OUT` tidak digunakan pada MVP karena belum ada fitur stock adjustment resmi. Penambahan tipe tersebut harus disertai workflow, otorisasi, alasan, dan approval yang jelas pada versi berikutnya.

#### Data

- Flower ID.
- Batch ID.
- Location type.
- Branch ID jika lokasi cabang.
- Movement type.
- Quantity.
- Quantity before.
- Quantity after.
- Reference type.
- Reference ID.
- Created by.
- Created at.

### 6.13 Dashboard Head Office

Dashboard HO dapat melihat agregasi pusat dan seluruh cabang:

- Total stok Head Office.
- Total stok seluruh cabang.
- Fresh, Grade C, dan Damaged stock.
- Receiving terbaru dan unusable quantity.
- Penjualan tujuh hari seluruh cabang.
- Forecast demand terbaru.
- Recommendation terbaru.
- Distribution plan terbaru.
- Distribusi in transit.
- Inventory movement terbaru.

### 6.14 Dashboard Branch

Dashboard Staff Branch hanya menampilkan cabangnya:

- Total stok cabang.
- Fresh, Grade C, dan Damaged stock.
- Penjualan hari ini.
- Tren penjualan tujuh hari.
- Distribusi masuk dan in transit.
- Daily sales terbaru.

Superadmin tidak memiliki workflow dashboard operasional tersendiri. Superadmin dapat mengakses seluruh halaman monitoring dan laporan secara read-only.

---

## 7. Application Flow

### 7.1 Receiving Flow

```text
Staff HO membuat receiving
→ memasukkan data kiriman kebun
→ melakukan QC
→ accepted dan unusable dicatat
→ hanya accepted dibuatkan batch
→ stok HO bertambah
→ RECEIVING_IN dibuat
```

### 7.2 AI/ML Planning Flow

```text
Historical sales + damaged history + branch stock + in transit + calendar features
→ AI/ML menghasilkan forecast demand
→ recommendation engine mempertimbangkan safety stock dan stok HO
→ recommended quantity dibuat
→ Staff HO meninjau dan menyesuaikan
→ plan difinalisasi
```

### 7.3 Distribution Flow

```text
Plan FINALIZED
→ order dibuat
→ batch dialokasikan FIFO
→ order dikirim
→ stok HO berkurang
→ DISTRIBUTION_OUT
→ status IN_TRANSIT
→ branch menerima
→ received masuk stok branch
→ damaged dan missing direkonsiliasi
→ DISTRIBUTION_IN
→ status RECEIVED
```

### 7.4 Daily Sales Flow

```text
Staff Branch membuat daily sales
→ sold dan damaged dimasukkan
→ backend memvalidasi seluruh stok
→ SALE_OUT dan DAMAGED_OUT dibuat
→ stok branch berkurang
→ data menjadi input historis model
```

---

## 8. Main Business Rules

1. Tidak ada registrasi publik.
2. Semua akun dibuat oleh Superadmin.
3. Superadmin hanya melakukan konfigurasi dan monitoring read-only terhadap data operasional.
4. Staff HO dapat melihat stok, penjualan, dan distribusi seluruh cabang.
5. Staff Branch hanya dapat melihat dan mengelola cabangnya sendiri.
6. Hanya bunga accepted yang masuk stok Head Office.
7. Bunga unusable dari kebun wajib dicatat pada receiving/QC, tetapi tidak masuk stok.
8. Setiap accepted item menghasilkan batch otomatis.
9. Stok HO dan branch dialokasikan dengan FIFO.
10. Stok tidak boleh negatif.
11. Kegagalan validasi stok membatalkan seluruh transaksi terkait dengan HTTP `422`.
12. Setiap perubahan stok yang sah wajib membuat inventory movement.
13. Satu cabang hanya memiliki satu daily sales per tanggal.
14. Forecast demand dibuat oleh AI/ML atau fallback baseline jika data tidak cukup.
15. Recommendation dibuat berdasarkan forecast dan inventory constraints.
16. AI/ML tidak boleh mengubah stok, memfinalisasi plan, atau membuat order secara langsung.
17. Staff HO dapat mengubah recommendation sebelum finalisasi.
18. Adjustment reason wajib diisi jika final quantity berbeda dari recommendation.
19. Distribution plan menjadi `ORDER_CREATED` setelah order dibuat dan tidak dapat digunakan kembali.
20. Stok HO berkurang saat order menjadi `IN_TRANSIT`.
21. Umur bunga dimulai dari `shippedAt`.
22. Hanya received quantity yang masuk stok branch.
23. Damaged dan missing in transit wajib dicatat dalam receiving distribusi.
24. Bunga Damaged tidak dapat dijual.
25. Tidak ada manual inventory adjustment pada MVP.

---

## 9. PostgreSQL Data Model

Database menggunakan PostgreSQL dengan relasi dan transaction untuk menjaga konsistensi stok.

### 9.1 Tabel Utama

- `users`
- `farms`
- `branches`
- `flowers`
- `system_configurations`
- `receivings`
- `receiving_items`
- `flower_batches`
- `branch_stock_lots`
- `daily_sales`
- `daily_sales_items`
- `forecast_runs`
- `forecast_results`
- `distribution_plans`
- `distribution_plan_items`
- `distribution_orders`
- `distribution_order_items`
- `distribution_batch_allocations`
- `distribution_receipts`
- `distribution_receipt_items`
- `inventory_movements`

### 9.2 Relasi Penting

- `receivings` memiliki banyak `receiving_items`.
- Accepted `receiving_items` menghasilkan `flower_batches`.
- `daily_sales` memiliki unique constraint `(branch_id, sales_date)`.
- `forecast_runs` menyimpan metadata model dan waktu eksekusi.
- `forecast_results` menyimpan forecast per branch dan flower.
- `distribution_plans` memiliki banyak `distribution_plan_items`.
- `distribution_orders` dibuat dari plan yang telah final.
- `distribution_batch_allocations` menyimpan batch FIFO yang digunakan.
- `inventory_movements` mereferensikan transaksi sumber.

### 9.3 Constraint Penting

```text
quantity >= 0
accepted_quantity + unusable_quantity = actual_received_quantity
received_quantity + damaged_quantity + missing_quantity = shipped_quantity
branch_id + sales_date UNIQUE
available_quantity >= 0
```

---

## 10. AI/ML Requirements

### 10.1 Model Objective

Memprediksi demand per flower per branch untuk planning horizon tertentu dan menghasilkan input bagi recommendation engine.

### 10.2 Minimum Dataset

Dataset berasal dari daily sales dan dapat ditambah dengan inventory serta calendar features. Seed data harus menyediakan histori yang cukup agar model dapat diuji.

### 10.3 Model Versioning

Setiap hasil forecast menyimpan:

- `modelName`
- `modelVersion`
- `forecastMethod`
- `trainingDataUntil`
- `generatedAt`

### 10.4 Fallback

Jika data tidak cukup atau service model gagal, backend dapat menggunakan baseline moving average. UI wajib menampilkan metode yang digunakan agar hasil ML dan fallback tidak tertukar.

### 10.5 Safety Constraints

- Recommended quantity minimal nol.
- Recommendation tidak boleh melebihi stok HO yang dapat dialokasikan setelah constraint diterapkan.
- Model output harus divalidasi backend.
- Error model tidak boleh merusak transaksi inventory.

---

## 11. Tech Stack

### 11.1 Frontend

- React.
- Vite.
- JavaScript.
- React Router DOM.
- Axios.
- Tailwind CSS.
- React Hook Form.
- Zod.
- Recharts.
- Sonner atau React Toastify.

### 11.2 Backend API

- Node.js.
- Express.js.
- JavaScript.
- Prisma ORM.
- JWT.
- bcrypt.
- Zod atau Joi.

### 11.3 AI/ML Service

- Python.
- FastAPI.
- pandas dan scikit-learn, atau library model ringan lain yang disepakati.
- Endpoint internal untuk training ringan dan prediction.
- Model artifact dan model version disimpan secara terkontrol.

Untuk MVP, ML juga dapat dijalankan sebagai script/service terpisah selama backend tetap menjadi sumber validasi dan orchestration.

### 11.4 Database

- PostgreSQL.
- PostgreSQL transaction.
- Prisma migration.

### 11.5 Deployment

- Frontend: Vercel.
- Backend API: Render.
- AI/ML service: Render.
- Database: Supabase PostgreSQL atau managed PostgreSQL lain.
- Version control: GitHub.

---

## 12. MVP Priority

### 12.1 Must Have

- Authentication dan tiga role.
- Superadmin configuration dan read-only monitoring.
- Receiving dan QC.
- Pencatatan unusable dari kebun.
- Automatic batch.
- Head Office dan branch stock.
- Daily sales.
- AI/ML forecast dengan fallback baseline.
- AI/ML distribution recommendation.
- Recommendation adjustment oleh Staff HO.
- Distribution plan dan order.
- Distribution receiving dengan damaged dan missing.
- Inventory movement.
- Dashboard HO dan dashboard branch.

### 12.2 Should Have

- Prediction interval atau confidence score.
- Model performance metric sederhana.
- Filter forecast per branch dan flower.
- Export laporan.

---

## 13. Recommended Development Order

1. Project setup dan PostgreSQL schema.
2. Authentication dan authorization.
3. User dan configuration management.
4. Farm, branch, dan flower master data.
5. Receiving dan QC.
6. Automatic batch dan stok HO.
7. Branch inventory.
8. Daily sales.
9. Inventory movement dan transaction validation.
10. Dataset preparation dan seed historical sales.
11. AI/ML forecast service.
12. Recommendation engine dan constraints.
13. Distribution planning dan adjustment.
14. Distribution order dan FIFO allocation.
15. Distribution receiving.
16. Automatic flower status.
17. Dashboard HO dan branch.
18. End-to-end testing.

---

## 14. Definition of Done

Fitur dianggap selesai jika:

- Backend route, controller, service, dan validation tersedia.
- Authorization role dan branch diterapkan.
- Staff HO dapat melihat seluruh cabang.
- Staff Branch hanya dapat mengakses cabangnya.
- Superadmin dapat mengonfigurasi dan melihat seluruh data secara read-only.
- Receiving mencatat accepted dan unusable dengan benar.
- Hanya accepted quantity yang masuk stok HO.
- Forecast dapat dihasilkan oleh model atau fallback yang ditandai jelas.
- Recommendation berasal dari forecast dan inventory constraints.
- Model output divalidasi backend.
- Staff HO dapat mengubah recommendation dengan alasan wajib.
- Perubahan stok menggunakan database transaction.
- Inventory movement dibuat untuk seluruh perubahan inventory.
- Stok tidak dapat menjadi negatif.
- Damaged dan missing in transit tercatat dengan benar.
- Dashboard HO dan branch tersedia.
- Fitur diuji menggunakan seed data dan end-to-end scenario.
- Tidak ada critical console error.

---

## 15. MVP Summary

```text
Receiving dan QC
→ accepted menjadi batch dan stok HO
→ unusable tetap tercatat tetapi tidak masuk stok
→ daily sales dan stok branch menjadi data historis
→ AI/ML memprediksi demand
→ recommendation engine menentukan usulan distribusi
→ Staff HO meninjau dan menyesuaikan
→ distribution order dikirim
→ branch menerima dan mencatat received, damaged, serta missing
→ inventory dan dashboard diperbarui
```

Nilai utama produk adalah menggunakan AI/ML untuk membantu memprediksi kebutuhan dan merekomendasikan distribusi, sementara keputusan akhir, validasi stok, dan pelaksanaan operasional tetap dikendalikan manusia dan backend.
