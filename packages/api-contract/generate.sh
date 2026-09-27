#!/bin/sh
# Regenerates the API contract (docs/01_FOUNDATION_AUTH.md §6.3):
#   1. openapi.json      <- apps/api (nest build + boot + SwaggerModule)
#   2. dart/lib/src/**   <- swagger_parser (retrofit clients + json_serializable
#                           models) + build_runner (*.g.dart), then dart format
# Deterministic: the generator toolchain is pinned in dart/pubspec.yaml and
# dart/pubspec.lock, so running this twice produces no git diff (CI "contract
# drift" check: run it, then `git diff --exit-code -- packages/api-contract`).
#
# Step 1 boots the API, so DATABASE_URL/REDIS_URL must be reachable (the
# dev docker compose locally, service containers in CI). Set
# SKIP_OPENAPI_EXPORT=1 to regenerate the Dart client from the committed
# openapi.json only.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)

if [ "${SKIP_OPENAPI_EXPORT:-0}" != "1" ]; then
  echo "[api-contract] exporting openapi.json from apps/api"
  (cd "$root/apps/api" && npm run --silent openapi:export >/dev/null)
fi

cd "$here/dart"
echo "[api-contract] generating the Dart client (lawbid_api)"
dart pub get --enforce-lockfile >/dev/null
# The client covers the versioned API only: /health/* are load-balancer
# probes outside /api/v1 (Terminus shapes; the app probes reachability
# itself), and a generated HealthClient would resolve them against the
# app's /api/v1 base URL. swagger_parser's exclude_tags would also prune
# schemas that only error responses reference (ErrorCode), so filter here.
mkdir -p .dart_tool
node -e '
const fs = require("fs");
const doc = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
for (const path of Object.keys(doc.paths)) {
  if (path.startsWith("/health/")) delete doc.paths[path];
}
fs.writeFileSync(process.argv[2], JSON.stringify(doc, null, 2) + "\n");
' ../openapi.json .dart_tool/openapi.client.json
# Start from an empty output tree so a removed endpoint/schema also
# disappears from the client.
rm -rf lib/src
dart run swagger_parser >/dev/null
dart run build_runner build --delete-conflicting-outputs >/dev/null
dart format lib >/dev/null
echo "[api-contract] done"
