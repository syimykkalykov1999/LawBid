#!/usr/bin/env bash
# Проверка 17.11 по пачкам (VERIFY_PLAN_2026-11-17.md): e2e-наборы и пробы на настоящих
# Postgres, Redis и MinIO Мака. Своя база (<db>_e2e_v9_<хэш>) и логическая база Redis 11.
#   docs/dev/verify/v9-run.sh <набор|проба> [...]   например: stage-5-4 v9-batch1-probe
#   V9_T='C1' — только эти проверки; V9_FULL=1 — полный вывод ошибок.
# Пробы лежат в docs/dev/verify/<имя>.e2e-spec.ts и на время прогона копируются в apps/api/test.
set -euo pipefail
cd "$(dirname "$0")/../../../apps/api"
export PATH=/opt/homebrew/opt/node@26/bin:$PATH
P=""; TMP=""
for s in "$@"; do
  f="test/$s.e2e-spec.ts"
  if [ ! -f "$f" ] && [ -f "../../docs/dev/verify/$s.e2e-spec.ts" ]; then
    f="test/zz-verify-$s.e2e-spec.ts"; cp "../../docs/dev/verify/$s.e2e-spec.ts" "$f"; TMP="$TMP $f"
  fi
  [ -f "$f" ] || { echo "нет набора $s"; exit 2; }
  P="$P $f"
done
cleanup_tmp() { if [ -n "$TMP" ]; then rm -f $TMP; fi; }
trap cleanup_tmp EXIT
free=$(memory_pressure | awk -F': ' '/free percentage/{gsub("%","",$2);print int($2)}')
[ "$free" -ge 45 ] || { echo "память $free % < 45 % — не запускаю"; exit 3; }
echo "память $free %, наборы:$P"
E2E_ISOLATION=v9 E2E_REDIS_DB=11 ../../scripts/dev/heavy.sh -- \
  npm test -- --config test/jest-e2e.json --maxWorkers=1 $P ${V9_T:+-t "$V9_T"} 2>&1 \
  | if [ -n "${V9_FULL:-}" ]; then grep -v '^\s*at '; else grep -E "^(PASS|FAIL)|Tests:|Test Suites:|●|V9 |✓|✕"; fi || true
