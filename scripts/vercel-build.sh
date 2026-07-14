#!/usr/bin/env bash
# Assembles the production output for Vercel (see vercel.json):
#   dist/            ← legacy static site, exactly what shipped before
#     index.html       (all query-param portals + /dispatch rewrite)
#     og-image.png
#     map/             (blueprint map, prebuilt static)
# Repo internals (supabase/, tools/, blueprint/ source, briefs) are NOT
# served anymore — the old zero-config deploy exposed them.
#
# Accounting pivot 2026-07: the React rebuild under app/ is SHELVED from
# the deploy (code kept in the repo; full deploy preserved at tag
# `full-build-2026-07`). To re-enable: restore the `npm --prefix app run
# build` + `cp -r app/dist dist/app` lines here, plus the /app/:path*
# rewrite and the installCommand in vercel.json.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist
cp index.html og-image.png dist/
cp -r map dist/map

echo "dist assembled:"
find dist -maxdepth 2 -type d
