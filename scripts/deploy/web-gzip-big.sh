#!/usr/bin/env bash
# Re-uploads the big web files gzip-compressed (Content-Encoding: gzip).
#
# CloudFront compresses only objects between 1 KB and 10 MB; main.dart.js is
# ~12 MB, so it went out uncompressed and the web app took over a minute to
# start on a phone. Pre-compressed objects are passed through as they are,
# and every browser accepts gzip.
#
# Run from the built web folder (apps/mobile/build/web):
#   scripts/deploy/web-gzip-big.sh s3://bucket[/prefix] "<cache-control>"
set -euo pipefail
DEST="${1:?destination s3 url}"
CC="${2:?cache-control}"
MIN=$((1024 * 1024))
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

find . -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.wasm' -o -name '*.json' \) \
  -size +"${MIN}"c -not -path './releases/*' | while read -r f; do
  rel="${f#./}"
  case "$rel" in
    *.wasm) type=application/wasm ;;
    *.json) type=application/json ;;
    *) type=text/javascript ;;
  esac
  mkdir -p "$TMP/$(dirname "$rel")"
  gzip -9 -n -c "$f" > "$TMP/$rel"
  echo "gzip $rel: $(wc -c < "$f") -> $(wc -c < "$TMP/$rel") bytes"
  aws s3 cp "$TMP/$rel" "$DEST/$rel" \
    --content-encoding gzip --content-type "$type" --cache-control "$CC" --only-show-errors
done
