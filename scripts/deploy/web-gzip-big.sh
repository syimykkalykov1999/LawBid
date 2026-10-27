#!/usr/bin/env bash
# Re-uploads the big web files compressed.
#
# 1. gzip (Content-Encoding: gzip) over the same key, for every
#    .js/.mjs/.wasm/.json above 1 MB. CloudFront compresses only objects
#    between 1 KB and 10 MB; main.dart.js / main.dart.wasm are ~11 MB, so
#    they went out uncompressed and the web app took over a minute to start
#    on a phone. Pre-compressed objects are passed through as they are, and
#    every browser accepts gzip.
#
# 2. brotli twins (`<key>.br`, Content-Encoding: br) of the files under
#    v/<release>/ that matter for the first start (the app and the engine):
#    about 27 % smaller than gzip (main.dart.wasm 3.6 -> 2.7 MB). CloudFront
#    cannot pick between a .gz and a .br object by itself; the viewer-request
#    function (infra/modules/web) serves the twin when the browser sends
#    `Accept-Encoding: br` and the release is marked in the key-value store
#    (web-deploy.yml writes `br_<sha>`). Until that function is applied the
#    twins just sit in the bucket, unused.
#
# Run from the built web folder (apps/mobile/build/web):
#   scripts/deploy/web-gzip-big.sh s3://bucket[/prefix] "<cache-control>" ["<cache-control for v/>"]
# The third argument (immutable) is used for files under v/.
set -euo pipefail
DEST="${1:?destination s3 url}"
CC="${2:?cache-control}"
CC_V="${3:-$CC}"
MIN=$((1024 * 1024))
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

ctype() {
  case "$1" in
    *.wasm) echo application/wasm ;;
    *.json) echo application/json ;;
    *.ttf) echo font/ttf ;;
    *.otf) echo font/otf ;;
    *) echo text/javascript ;;
  esac
}
cc_for() {
  case "$1" in
    v/*) echo "$CC_V" ;;
    *) echo "$CC" ;;
  esac
}

find . -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.wasm' -o -name '*.json' \) \
  -size +"${MIN}"c -not -path './releases/*' -not -name '*.info.json' | while read -r f; do
  rel="${f#./}"
  mkdir -p "$TMP/gz/$(dirname "$rel")"
  gzip -9 -n -c "$f" > "$TMP/gz/$rel"
  echo "gzip $rel: $(wc -c < "$f") -> $(wc -c < "$TMP/gz/$rel") bytes"
  aws s3 cp "$TMP/gz/$rel" "$DEST/$rel" \
    --content-encoding gzip --content-type "$(ctype "$rel")" \
    --cache-control "$(cc_for "$rel")" --only-show-errors
done

# 2026-10-26 (smoothness P6a): the fonts (icon fonts already tree-shaken by
# `flutter build`, plus Inter / Source Serif ~0.5-0.9 MB) go out compressed
# whatever their size. CloudFront would compress them only when `aws s3
# sync` guessed a font content type; here the type is set explicitly.
find . -type f \( -name '*.ttf' -o -name '*.otf' \) -size +1000c \
  -not -path './releases/*' | while read -r f; do
  rel="${f#./}"
  mkdir -p "$TMP/gz/$(dirname "$rel")"
  gzip -9 -n -c "$f" > "$TMP/gz/$rel"
  echo "gzip $rel: $(wc -c < "$f") -> $(wc -c < "$TMP/gz/$rel") bytes"
  aws s3 cp "$TMP/gz/$rel" "$DEST/$rel" \
    --content-encoding gzip --content-type "$(ctype "$rel")" \
    --cache-control "$(cc_for "$rel")" --only-show-errors
done

# The brotli twins. A superset of the function's patterns (main.tf):
# BR  (`br_<sha>`):  v/<sha>/main.dart.{js,wasm}, v/<sha>/canvaskit/**/*.{js,wasm}
# BR2 (`br2_<sha>`): v/<sha>/main.dart.mjs, v/<sha>/assets/**/*.{ttf,otf}
# Every file the patterns can match MUST get a twin (the function sends the
# browser to <file>.br without checking it exists).
if command -v brotli >/dev/null 2>&1; then
  find ./v -type f \( -path '*/main.dart.js' -o -path '*/main.dart.wasm' \
      -o -path '*/main.dart.mjs' -o -path '*/assets/*.ttf' -o -path '*/assets/*.otf' \
      -o -path '*/canvaskit/*.js' -o -path '*/canvaskit/*.wasm' \
      -o -path '*/canvaskit/*/*.js' -o -path '*/canvaskit/*/*.wasm' \) 2>/dev/null | while read -r f; do
    rel="${f#./}"
    mkdir -p "$TMP/br/$(dirname "$rel")"
    brotli -q 11 -c "$f" > "$TMP/br/$rel.br"
    echo "brotli $rel: $(wc -c < "$f") -> $(wc -c < "$TMP/br/$rel.br") bytes"
    aws s3 cp "$TMP/br/$rel.br" "$DEST/$rel.br" \
      --content-encoding br --content-type "$(ctype "$rel")" \
      --cache-control "$(cc_for "$rel")" --only-show-errors
  done
else
  echo "brotli is not installed: no .br twins"
fi
