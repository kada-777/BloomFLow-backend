# RFC-005: AI/ML Demand Forecasting

- **Status:** Proposed
- **Owner:** AI/ML and Backend

## Objective and Inputs

Forecast memperkirakan permintaan per branch dan flower untuk planning horizon. Input dapat mencakup historical sold/damaged quantity, stok usable, in-transit stock, hari, tanggal forecast, dan event/holiday bila tersedia.

## Output Contract

Setiap hasil menyimpan `branchId`, `flowerId`, `forecastDemand`, `forecastMethod`, `modelVersion`, `trainingDataUntil`, dan `generatedAt`. Backend menolak output malformed, nonnumeric, negatif, atau horizon yang tidak cocok.

## Model and Fallback

Model MVP harus ringan, misalnya regression atau Random Forest. Jika history kurang, artifact tidak tersedia, atau service gagal, backend menggunakan baseline seven-day moving average dengan `forecastMethod: BASELINE`. AI/ML failure tidak boleh mengganggu transaksi inventory.

## Versioning

Artifact berada di lokasi terkontrol. Metadata model dan prediction interval bila tersedia disimpan bersama hasil forecast agar dapat diaudit.
