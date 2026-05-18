#!/usr/bin/env bash
# Build a self-contained static bundle in ./dist that can be deployed
# anywhere a directory of static files can be served.
#
#   - index.html uses relative asset paths (Vite base: './')
#   - preprocessed binaries are copied into dist/preprocessed/
#   - dataLoader.ts fetches them via './preprocessed/...' relative URLs
#   - docs at dist/docs/ ship with an absolute base baked in
#     (VitePress can't emit relative asset URLs); set BASE to match
#     the deploy subpath, e.g.  BASE=/warp/ bash scripts/bundle.sh
#
# Result: ./dist is self-contained. zip/tar/rsync it to any static host
# served at the URL prefix you passed as BASE (default /).

set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d preprocessed ] || [ ! -f preprocessed/neurons.json ]; then
  echo "ERROR: ./preprocessed/ is empty or missing." >&2
  echo "  Run: python3 scripts/preprocess.py" >&2
  exit 1
fi

# Normalize BASE to a value VitePress accepts: leading + trailing slash,
# defaulting to '/' (root deploy). DOCS_BASE is the actual env var read
# by docs/.vitepress/config.ts; it's derived from BASE here but kept as
# an explicit override for the rare case where the docs subpath differs
# from the viewer's.
BASE="${BASE:-/}"
BASE="/${BASE#/}"
BASE="${BASE%/}/"
DOCS_BASE="${DOCS_BASE:-${BASE}docs/}"

echo "==> Building app bundle (BASE=${BASE})..."
# Surface the in-bundle docs to LinksMenu via Vite's build-time env. The
# relative path keeps dist/ relocatable; the docs site itself is built
# below with an absolute DOCS_BASE because VitePress needs that.
export VITE_WARP_DOCS_URL=./docs/
npm run build

echo "==> Copying preprocessed data into dist/..."
rm -rf dist/preprocessed
cp -r preprocessed dist/preprocessed

echo "==> Building docs into dist/docs/ (DOCS_BASE=${DOCS_BASE})..."
DOCS_BASE="$DOCS_BASE" npm run docs:build
rm -rf dist/docs
cp -r docs/.vitepress/dist dist/docs

bytes=$(du -sb dist 2>/dev/null | cut -f1 || du -sk dist | awk '{print $1*1024}')
human=$(du -sh dist | cut -f1)

echo ""
echo "==> Bundle ready in ./dist ($human)"
echo ""
echo "To deploy: copy or rsync the entire ./dist directory to any static"
echo "host. Open index.html (served over HTTP — file:// won't work because"
echo "the browser blocks fetch() of local files)."
echo ""
echo "Quick local sanity check:"
echo "  npx serve dist        # or any static-file server"
