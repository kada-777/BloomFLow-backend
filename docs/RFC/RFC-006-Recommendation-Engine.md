# RFC-006: Distribution Recommendation Engine

- **Status:** Proposed
- **Owner:** Backend and AI/ML

## Formula

```text
shortage = forecastDemand + safetyStock - currentUsableStock - inTransitStock
recommendedQuantity = max(0, shortage)
```

## Constraints

`recommendedQuantity` tidak negatif dan tidak boleh melebihi available Head Office stock. Output model tetap divalidasi oleh backend. Recommendation hanya bersifat usulan: ia tidak membuat movement, mengubah stok, atau membuat distribution order.

## Limited Stock

Ketika total shortage cabang melebihi stok HO, sistem harus memakai strategi prioritas yang disetujui (highest shortage atau highest forecast demand). Hasil yang dibatasi menyimpan constraint note, misalnya `LIMITED_BY_HEAD_OFFICE_STOCK` atau `INSUFFICIENT_HISTORY_BASELINE_USED`.
