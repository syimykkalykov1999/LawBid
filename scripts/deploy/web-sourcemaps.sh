#!/usr/bin/env bash
# S17-2 (2026-10-25): the web build is made with `--source-maps` so a crash in
# the browser can be located. The maps NEVER go to the bucket: they are moved
# out of the bundle first (nothing public, nothing for CloudFront to serve),
# and, when SENTRY_AUTH_TOKEN is set, sent to Sentry for this release.
#
# Usage (before web-immutable.py):
#   scripts/deploy/web-sourcemaps.sh apps/mobile/build/web <sha> <app version> <maps dir>
#
# Sentry: release `lawbid@<app version>` (what SentryReporter sends), dist
# `<sha>` (the reporter adds it from the BUILD_SHA define), url prefix
# `~/v/<sha>` (where web-immutable.py puts the files). Org / project / token
# come from SENTRY_ORG, SENTRY_PROJECT_WEB, SENTRY_AUTH_TOKEN (repository
# secrets); without them the maps are only kept in <maps dir> (a failed or
# skipped upload never blocks a deploy).
set -euo pipefail
ROOT="${1:?build/web folder}"
SHA="${2:?git sha}"
VERSION="${3:?app version}"
OUT="${4:?folder for the maps}"

mkdir -p "$OUT"
n=0
while IFS= read -r -d '' f; do
  rel="${f#"$ROOT"/}"
  mkdir -p "$OUT/$(dirname "$rel")"
  mv "$f" "$OUT/$rel"
  n=$((n + 1))
done < <(find "$ROOT" -name '*.map' -print0)
echo "moved $n source map(s) out of the bundle into $OUT"

# Nothing may point the browser at a map we do not publish.
if grep -rIl 'sourceMappingURL' "$ROOT" --include='*.js' --include='*.mjs' >/dev/null 2>&1; then
  # The wasm module carries the same hint in a custom section; harmless
  # (devtools asks once, gets a 404), but the JS ones are stripped.
  grep -rIl 'sourceMappingURL' "$ROOT" --include='*.js' --include='*.mjs' | while read -r f; do
    sed -i.bak -E '/^\/\/# sourceMappingURL=.*\.map\s*$/d' "$f" && rm -f "$f.bak"
  done
fi

if [ "$n" -eq 0 ]; then
  echo "::warning::the build produced no source maps (--source-maps missing?)"
  exit 0
fi

if [ -z "${SENTRY_AUTH_TOKEN:-}" ] || [ -z "${SENTRY_ORG:-}" ] || [ -z "${SENTRY_PROJECT_WEB:-}" ]; then
  echo "Sentry upload skipped (SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT_WEB not set)"
  exit 0
fi

CLI="npx --yes @sentry/cli@2.42.2"
REL="lawbid@${VERSION}"
# The maps refer to the source files by name; the compiled files are not
# needed for matching by debug id / release+dist, only the maps.
$CLI releases new "$REL" --project "$SENTRY_PROJECT_WEB" || true
$CLI sourcemaps upload "$OUT" \
  --release "$REL" --dist "$SHA" \
  --url-prefix "~/v/${SHA}" \
  --project "$SENTRY_PROJECT_WEB" \
  --ext map || echo "::warning::Sentry source map upload failed (the deploy goes on)"
