#!/usr/bin/env bash
# Assembles the production output for Vercel (see vercel.json):
#   dist/            ← legacy static site, exactly what shipped before
#     index.html       (all query-param portals + /dispatch rewrite)
#     og-image.png
#     map/             (blueprint map, prebuilt static)
#     app/             ← the React rebuild, built with base=/app/
# Repo internals (supabase/, tools/, blueprint/ source, briefs) are NOT
# served anymore — the old zero-config deploy exposed them.
set -euo pipefail
cd "$(dirname "$0")/.."

npm --prefix app run build

rm -rf dist
mkdir -p dist
cp index.html og-image.png dist/
cp -r map dist/map
cp -r app/dist dist/app

echo "dist assembled:"
find dist -maxdepth 2 -type d
