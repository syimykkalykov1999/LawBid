#!/usr/bin/env bash
# D1-22 / D1-23 (13.11): the web files copied from upstream releases match the
# package versions in apps/mobile/pubspec.lock, so a Dependabot bump can no
# longer leave them behind (drift's rule: the worker matches the package;
# Firebase's rule: the messaging worker runs the page's SDK version).
#
# - web/drift_worker.js == drift-<drift>/drift_worker.js release asset;
# - web/sqlite3.wasm    == sqlite3-<sqlite3>/sqlite3.wasm release asset;
# - web/firebase-messaging-sw.js FIREBASE_JS_VERSION == firebase_core_web's
#   supportedFirebaseJsSdkVersion (needs `flutter pub get` first: read from
#   the pub cache).
#
# Usage: scripts/ci/check-web-assets-lock.sh   (from anywhere; needs network)
# Fix a failure: download the files named in the error (web/README.md).
set -euo pipefail
cd "$(dirname "$0")/../.."
M=apps/mobile
LOCK="$M/pubspec.lock"

ver() {
  awk -v p="  $1:" '$0 == p { f = 1 } f && /^    version:/ { gsub(/"/, "", $2); print $2; exit }' "$LOCK"
}
sha() { shasum -a 256 "$1" | cut -d' ' -f1; }

tmp=$(mktemp -d "${TMPDIR:-/tmp}/web-assets.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
fail=0

same_as_release() { # <local file> <release url>
  local name
  name=$(basename "$1")
  curl -fsSL --retry 3 -o "$tmp/$name" "$2"
  if [ "$(sha "$1")" != "$(sha "$tmp/$name")" ]; then
    echo "::error file=$1::$1 is not the release asset $2 (pubspec.lock version); download it over the file"
    fail=1
  else
    echo "ok  $1 == $2"
  fi
}

DRIFT=$(ver drift)
SQLITE=$(ver sqlite3)
same_as_release "$M/web/drift_worker.js" \
  "https://github.com/simolus3/drift/releases/download/drift-$DRIFT/drift_worker.js"
same_as_release "$M/web/sqlite3.wasm" \
  "https://github.com/simolus3/sqlite3.dart/releases/download/sqlite3-$SQLITE/sqlite3.wasm"

CORE_WEB=$(ver firebase_core_web)
SDK_FILE="${PUB_CACHE:-$HOME/.pub-cache}/hosted/pub.dev/firebase_core_web-$CORE_WEB/lib/src/firebase_sdk_version.dart"
if [ ! -f "$SDK_FILE" ]; then
  echo "::error::$SDK_FILE not found (run flutter pub get first)"
  exit 1
fi
PAGE_JS=$(sed -n "s/.*supportedFirebaseJsSdkVersion = '\([^']*\)'.*/\1/p" "$SDK_FILE")
SW_JS=$(sed -n "s/^const FIREBASE_JS_VERSION = '\([^']*\)'.*/\1/p" "$M/web/firebase-messaging-sw.js")
if [ -z "$PAGE_JS" ] || [ "$PAGE_JS" != "$SW_JS" ]; then
  echo "::error file=$M/web/firebase-messaging-sw.js::push worker Firebase JS '$SW_JS' != page's '$PAGE_JS' (firebase_core_web $CORE_WEB)"
  fail=1
else
  echo "ok  push worker Firebase JS $SW_JS == firebase_core_web $CORE_WEB"
fi
exit "$fail"
