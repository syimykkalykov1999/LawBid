#!/usr/bin/env bash
# Web bundle size budget (OPEN_ITEMS_SWEEP 2026-11-09 A-c4; web-deploy.yml).
#
#   scripts/deploy/web-size-budget.sh <build/web dir> [budget.json]
#
# Measures the brotli size (what CloudFront really sends: web-gzip-big.sh
# uploads the .br twins) of the app's own code and of the whole first load,
# prints every number, and fails when a budget in web-size-budget.json is
# exceeded. The build dir is the one BEFORE web-immutable.py moves files
# under v/<sha>/ (the paths in the budget are the plain ones).
# Env for tests: BROTLI_CMD (default "brotli -c -q 11"), WEB_SIZE_NO_BROTLI=1
# uses the raw sizes (when brotli is missing; the deploy installs it).
set -euo pipefail
DIR="${1:?build/web dir}"
BUDGET="${2:-$(cd "$(dirname "$0")" && pwd)/web-size-budget.json}"
command -v jq >/dev/null || { echo "::error::jq is required"; exit 2; }
if [ "${WEB_SIZE_NO_BROTLI:-0}" != "1" ] && ! command -v brotli >/dev/null; then
  echo "::error::brotli is required (apt-get install brotli)"; exit 2
fi

size_of() { # brotli bytes of one file (0 when the file is missing: reported below)
  local f="$DIR/$1"
  [ -f "$f" ] || { echo 0; return; }
  if [ "${WEB_SIZE_NO_BROTLI:-0}" = "1" ]; then wc -c < "$f" | tr -d ' '; return; fi
  ${BROTLI_CMD:-brotli -c -q 11} "$f" | wc -c | tr -d ' '
}

app_max=$(jq -r .app_brotli_bytes_max "$BUDGET")
total_max=$(jq -r .total_brotli_bytes_max "$BUDGET")
app=0; total=0; missing=0
for f in $(jq -r '.files.app[]' "$BUDGET"); do
  s=$(size_of "$f"); [ "$s" = 0 ] && { echo "::warning::missing in the build: $f"; missing=1; }
  printf 'web size  %-28s %10s B (brotli)\n' "$f" "$s"; app=$((app + s))
done
for f in $(jq -r '.files.engine[]' "$BUDGET"); do
  s=$(size_of "$f"); [ "$s" = 0 ] && { echo "::warning::missing in the build: $f"; missing=1; }
  printf 'web size  %-28s %10s B (brotli)\n' "$f" "$s"; total=$((total + s))
done
total=$((total + app))
printf 'web size  APP (our code)    %10s B of %10s allowed (%d %%)\n' "$app" "$app_max" $((app * 100 / app_max))
printf 'web size  FIRST LOAD total  %10s B of %10s allowed (%d %%)\n' "$total" "$total_max" $((total * 100 / total_max))
echo "::notice title=Web bundle::app ${app} B brotli (budget ${app_max}), first load ${total} B (budget ${total_max})"
rc=0
[ "$app" -le "$app_max" ] || { echo "::error title=Web bundle over budget::our code ${app} B > ${app_max} B (brotli). Deferred-load the heavy screen or raise scripts/deploy/web-size-budget.json in this PR with the reason."; rc=1; }
[ "$total" -le "$total_max" ] || { echo "::error title=Web bundle over budget::first load ${total} B > ${total_max} B (brotli)."; rc=1; }
[ "$missing" = 0 ] || { echo "::error::a budgeted file is missing from the build"; rc=1; }
exit $rc
