#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p data

URL="https://figshare.com/ndownloader/articles/29962931?private_link=d1d19b105c4f74865c32"
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Browser-issued cookies (including aws-waf-token) get past the WAF challenge.
# Refresh from your browser's DevTools if the token expires.
COOKIE='aws-waf-token=52489ad8-0887-4272-9ff6-f2c642469366:CgoAlicKjj4TAAAA:xZuy3SPRulGwt8Jm8C4Bm6iNqDVQs+khVvzQoYCbPv6Zcr8plPyTaRAiWNL8sQ8clhxPMRHZ6kloCTjNz9CB2b1ETw+3m+ocsSdUOUJEw9wsZp5vwM5uY1baUJM0O8X+brKXair80vDTSsoKXt2H6fst6cD7wrNrehWjI90DZP6R7GSsLgaXmqp4Nq3/; fig_tracker_client=d317904c-aa44-45a5-b111-d8d85dd971bc; GLOBAL_FIGSHARE_SESSION_KEY=5d6bd4c8fa3b21d0b3d0dfbc455ecbf18a241c72d3c348d78aeb46f7b7ea412ac0a2b1c4; FIGINSTWEBIDCD=5d6bd4c8fa3b21d0b3d0dfbc455ecbf18a241c72d3c348d78aeb46f7b7ea412ac0a2b1c4; figshare-cookies-essential=true; figshare-cookies-performance=false'

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
    --referer="https://figshare.com/s/d1d19b105c4f74865c32" \
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
    -H "Referer: https://figshare.com/s/d1d19b105c4f74865c32" \
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
