#!/usr/bin/env bash
# Assembles the production output for Vercel (see vercel.json):
#   dist/            ← legacy static site, exactly what shipped before
#     index.html       (all query-param portals + /dispatch rewrite)
#     home.html        (static landing page — 4 portal links)
#     og-image.png
#     map/             (blueprint map, prebuilt static)
#     app/             ← the React build (base=/app/)
# Repo internals (supabase/, tools/, blueprint/ source, briefs) are NOT
# served anymore — the old zero-config deploy exposed them.
#
# Accounting rebuild 2026-07: app/ is back in the deploy, but its router
# exposes ONLY /app/login + /app/accounting — the other office sections
# and field portals stay unmounted (see app/src/main.tsx).
set -euo pipefail
cd "$(dirname "$0")/.."

npm --prefix app run build

rm -rf dist
mkdir -p dist
cp index.html home.html og-image.png dist/
cp -r map dist/map
cp -r app/dist dist/app

echo "dist assembled:"
find dist -maxdepth 2 -type d
