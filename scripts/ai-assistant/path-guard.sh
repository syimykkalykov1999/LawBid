#!/usr/bin/env bash
# 09.11.2026, widened 12.11.2026 (owner: «ИИ должен работать точь в точь как
# ты»): the AI assistant may change any code by PR on the owner's word, money
# modules, migrations, admin and infra code included. Every PR waits for the
# owner's «Разрешить» (2FA) in the admin; the API re-checks CI, the head sha
# and this guard before it merges. Only these hard walls stay:
#   - .github/: a workflow edited in a PR branch runs with the repository's
#     secrets before anyone approves it (secrets could be printed);
#   - infra/bootstrap*: IAM the owner applies by hand (terraform for prod
#     goes by PR and is applied only by infra-apply.yml: plan -> owner 2FA);
#   - real secrets and store/signing keys (.env*, *.jks, *.p12, *.p8, ...);
#   - this guard itself and the rule files.
# Reads changed paths (one per line) on stdin; prints the forbidden ones;
# exit 1 if any. The API applies the SAME list before a merge
# (apps/api/src/modules/ai-assistant/ai-pull-guard.logic.ts); a jest spec
# reads this file and fails when the two drift. One ERE per line, no single
# quotes inside the block.
set -euo pipefail

FORBIDDEN='
^\.github/
^infra/bootstrap
(^|/)\.env
\.(jks|keystore|p12|p8|mobileprovision|pem|key)$
(^|/)key\.properties$
^scripts/ai-assistant/
^apps/api/src/modules/ai-assistant/ai-pull-guard\.logic(\.spec)?\.ts$
(^|/)CLAUDE\.md$
^AGENTS\.md$
^docs/dev/STRICT_RULES\.md$
^\.claude/
'

BAD=$(grep -E -f <(printf '%s\n' "$FORBIDDEN" | sed '/^$/d') || true)
if [ -n "$BAD" ]; then
  echo "$BAD"
  exit 1
fi
