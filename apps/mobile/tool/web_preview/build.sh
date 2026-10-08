#!/usr/bin/env bash
# Browser preview of the app (owner 2026-10-07: see every UI change live,
# before a Play build). Builds apps/mobile for the web against the PROD
# API, with no keys in the bundle (config/prod.example.json). serve.mjs
# serves it next to a proxy; publish.sh puts it on GitHub Pages.
#
#   tool/web_preview/build.sh [out_dir] [base_href]
#
# out_dir defaults to build/web_preview; base_href (the path the preview
# is served under, with slashes) defaults to "/". Needs flutter on PATH.
set -euo pipefail

cd "$(dirname "$0")/../.."
OUT="${1:-build/web_preview}"
BASE="${2:-/}"

# The web/ shell is not committed (Android/iOS are the product); create it
# fresh so it always matches the installed Flutter.
if [[ ! -f web/index.html ]]; then
  flutter create --platforms=web --project-name lawbid . >/dev/null
  git checkout -- .metadata analysis_options.yaml 2>/dev/null || true
fi

# Our page shell: full screen on a phone (iOS Safari and Chrome), a
# phone-sized frame on a wide screen.
cp tool/web_preview/index.html tool/web_preview/flutter_bootstrap.js web/

# drift on the web needs SQLite compiled to wasm and drift's worker, at the
# versions pubspec.lock pins (lib/core/persistence/drift_web.dart).
ver() { awk -v p="  $1:" '$0==p{f=1} f&&/version:/{gsub(/"/,"",$2);print $2;exit}' pubspec.lock; }
DRIFT="$(ver drift)"; SQLITE="$(ver sqlite3)"
[[ -f web/drift_worker.js ]] || curl -fsSL -o web/drift_worker.js \
  "https://github.com/simolus3/drift/releases/download/drift-$DRIFT/drift_worker.js"
[[ -f web/sqlite3.wasm ]] || curl -fsSL -o web/sqlite3.wasm \
  "https://github.com/simolus3/sqlite3.dart/releases/download/sqlite3-$SQLITE/sqlite3.wasm"

flutter pub get >/dev/null
dart run build_runner build --delete-conflicting-outputs >/dev/null

# By default API_BASE_URL is a path: the app calls the server it was loaded
# from, and serve.mjs forwards /api and /socket.io to the real API (no CORS
# needed). A static host (GitHub Pages, publish.sh) sets PREVIEW_API_BASE to
# the full API URL; its origin must be in the admin's web.allowed_origins.
API_BASE="${PREVIEW_API_BASE:-/api/v1}"
CONFIG="$(mktemp -d)/preview.json"
sed "s#\"API_BASE_URL\": *\"[^\"]*\"#\"API_BASE_URL\": \"$API_BASE\"#" config/prod.example.json > "$CONFIG"
flutter build web --release -t lib/main_prod.dart \
  --dart-define-from-file="$CONFIG" \
  --no-web-resources-cdn --base-href "$BASE" -o "$OUT"
rm -f "$CONFIG"

# A preview, not a website: keep it out of search engines.
printf 'User-agent: *\nDisallow: /\n' > "$OUT/robots.txt"
git rev-parse --short HEAD > "$OUT/preview-commit.txt"
echo "Built $OUT ($(cat "$OUT/preview-commit.txt"))"
