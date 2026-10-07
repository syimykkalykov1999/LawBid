#!/usr/bin/env bash
# Fetches the two files the web build needs for the local database
# (lib/core/persistence/app_database_connection.dart): sqlite3.wasm and
# drift_worker.js, at exactly the sqlite3 / drift versions in pubspec.lock,
# plus web/firebase-config.js for browser notifications.
# Run before `flutter build web`; CI does it in the web job.
set -euo pipefail
cd "$(dirname "$0")/.."
version() { awk -v p="  $1:" '$0==p{f=1} f&&/version:/{gsub(/"/,"",$2); print $2; exit}' pubspec.lock; }
sqlite=$(version sqlite3)
drift=$(version drift)
[ -n "$sqlite" ] && [ -n "$drift" ] || { echo "versions not found in pubspec.lock" >&2; exit 1; }
curl -fsSL --retry 3 -o web/sqlite3.wasm \
  "https://github.com/simolus3/sqlite3.dart/releases/download/sqlite3-${sqlite}/sqlite3.wasm"
curl -fsSL --retry 3 -o web/drift_worker.js \
  "https://github.com/simolus3/drift/releases/download/drift-${drift}/drift_worker.js"
# Firebase "Web app" config for web/firebase-messaging-sw.js (public
# client ids, same values as the FIREBASE_WEB_* dart-defines). Empty =
# no browser notifications.
if [ -n "${FIREBASE_WEB_API_KEY:-}" ] && [ -n "${FIREBASE_WEB_APP_ID:-}" ] \
  && [ -n "${FIREBASE_WEB_SENDER_ID:-}" ] && [ -n "${FIREBASE_WEB_PROJECT_ID:-}" ]; then
  printf 'self.LAWBID_FIREBASE = {apiKey: "%s", appId: "%s", messagingSenderId: "%s", projectId: "%s"};\n' \
    "$FIREBASE_WEB_API_KEY" "$FIREBASE_WEB_APP_ID" "$FIREBASE_WEB_SENDER_ID" "$FIREBASE_WEB_PROJECT_ID" \
    > web/firebase-config.js
else
  echo 'self.LAWBID_FIREBASE = null;' > web/firebase-config.js
fi
echo "web assets: sqlite3 ${sqlite}, drift ${drift}"
