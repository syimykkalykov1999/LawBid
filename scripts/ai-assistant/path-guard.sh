#!/usr/bin/env bash
# 09.11.2026: what the AI assistant may never change. Reads changed paths
# (one per line) on stdin; prints the forbidden ones; exit 1 if any.
# Money, keys, IAM/Terraform, CI and deploys, store releases, phone build
# signing and destructive migrations stay human work (POLICY.md).
set -euo pipefail
BAD=$(grep -E \
  -e '^infra/' \
  -e '^\.github/' \
  -e '\.tfvars(\.json)?$' \
  -e '(^|/)fastlane/' \
  -e '^apps/mobile/(ios|android)/' \
  -e '^scripts/(deploy|infra|ops)/' \
  -e '(^|/)\.env' \
  -e '(^|/)(THIRD_PARTY_NOTICES|LICENSE)' \
  -e '^apps/api/prisma/migrations/' \
  -e '^apps/api/src/modules/(billing|payments|case-payments|treasury|payroll|stripe)[^/]*/' \
  -e '^apps/api/src/common/secrets/' \
  -e '^CLAUDE\.md$|^AGENTS\.md$|^docs/dev/(STRICT_RULES|KNOWN_ERRORS)\.md$' \
  || true)
if [ -n "$BAD" ]; then
  echo "$BAD"
  exit 1
fi
