# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Progressive Web App for tracking asphalt deliveries (plant → site) and milling works for COPRI Construction, a Kuwait road-maintenance contractor for the Ministry of Public Works. All UI is Arabic / RTL. Two moving parts:

- `index.html` — the entire frontend, one standalone file (~2900 lines): vanilla JS, no framework, no build step, no npm. It calls the Apps Script backend over HTTP as a JSON API.
- `apps-script/Code.gs` — the backend (~1680 lines), a Google Apps Script web app that reads/writes a Google Sheet and also generates PDF reports.
- `delivery-note-sample.html` — a standalone print template (reference only, not wired into the app).

There is no local dev server, test suite, linter, or package manager. "Building" means editing the files; "running" means deploying (see below).

## Deploy workflow (this is the build/release process)

Nothing runs locally — deployment is manual copy-paste, so **changes only reach production once committed, pushed, and pasted by the user.**

- **Frontend:** commit + push `index.html` to `main` → Vercel auto-deploys to `copri-asphalt-app.vercel.app`. Every non-`main` branch gets its own Vercel preview URL.
- **Backend:** the user copies raw `apps-script/Code.gs` from GitHub into the Apps Script editor (select all → replace → Save). For pure report-logic changes, paste + Save is enough. For changes to `doGet`/`doPost` request handling, a new Web App version must also be published: **Deploy → Manage deployments → New version**.
- **Sheet schema changes** require running a setup function once from the Apps Script editor: `setupSheets()` (asphalt) or `setupMillingSheet()` (milling). Reference tab: `setupReferenceTab()`.

Sanity-check `Code.gs` before handing it over (it is valid JS syntactically):
```bash
cp apps-script/Code.gs /tmp/code_check.js && node --check /tmp/code_check.js && rm /tmp/code_check.js
```

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

**Milling is a bolted-on but separable module.** Client-side, everything is grouped under a `// ── MILLING MODULE` block and prefixed `renderMilling*` / `milling*`. Server-side, milling handlers are `millingDoGet_` / `millingDoPost_` and helpers `milling*_`, dispatched from the main `doGet`/`doPost`. Milling work orders auto-derive from site+block via the shared asphalt `lookupWorkOrder()`. Keep this separation — only ADD milling code, don't entangle it with the asphalt dispatch/receipt flow.

**Backend = Sheet-as-database.** `Code.gs` constants `SHEET_ID`, `DISPATCH_SHEET`, `RECEIPT_SHEET`, `MILLING_SHEET`, `TZ = "Asia/Kuwait"` define the store. `doGet` serves reads (`?note=`, `?checkReceipt=`, `?engineer=`, milling queries); `doPost` handles writes. An `onOpen()` menu (تقارير كوبري) exposes report generation (per-shift / week / month, backfill, rebuild) that renders HTML → PDF into a Drive folder.

## Two hard-won gotchas — do not regress these

1. **Arabic strings in `Code.gs` live only in the `COL` / `LABEL` (and `REP`/`REPP`) constant blocks, one string per line.** The rest of the file is pure ASCII and refers to them by key. Pasting Arabic embedded mid-expression into the Apps Script editor corrupts it via bidirectional-text reordering. When adding any Arabic literal to the backend, add it as a named constant, never inline.

2. **Timestamps.** Sheet cells store Arabic-formatted date strings that `new Date()` cannot parse. The backend returns ISO timestamps (`x instanceof Date ? x.toISOString() : x`) and the client filters "today" in the Kuwait timezone. Numerals are rendered English via a `toEN()` helper even when day/month names are Arabic.

## Assets

Logos/images are embedded as base64 data-URIs directly in the source (both `index.html` and `Code.gs`), because Apps Script HTML→PDF does not reliably fetch external image URLs. The `.assets/` scratch directory is gitignored.
