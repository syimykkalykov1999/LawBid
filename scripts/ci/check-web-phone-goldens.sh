#!/usr/bin/env bash
# Desktop web plan 2026-10-28 §9: the desktop web work must not change the
# phone at all. A pull request may ADD golden images anywhere, but it may
# not change, delete or rename an existing one outside apps/mobile/test/desktop/
# (the phone, tablet and design-system snapshots stay byte-identical).
#
# Usage: scripts/ci/check-web-phone-goldens.sh [BASE [HEAD]]
# Default: HEAD^1..HEAD (the merge commit GitHub checks out for a PR, so
# exactly the PR's own changes). A phone change the owner approved: label
# the PR "phone-goldens-approved" (the workflow sets ALLOW_PHONE_GOLDEN_CHANGE=1).
set -eu
cd "$(dirname "$0")/../.."
BASE="${1:-HEAD^1}"
HEAD="${2:-HEAD}"
changed=$(git diff --name-only --diff-filter=MDRT "$BASE" "$HEAD" -- \
  'apps/mobile/test/**/goldens/*.png' 'apps/mobile/test/*/goldens/*.png' \
  | grep -v '^apps/mobile/test/desktop/' | sort -u || true)
if [ -z "$changed" ]; then
  echo "Phone goldens unchanged (desktop goldens may change freely)."
  exit 0
fi
if [ "${ALLOW_PHONE_GOLDEN_CHANGE:-0}" = "1" ]; then
  echo "Phone goldens changed, allowed by the PR label:"
  echo "$changed"
  exit 0
fi
echo "::error::Phone golden images changed — the phone must stay byte-identical (docs/architecture/DESKTOP_WEB_PLAN_2026-10-28.md §9):"
echo "$changed"
exit 1
