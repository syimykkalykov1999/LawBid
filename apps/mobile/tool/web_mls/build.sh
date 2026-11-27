#!/bin/sh
# Item 25: rebuilds web/vendor/ts-mls-1.6.4/ts-mls.min.js — ts-mls (MIT, with
# the one upstream fix below backported) and its dependencies (@hpke/core MIT,
# @noble/* MIT, unmodified) bundled into one ES module with esbuild.
# Run from anywhere; needs node and network once.
#   sh apps/mobile/tool/web_mls/build.sh
set -eu
here=$(cd "$(dirname "$0")" && pwd)
out="$here/../../web/vendor/ts-mls-1.6.4"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"
npm init -y >/dev/null
npm install --no-audit --no-fund --ignore-scripts --legacy-peer-deps ts-mls@1.6.4 esbuild@0.28.2 \
  @noble/hashes@2.4.0 @noble/curves@2.0.1 @noble/ciphers@2.4.0 >/dev/null
# LawBid (owner 27.11.2026): ts-mls 1.6.4 with upstream LukaJCB/ts-mls#449
# backported (GroupInfo external_pub as HPKEPublicKey<V>, RFC 9420
# §12.4.3.2), so phones (OpenMLS) and browsers join each other's groups by
# external commit. Drop this line and the .patch once ts-mls 1.x ships the
# fix (LukaJCB/ts-mls#831) or the app moves to ts-mls 2.0 stable.
patch -p1 -d node_modules/ts-mls < "$here/ts-mls-1.6.4-external-pub.patch" >/dev/null
cp "$here/entry.mjs" entry.mjs
mkdir -p "$out"
./node_modules/.bin/esbuild entry.mjs --bundle --format=esm --minify --legal-comments=eof \
  --target=es2022 --outfile="$out/ts-mls.min.js"
cp node_modules/ts-mls/LICENSE "$out/LICENSE"
cp "$here/ts-mls-1.6.4-external-pub.patch" "$out/PATCHES.patch"
echo "built $out/ts-mls.min.js"
