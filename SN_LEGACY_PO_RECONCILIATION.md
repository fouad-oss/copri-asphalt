# Legacy ↔ SpectroNova PO reconciliation (report only — nothing deleted)

*Generated 2026-08-18 by `scripts/sn-legacy-recon-report.mjs` from the SN mirror (550 SN POs) against the 424 imported app POs (`commitments` with `sn_po`). Match key: normalised SN PO number. Live version: view `sn_legacy_po_recon` (migration 0065) + the SN sync panel.*

| Bucket | Count |
|---|---|
| **Matched** (app import ↔ SN mirror) | **424** |
| Legacy-only (app PO with no SN twin) | **0** |
| SN-only (in SN, never imported) | **126** |

- Matched POs that carry **app-entered lines**: 1 (PO/0378); with **bundles**: 1 (PO/0378 ×1). Everything else in the legacy register is header-only → switching the register to the SN mirror loses no line data.
- Matched POs now **closed** in SN: 94.
- **Value deltas** (app `value` vs SN `NetAmount`): 2
  - PO/0333 (364-PO/0333, كوبري — مصنع الأسفلت): app 754686.016 vs SN 778357.583 (Δ 23671.567) — 6 SN lines
  - PO/0329 (5205-PO/0329, JAWHART BERLIN GEN.TRAD.&CONT.CO.): app 1232000.000 vs SN 1229261.005 (Δ -2738.995) — 5 SN lines

## SN-only POs (126) — never imported into the app
- Material · 5305-Garage Amghara: 39
- Material · 364 - Hawally Governorate: 32
- Material · 5205-Asphalt Plant Amghara: 16
- Fixed asset · 5305-Garage Amghara: 14
- Material · 363 - 30 & 40 Expressway: 13
- Fixed asset · 364 - Hawally Governorate: 6
- Fixed asset · 5105-Main Office: 2
- Fixed asset · 5205-Asphalt Plant Amghara: 2
- Material · 5105-Main Office: 2

Material SN-only numbers: PO/0236, PO/0368, PO/0376, PO/0382, PO/0383, PO/0384, PO/0385, PO/0386, PO/0387, PO/0388, PO/0389, PO/0390, PO/0391, PO/0392, PO/0393, PO/0394, PO/0395, PO/0397, PO/0398, PO/0399, PO/0400, PO/0401, PO/0402, PO/0403, PO/0404, PO/0405, PO/0406, PO/0407, PO/0408, PO/0409, PO/0410, PO/0411, PO/0412, PO/0413, PO/0414, PO/0415, PO/0416, PO/0417, PO/0418, PO/0419, PO/0420, PO/0421, PO/0422, PO/0423, PO/0424, PO/0425, PO/0426, PO/0427, PO/0428, PO/0429, PO/0430, PO/0431, PO/0432, PO/0433, PO/0434, PO/0435, PO/0436, PO/0437, PO/0438, PO/0439, PO/0440, PO/0441, PO/0442, PO/0443, PO/0444, PO/0445, PO/0446, PO/0447, PO/0448, PO/0449, PO/0450, PO/0451, PO/0452, PO/0453, PO/0454, PO/0455, PO/0456, PO/0457, PO/0458, PO/0459, PO/0460, PO/0461, PO/0462, PO/0463, PO/0464, PO/0465, PO/0466, PO/0467, PO/0468, PO/0469, PO/0470, PO/0471, PO/0472, PO/0473, PO/0474, PO/0475, PO/0476, PO/0477, PO/0478, PO/0479, PO/0480, PO/0615

## Recommendation
- Retiring the 424 imported rows is safe from a data-loss standpoint once `po_source` = sn (only 1 legacy bundle(s) reference a legacy line; they keep working through the legacy branch of `bundle_transcription`). The decision is Fouad's; the sync deletes nothing.
- Review the 2 value delta(s) with accounting (likely later revisions/discounts in SN).

## Outcome
**Retired 2026-08-20** (Fouad's decision): all 424 imported commitments closed (نشط → مغلق) by migration `0069_retire_legacy_po_register.sql`, applied the same day. Nothing deleted; the PO/0378 bundle keeps rendering through the legacy branch of `bundle_transcription`. Reversible on the same predicate.
