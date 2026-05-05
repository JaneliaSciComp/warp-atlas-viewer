#!/usr/bin/env bash
# Build a self-contained static bundle in ./dist that can be deployed
# anywhere a directory of static files can be served.
#
#   - index.html uses relative asset paths (Vite base: './')
#   - preprocessed binaries are copied into dist/preprocessed/
#   - dataLoader.ts fetches them via './preprocessed/...' relative URLs
#
# Result: ./dist is self-contained. zip/tar/rsync it to any static host.

set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d preprocessed ] || [ ! -f preprocessed/neurons.json ]; then
  echo "ERROR: ./preprocessed/ is empty or missing." >&2
  echo "  Run: python3 scripts/preprocess.py" >&2
  exit 1
fi

echo "==> Building app bundle..."
npm run build

echo "==> Copying preprocessed data into dist/..."
rm -rf dist/preprocessed
cp -r preprocessed dist/preprocessed

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
