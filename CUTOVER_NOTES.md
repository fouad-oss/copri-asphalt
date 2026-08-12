# Legacy Retirement — Phase 1 Cutover Notes

**Date:** 2026-08-12 · **Brief:** `LEGACY_RETIREMENT_BRIEF.md` · **Scope:** asphalt dispatch (clerk + engineer receival), the two receival dashboards, materials capture.

## What changed

1. **React field portals are routed again** (`app/src/main.tsx`): `/app/dispatch/*`, `/app/capture/*`, `/app/boards/*` mounted as lazy siblings outside the office login guard, each with its own PIN realm — exactly the wave-3 posture. The accounting section and `/app/sn` are untouched.
2. **New screen: `/app/dispatch/engineer`** (`app/src/screens/dispatch/EngineerHome.tsx`) — port of the legacy `?role=engineer` home: engineer PIN gate, today-only (Kuwait) tabs المستلَم / في الطريق, driver contact row, and a "تأكيد الاستلام" button into `/app/dispatch/note/:id`. The React dispatch previously had only the per-note receipt page.
3. **Memo features 1+2 were already in the React dispatch** (built with legacy in `57a77ee`): the متفرقات toggle (address fields skipped, blanked server-side) and the per-site daily load number (allocated atomically inside `dispatch_submit` v4; the client preview reads `dispatch_load_counters`; the server-returned `load_number` always wins). **The global delivery-note serial is untouched** — still the single `delivery_note_serial` sequence.
4. **Boards portal trimmed to phase-1 scope** (`BoardsPortal.tsx`): picker (`home`) + `project/:proj` (asphalt receivals) + `acct/:proj` (accountant materials receivals). PlantBoard/ExecBoard and the two desks stay unrouted; their legacy surfaces stay live.
5. **Hard redirects** — two layers:
   - **Edge (`vercel.json` redirects, 307):** see URL map below. Rules are ordered `matRole` → `note` → `role` to preserve the legacy router's precedence (`?matRole=receiver&note=…` goes to capture, as before).
   - **Stale-page guard (legacy `index.html` router):** the retired branches now `location.replace(...)` to the same targets, so a cached copy of the legacy page also redirects. The legacy clerk flow is no longer reachable on any path (the `file:` escape hatch was removed too) — **no legacy code path can call `dispatch_submit`**. All legacy module code is preserved in the file, unrouted.
6. **`home.html`**: dispatch → `/app/dispatch`, materials → `/app/capture`; new tiles for the engineer receival home and the receival dashboards. Accounting + plant links unchanged.

## Legacy → React URL map

| Legacy URL | Redirects to | Notes |
|---|---|---|
| `/dispatch` | `/app/dispatch` | clerk flow; query string carries over |
| `/?note=XXXXX` | `/app/dispatch/note/XXXXX` | **old printed QR links keep working**; new prints already encode the React URL |
| `/?role=engineer` | `/app/dispatch/engineer` | new engineer home |
| `/?matRole=receiver` | `/app/capture` | offline-first queue, photo mandatory, raw capture (no PO at capture), feeds the daily batch / no_po path unchanged |
| `/?dash=project` | `/app/boards/home` | picker → per-project asphalt receivals board (`/app/boards/project/:proj`); legacy URL never carried the project name |
| `/?dash=acct` | `/app/boards/home` | picker → per-project accountant materials board (`/app/boards/acct/:proj`) |

**Mapping decision:** "asphalt receivals" = legacy `_dashProject` (dispatched vs received KPIs per project) → React `ProjectBoard`; "material receivals" = legacy `_dashAcct` (accountant materials board) → React `AcctBoard`. Both legacy boards were already shelved/unreachable by URL, so the redirect target is the picker.

**Untouched and live:** `/?plantRole=manager`, `/?financeRole=manager`, `/?rf=1`, `/?dash` + `/?dash=plant`, `/?printTest=1`, `/home.html`, `/map`, shelved-portal notices (`?wo`, `?sn`, milling params).

**Print test:** `/app/dispatch/print-test` is live (no PIN, no DB write) for a minutes-notice plant calibration; legacy `/?printTest=1` also still works.

## Migrations to paste

**None new.** Phase 1 needed no schema change:

- `0031_expressway_engineers.sql` — **already pasted + live-verified 2026-08-11** (Andrew Maher / Ali Saber, Expressway-only scoping via `staff.project_id`; both apps read it through `ref_payload`).
- `0032_plant_feedback.sql` — **already pasted + live 2026-08-11** (`is_misc`, `dispatch_load_counters`, `dispatch_submit` v4).

## Auth / invariants (unchanged, deliberately)

- Field roles stay on PINs (client-side v1 posture); `auth_required` NOT flipped; boards stay ungated URLs.
- Arabic/RTL default with the AR⇄EN toggle on all field portals; the printed note stays Arabic (legal document, byte-identical template port with the 4 A5 copy labels and QR placement).
- Timestamps timestamptz end-to-end, Kuwait wall-clock display/filter client-side.
- Recipient scoping: the "إخطار المهندس" list is per-project (`project.engineers` from the staff overlay) — Andrew/Ali appear only under كوبري — الطرق السريعة; engineer *login* lists remain global, as in legacy.

## Rollback

`git revert` the cutover commit and push — the vercel.json redirects disappear with it, `/dispatch` becomes a rewrite to the legacy page again, and the React routes unmount. Note: any delivery notes printed from the React app during the window carry `/app/dispatch/note/:id` QR links, which keep working only while the React dispatch routes are mounted — a rollback should therefore be short-lived, or those QRs will bounce to `/app/accounting`.

## Residual risk

A clerk tab loaded **before** this deploy still runs the old JS with the clerk form live; nothing in the repo can force-reload it. Standing instruction (plant memo follow-up): the clerk reloads the dispatch tab after deploy. From the next load onward, both redirect layers guarantee a single writer.
