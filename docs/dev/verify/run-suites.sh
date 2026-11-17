#!/usr/bin/env bash
# Проверка 17.11: прогон e2e-наборов на настоящих Postgres, Redis/Valkey и MinIO (локально).
# Своя база (<db>_e2e_cmv_<хэш>) и своя логическая база Valkey 13 — dev-база не трогается.
#   docs/dev/verify/run-suites.sh <пачка>          пачки: auth cases pay content search media admin
#   docs/dev/verify/run-suites.sh probe <имя>      моя проба из docs/dev/verify/<имя>.e2e-spec.ts
# Ожидаемый вывод: строки PASS по каждому набору, итог "Tests: N passed, N total",
# у проб ещё строки "CMV ..." с замерами (числа — в docs/dev/CONTENT_MEDIA_VERIFY_2026-11-17.md).
# После всех пачек: docs/dev/verify/cleanup.sh
set -euo pipefail
cd "$(dirname "$0")/../../../apps/api"
export PATH=/opt/homebrew/opt/node@26/bin:$PATH
case "${1:-}" in
  auth)    S="auth auth-hardening onboarding owner-sms-rules owner-single-device passkeys magic-link profiles-onboarding profiles-practices owner-usernames owner-client-profile" ;;
  cases)   S="stage-4-1 stage-4-2 stage-4-3 stage-4-4 stage-4-5 stage-4-6 stage-4-7 stage-4-8 stage-4-mine bid-confirmation owner-case-photos owner-case-comments" ;;
  # В локальном apps/api/.env стоит пустое STRIPE_PRICE_ID= ; пустая строка не считается «нет цены»
  # (pricing.service.ts legacyPriceId: `??`), и тестовый провайдер отвечает 503. В CI переменной нет.
  pay)     S="stage-6-7 owner-subscription-cancel owner-duplicate-subscriptions owner-case-payments owner-seat-limit"
           export STRIPE_PRICE_ID=price_fakeverify ;;
  content) S="stage-5-2 stage-5-3 stage-5-4 stage-5-5 owner-feed-content owner-media-only-posts owner-hidden-counts owner-reposts owner-mentions owner-post-archive owner-post-insights owner-profile-post-counter stat-counters owner-reel-views owner-reels-attachments owner-stories owner-blocks owner-privacy-follow owner-privacy-moderation report-abuse" ;;
  search)  S="stage-5-6 owner-search-engine owner-people-search search-post-filters-matrix stage-5-8 owner-notifications-search owner-icon-badge" ;;
  media)   S="files owner-storage r2-public-store owner-support-attachments stage-6-9" ;;
  admin)   S="stage-6-6 owner-text-limits owner-admin-content admin-settings-race stage-6-4" ;;
  probe)   S="${2:?имя пробы}" ;;
  *) echo "usage: $0 auth|cases|pay|content|search|media|admin|probe <name>"; exit 2 ;;
esac
P=""
TMP=""
for s in $S; do
  f="test/$s.e2e-spec.ts"
  if [ ! -f "$f" ] && [ -f "../../docs/dev/verify/$s.e2e-spec.ts" ]; then
    # пробы лежат в docs/dev/verify; на время прогона — копия рядом с наборами (импорты ../src/…)
    f="test/zz-verify-$s.e2e-spec.ts"
    cp "../../docs/dev/verify/$s.e2e-spec.ts" "$f"
    TMP="$TMP $f"
  fi
  [ -f "$f" ] || { echo "нет набора $s"; exit 2; }
  P="$P $f"
done
cleanup_tmp() { if [ -n "$TMP" ]; then rm -f $TMP; fi; }
trap cleanup_tmp EXIT
free=$(memory_pressure | awk -F': ' '/free percentage/{gsub("%","",$2);print int($2)}')
[ "$free" -ge 45 ] || { echo "память $free % < 45 % — не запускаю"; exit 3; }
echo "память $free %, наборы:$P"
E2E_ISOLATION=cmv E2E_REDIS_DB=13 ../../scripts/dev/heavy.sh -- \
  npm test -- --config test/jest-e2e.json --maxWorkers=1 $P ${CMV_T:+-t "$CMV_T"} 2>&1 \
  | if [ -n "${CMV_FULL:-}" ]; then grep -v '^\s*at '; else grep -E "^(PASS|FAIL)|Tests:|Test Suites:|●|CMV "; fi || true
# CMV_T="P4" — только эти проверки; CMV_FULL=1 — полный текст ошибок.
