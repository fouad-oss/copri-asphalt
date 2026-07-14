# COPRI field-data workspace

Field-delivery tracking app for COPRI Construction (Kuwait road maintenance).
Live at **app.copri.com**. Developer guidance lives in `CLAUDE.md`.

## Accounting pivot (2026-07)

SpectroNova (SN) is the company ERP and system of record. This app is a
**pre-SN workspace**: field delivery data flows in, the accountant rectifies
and bundles it against SN POs, and a read-only data page exposes verified
bundles for SN staff to transcribe into SN themselves. There is **no
programmatic SN import/export** (revisit when an SN API is available — the
data page's frozen column layout is the future API payload).

The app was refocused around that job. The complete pre-pivot build is
bookmarked at the permanent tag **`full-build-2026-07`** — nothing was
deleted; shelved pages lost only their routes and navigation.

### Reachable after the pivot

| Surface | URL |
| --- | --- |
| Dispatch flow (plant clerk → receiving engineer) | `/dispatch`, `/?role=engineer`, `/?note=…` |
| Material capture on site | `/?matRole=receiver` |
| Asphalt plant dashboard + board picker (Fouad) | `/?dash=plant`, `/?dash` |
| Plant-manager portal (Salah) | `/?plantRole=manager` |
| Finance recipient-request desk (Jimmy) | `/?financeRole=manager` |
| Approvals / accountant portal (being rebuilt by this pivot) | `/?rf=1` |
| Printer calibration | `/?printTest=1` |
| SpectroNova data page (external, token access) | `/app/sn?token=<token>` |
| Accounting portal (accountant, Supabase Auth) | `/app/accounting` |
| Blueprint map (separate track, separate brief) | `/map` |

### Shelved (code preserved, routes removed → "موقوفة مؤقتاً" notice)

- Milling portals + public milling report (`?millingRole=…`, `?millingReport=…`)
- Work-orders reference portal (`?wo`)
- Exec / project / accountant-materials boards (`?dash=exec|project|acct`)
- **The React front-end rebuild under `app/`** — removed from the Vercel
  build (`scripts/vercel-build.sh`). The new design system
  (`copri-frontend-SKILL.md`) and the full React app are kept in the repo
  for later re-use.

### Out of scope for the pivot

- Programmatic SN integration (see above).
- Real user auth — revisit at: second accountant, first audit request, or
  SN API arrival.
- Blueprint map — separate track, separate brief.
