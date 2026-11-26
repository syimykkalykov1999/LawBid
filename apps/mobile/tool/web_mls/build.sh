#!/bin/sh
# Item 25: rebuilds web/vendor/ts-mls-1.6.4/ts-mls.min.js — ts-mls (MIT) and
# its dependencies (@hpke/core MIT, @noble/* MIT) bundled unmodified into one
# ES module with esbuild. Run from anywhere; needs node and network once.
#   sh apps/mobile/tool/web_mls/build.sh
set -eu
here=$(cd "$(dirname "$0")" && pwd)
out="$here/../../web/vendor/ts-mls-1.6.4"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"
npm init -y >/dev/null
npm install --no-audit --no-fund --ignore-scripts ts-mls@1.6.4 esbuild@0.28.2 \
  @noble/hashes@2.4.0 @noble/curves@2.0.1 @noble/ciphers@2.4.0 >/dev/null
cp "$here/entry.mjs" entry.mjs
mkdir -p "$out"
./node_modules/.bin/esbuild entry.mjs --bundle --format=esm --minify --legal-comments=eof \
  --target=es2022 --outfile="$out/ts-mls.min.js"
cp node_modules/ts-mls/LICENSE "$out/LICENSE"
echo "built $out/ts-mls.min.js"
