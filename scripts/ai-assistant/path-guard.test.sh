#!/usr/bin/env bash
# Tests for path-guard.sh (run by repo-guards.yml).
set -euo pipefail
G="$(dirname "$0")/path-guard.sh"
fail=0
must_block() { if printf '%s\n' "$1" | "$G" > /dev/null; then echo "FAIL: not blocked: $1"; fail=1; fi; }
must_pass() { if ! printf '%s\n' "$1" | "$G" > /dev/null; then echo "FAIL: blocked: $1"; fail=1; fi; }
must_block infra/envs/prod/main.tf
must_block .github/workflows/deploy.yml
must_block infra/envs/prod/growth.auto.tfvars.json
must_block apps/mobile/ios/Runner/Info.plist
must_block apps/mobile/android/app/build.gradle.kts
must_block apps/api/prisma/migrations/20261201000000_x/migration.sql
must_block apps/api/src/modules/billing/billing.service.ts
must_block apps/api/src/modules/case-payments/x.ts
must_block apps/api/src/common/secrets/secrets.service.ts
must_block apps/api/.env.example
must_block scripts/deploy/run-migrations.sh
must_block CLAUDE.md
must_pass apps/api/src/modules/cases/cases.service.ts
must_pass apps/admin/src/lib/system-health.ts
must_pass apps/mobile/lib/features/chat/chat_screen.dart
must_pass docs/runbooks/AI_ASSISTANT.md
[ "$fail" = 0 ] && echo "path-guard: ok"
exit "$fail"
