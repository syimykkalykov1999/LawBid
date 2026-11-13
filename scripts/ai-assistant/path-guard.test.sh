#!/usr/bin/env bash
# Tests for path-guard.sh (run by repo-guards.yml).
set -euo pipefail
G="$(dirname "$0")/path-guard.sh"
fail=0
must_block() { if printf '%s\n' "$1" | "$G" > /dev/null; then echo "FAIL: not blocked: $1"; fail=1; fi; }
must_pass() { if ! printf '%s\n' "$1" | "$G" > /dev/null; then echo "FAIL: blocked: $1"; fail=1; fi; }
# Hard walls (owner 12.11): CI with secrets, bootstrap IAM, real keys, the guard, the rules.
must_block .github/workflows/deploy.yml
must_block .github/ai-assistant/POLICY.md
must_block infra/bootstrap/main.tf
must_block infra/bootstrap-loadtest/main.tf
must_block apps/api/.env
must_block apps/api/.env.example
must_block apps/mobile/android/upload.jks
must_block apps/mobile/android/key.properties
must_block apps/mobile/ios/AuthKey_ABC.p8
must_block scripts/ai-assistant/path-guard.sh
must_block apps/api/src/modules/ai-assistant/ai-pull-guard.logic.ts
must_block CLAUDE.md
must_block apps/api/CLAUDE.md
must_block AGENTS.md
must_block docs/dev/STRICT_RULES.md
must_block .claude/settings.json
# Any other code by PR on the owner's word: money, migrations, admin, infra, phones.
must_pass apps/api/src/modules/billing/billing.service.ts
must_pass apps/api/src/modules/treasury/treasury.service.ts
must_pass apps/api/prisma/migrations/20261201000000_x/migration.sql
must_pass apps/api/prisma/schema.prisma
must_pass apps/api/src/modules/admin-auth/admin-auth.service.ts
must_pass apps/api/src/modules/ai-assistant/ai-assistant.service.ts
must_pass apps/api/src/common/secrets/secrets.service.ts
must_pass infra/envs/prod/main.tf
must_pass infra/envs/prod/iam.tf
must_pass infra/modules/ecs/main.tf
must_pass apps/mobile/ios/Runner/AppDelegate.swift
must_pass apps/mobile/lib/features/chat/chat_screen.dart
must_pass scripts/deploy/run-migrations.sh
must_pass docs/dev/KNOWN_ERRORS.md
must_pass "apps/admin/src/app/(app)/ai-assistant/page.tsx"
# A mixed list: only the bad line is printed.
out=$(printf 'apps/api/src/modules/cases/a.ts\n.github/workflows/x.yml\n' | "$G" || true)
[ "$out" = ".github/workflows/x.yml" ] || { echo "FAIL: mixed list printed: $out"; fail=1; }
[ "$fail" = 0 ] && echo "path-guard: ok"
exit "$fail"
