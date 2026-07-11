# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Progressive Web App for tracking asphalt deliveries (plant → site), milling works, and materials receipts for COPRI Construction, a Kuwait road-maintenance contractor for the Ministry of Public Works. All UI is Arabic / RTL. Moving parts:

- `index.html` — the entire frontend, one standalone file: vanilla JS, no framework, no build step, no npm, no SDKs. It talks **directly to Supabase** (PostgREST + Storage) via a small fetch-based layer near the top of the script (`sbGet`/`sbInsert`/`sbUpdate`/`sbUploadPhoto` + `db*` domain functions + row mappers).
- **Supabase project `abwsxqnppihrmkhydkai`** — the database (migrated from Google Sheets 2026-07-10). Schema lives in `supabase/migrations/` (apply via the dashboard SQL editor). Reference tables replace the old per-unit Google Sheet files; log tables replace the register tabs; `ref_payload()` / `dash_payload()` RPCs return the aggregate JSON shapes the client consumes. RLS posture: anon reads everything; every compound write flows through SECURITY DEFINER RPCs (`dispatch_submit` / `confirm_receipt` / `milling_*`) — the only remaining direct anon insert is `material_receipts` (after 0005). Reference edits happen in the Supabase Table Editor until per-user-type auth lands.
- `apps-script/Code.gs` — **LEGACY**, no longer called by the app. Kept only for the in-Sheet PDF report menu (تقارير كوبري) over the frozen pre-migration data. Do not extend it; rebuild reports from Supabase instead.
- `delivery-note-sample.html` — a standalone print template (reference only, not wired into the app).

There is no test suite, linter, or package manager. For local testing serve statically (`python -m http.server`) — the page talks to the live database, so use TEST-prefixed ids and delete them (service key) afterwards.

## Deploy workflow

- **Frontend:** commit + push `index.html` to `main` → Vercel auto-deploys to `copri-asphalt-app.vercel.app`. Every non-`main` branch gets its own Vercel preview URL. This is the whole deploy — no more Apps Script paste.
- **Database schema changes:** add a numbered file in `supabase/migrations/` and run it in the Supabase SQL editor (the user pastes it, same ritual as the old Code.gs paste). Keep migrations append-only.
- **Keys:** `CONFIG.supabaseUrl` + `CONFIG.supabaseAnonKey` (publishable key — public by design, RLS enforces access). The secret key is never committed and never leaves the user's machine.

## Branch discipline

- `main` is live production that clerks use daily — treat it as such.
- The **milling module** was developed on the `milling-module` branch and merged to `main` (2026-06-25). Risky milling work should still go on a branch and be tested on its Vercel preview before merging. Ask before merging to `main`.
- Do not push without the user asking.

## Architecture that spans files

**CONFIG-driven content.** Nearly all business content — companies, projects, sites, mix types, plants, milling depths, and staff `{name, pin}` lists for clerks / engineers / PM / Marco — lives in the `CONFIG` object at the top of the `index.html` `<script>` (around line 641). Adding an engineer, site, or project means editing CONFIG only, not the render functions. Do not scatter this data into functions.

**Screen = render function + a router.** Each screen is its own `render*` function that builds DOM imperatively and swaps it into a shell. The router at the very bottom of `index.html` reads URL params and dispatches:
- no params → clerk PIN → company/project select → dispatch form
- `?role=engineer` → engineer PIN → engineer home (receipts + pending tabs)
- `?note=XXXXX` → engineer PIN → receipt confirmation form (one-time link)
- `?millingRole=engineer|pm|marco` → milling portals
- `?millingReport=PROG_ID` → public milling report (no PIN)
- `?matRole=receiver` → materials-receipt portal (site engineer records materials received)
- `?plantRole=manager` → plant-manager portal (interim PIN from the `plant_managers` table): embedded plant dashboard + report generator, planned asphalt programs (day-grouped `asphalt_programs`; manager can add for non-Copri clients only, multi-mix via `mixes` jsonb), add-recipient requests (`recipient_requests`, cash/credit) with a WhatsApp handoff to finance
- `?financeRole=manager` → finance approval desk (interim PIN from `finance_managers`): approve/reject recipient requests via `recipient_request_decide`
- `?printTest=1` → printer-calibration screen (no PIN, no DB write)

**Milling and Materials are bolted-on but separable modules — same pattern, follow it for any new module.** Each is grouped under its own `// ── <NAME> MODULE` block with a function prefix (`renderMilling*`/`milling*`/`dbMilling*`, `renderMaterial*`/`mat*`), with its reads going through a translated query helper (`millingGet`/`matGet` — same param/return shapes the old endpoints had) and its writes through `db*` functions. Both reuse shared asphalt helpers (e.g. `millingAllProjects()`). Keep the separation — only ADD module code, don't entangle it with the asphalt dispatch/receipt flow. **Milling** = engineer→PM→Marco approval workflow. **Materials** = simple one-and-done record: receiver logs material (category→detailed item, qty, rate, supplier, subcontractor) + a required paper-receipt photo.

**Work orders — locked auto-fill, never user-editable.** `autoWorkOrder(project, site, block, street, discipline)` resolves the single active order covering a location from `CONFIG.contractWorkOrders` (fed by the `work_orders` reference table), filtered by discipline (dispatch passes `"asphalt"`, materials `"civil"`, a WO tagged `both`/`كلا` matches either). A read-only info-box shows the result; the forms submit the derived value. The receipt form's WO stays a read-only display of the originating dispatch's value. Older picker machinery (`makeWorkOrderField`/`workOrdersFor`/`lookupWorkOrder`) is kept dormant.

**Staff-editable reference data (Supabase reference tables).** Non-devs maintain app data in the Supabase Table Editor: `app_settings` (kv), `clients`, `client_projects`, `clerks`, `drivers`, `list_options` (kind-discriminated pick-lists), `projects`, `staff`, `sites`, `streets`, `work_orders`, `suppliers`, `subcontractors`, `material_catalog`, `milling_managers`, `milling_machines`. The client fetches `rpc/ref_payload` (same shape the old `?ref=1` returned); `applyReferenceData()` rebuilds/overlays `CONFIG` from it (datasets present replace their baked default; absent → default kept). Cached in localStorage, applied instantly on boot, re-synced on boot / tab-refocus / 60s visible poll by diffing the payload JSON (no version probe needed). Any failure → cache → baked defaults, so it never blocks/breaks. Per-project **staff** rows carry `function` (asphalt/civil/both → dispatch-receiver / material-receiver) + `milling` flag; there is no separate receiver list. Staff PINs are readable via the anon key (v1 posture — same exposure as before; fix with real auth in the front-end phase).

**Database = Supabase Postgres.** Log tables `dispatch_loads`, `receipts`, `material_receipts`, `milling_programs` (snake_case columns; the client maps to its camelCase shapes via `dispatchRowToUI`/`millingRowToUI`/`materialRowToUI`). Delivery-note/receipt/program uniqueness is enforced by DB constraints — `sbInsert` returns `{duplicate:true}` on a unique-key hit, which the forms surface. Receipt confirmation inserts a `receipts` row then patches the dispatch row's `status`. Milling audit trail is an append-only jsonb array. Receipt photos upload to the public `material-receipts` Storage bucket.

**Delivery-note numbers are DB-allocated serials (0004), never typed.** `dispatch_submit()` RPC allocates from the `delivery_note_serial` sequence (continues the old carbon-book numbering) and inserts atomically; the client's `submitRef` (uuid, fixed per form render) makes retries idempotent — a resend returns the note that already landed. After submit, the success screen **auto-opens** `printDeliveryNote()` (silent mode — popup blocked just means the manual reprint button is the path), printing **4 labeled A5 copies** (driver / site engineer / plant / head office) from the embedded `TEMPLATE_HTML`; the QR receipt link appears on Copri loads only. The plant PC runs Chrome with `--kiosk-printing` so sheets print with zero dialogs; the template forces `print-color-adjust: exact` because kiosk mode can't enable "background graphics". `?printTest=1` is a no-PIN, no-DB-write calibration screen. Inside the template, the QR `<canvas>` must be removed (not hidden) before `makeCopies()` clones the sheet — a cloned canvas is blank; the `<img>` clones fine. The WhatsApp wa.me button stays the clerk's one manual send until the Cloud API automates it server-side.

## Gotchas — do not regress these

1. **Timestamps are timestamptz (UTC ISO) end-to-end.** Kuwait wall-clock is display-only: `fmtKW()` formats, `shiftStartISO()` computes the noon-Kuwait shift boundary (fixed UTC+3, no DST — calendar math must be done in shifted epoch, see the function). The dashboard RPCs bucket days with `at time zone 'Asia/Kuwait'`.

2. **Keep the payload shapes stable.** `ref_payload()`/`dash_payload()` (SQL) and the `db*` read functions return the exact shapes the render functions have always consumed. If you add a column, extend both the SQL RPC / mapper and the consumer — don't fork new shapes.

3. **Arabic in `Code.gs`** (legacy, only if you must touch it): Arabic strings live only in the `COL`/`LABEL` constant blocks, one per line — pasting Arabic mid-expression into the Apps Script editor corrupts it via bidi reordering. Arabic in `.sql` migration files is fine (pasted into the Supabase SQL editor, which handles UTF-8 correctly).

## Assets

Logos/images are embedded as base64 data-URIs directly in the source (both `index.html` and `Code.gs`), because Apps Script HTML→PDF does not reliably fetch external image URLs. The `.assets/` scratch directory is gitignored.
