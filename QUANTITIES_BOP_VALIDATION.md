# BOP import validation report — جدول الاسعار - حولي (migration 0034)

Source: `جدول_الاسعار_-_حولي__1_.xls`, sheet `bill` (2,041 sheet rows → 1,310 id rows).
Parsed with bab resolved by validating both id segments against the known bab set
{1,2,3,4,5,6,7,12,14,17,22} + run position (raw ids in this file are band/bab; the
composite string is never trusted or stored — bab and band are separate integer columns).

**Seeded: 1,309 items.** Letter-suffixed sub-items: 61 (ا/ب/ج/د/ه). Per bab:

| bab | items | | bab | items |
|---|---|---|---|---|
| 1 | 90 | | 7 | 190 |
| 2 | 138 | | 12 | 104 |
| 3 | 6 | | 14 | 4 |
| 4 | 80 | | 17 | 70 |
| 5 | 134 | | 22 | 327 |
| 6 | 166 | | | |

## Corrections applied (flagged in `qm_bop_items.source_note` on each row)

All four are positional typos in the source file; the surrounding run makes the intended
id unambiguous. **If you disagree with any resolution, edit the row in the Table Editor.**

| sheet row | raw id | seeded as | evidence |
|---|---|---|---|
| 443 | `121/5` | **122/5** | duplicate of row 442's 121/5; sits between 121/5 and 123/5 and fills the missing 122 (desc: حوض دائري قطر 130سم أسمنت عادي — the white-cement 130 variant is 123/5) |
| 504 | `56/7` | **56/6** | the A2 manhole row, between 55/6 (A1 epoxy) and 57/6 (A2 epoxy); the real 56/7 (أسهم أرضية) is a separate item at sheet row 679 |
| 1062 | `69/22` | **79/22** | duplicate of row 1052's 69/22; sits between 78/22 and 80/22 in the بوليكريت pipe-diameter series and fills the missing 79 |
| 366 | `47/4ج` | **47/5ج** | sits between 47/5ب and 48/5ا with the same شرحه wording as the 46/5ا-ج series |

## Skipped (not seeded)

| sheet row | raw id | reason |
|---|---|---|
| 909 | `104/12` | id only — no description, no unit, no rate (blank trailing row of bab 12) |

If 104/12 is a real item, add it in the Table Editor with its description and rate.
