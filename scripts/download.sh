#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p data

# Figshare URL + browser-issued cookies (including aws-waf-token) get past the
# WAF challenge. Both are credentials and must NOT be committed: read them from
# the environment, or from a local (gitignored) .env.download next to this
# script. Refresh from your browser's DevTools when the token expires.
ENV_FILE="$(pwd)/.env.download"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

URL="${FIGSHARE_URL:-}"
COOKIE="${FIGSHARE_COOKIE:-}"

if [ -z "$URL" ] || [ -z "$COOKIE" ]; then
  cat >&2 <<EOF
ERROR: FIGSHARE_URL and FIGSHARE_COOKIE must be set.

Either export them in your shell, or create $ENV_FILE with:

  FIGSHARE_URL='https://figshare.com/ndownloader/articles/<id>?private_link=<slug>'
  FIGSHARE_COOKIE='aws-waf-token=...; GLOBAL_FIGSHARE_SESSION_KEY=...; ...'

Open the Figshare share link in a browser, then copy the request URL and
Cookie header from DevTools -> Network.
EOF
  exit 1
fi

# Derive the referer slug from the URL so we don't have to configure it twice.
PRIVATE_LINK="$(printf '%s' "$URL" | sed -n 's/.*private_link=\([^&]*\).*/\1/p')"
if [ -z "$PRIVATE_LINK" ]; then
  echo "ERROR: could not extract private_link slug from FIGSHARE_URL" >&2
  exit 1
fi
REFERER="https://figshare.com/s/$PRIVATE_LINK"

UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

ARIA2C=$(command -v aria2c || true)
for cand in \
  "$HOME/miniforge3/bin/aria2c" \
  "$HOME/miniconda3/bin/aria2c" \
  "$HOME/anaconda3/bin/aria2c"; do
  [ -z "$ARIA2C" ] && [ -x "$cand" ] && ARIA2C="$cand"
done

# figshare.com is behind AWS WAF that 202s aria2c. Resolve to the underlying
# S3/CDN URL with curl first (retry until WAF lets us through), then hand the
# resolved URL to aria2c.
if [ -n "$ARIA2C" ]; then
  echo "Downloading with aria2c (16 parallel connections, WAF cookie)..."
  "$ARIA2C" \
    -x 16 -s 16 -k 1M \
    --file-allocation=none \
    --user-agent="$UA" \
    --referer="$REFERER" \
    --header="Cookie: $COOKIE" \
    --header="Accept: */*" \
    --header="Accept-Language: en-US,en;q=0.9" \
    --allow-overwrite=true \
    --auto-file-renaming=false \
    --console-log-level=notice \
    --summary-interval=2 \
    -d data -o dataset.zip \
    "$URL"
else
  echo "aria2c not found, using single-stream curl" >&2
  curl -L --compressed -o data/dataset.zip \
    -H "User-Agent: $UA" \
    -H "Referer: $REFERER" \
    -H "Cookie: $COOKIE" \
    "$URL"
fi

SIZE=$(stat -c%s data/dataset.zip 2>/dev/null || echo 0)
if [ "${SIZE}" -lt 1000 ]; then
  echo "ERROR: download failed (got $SIZE bytes). AWS WAF may be blocking. Try in a browser:" >&2
  echo "  $URL" >&2
  exit 1
fi

if file data/dataset.zip | grep -q "Zip archive"; then
  unzip -o data/dataset.zip -d data/
  rm data/dataset.zip
fi

ls -la data/
