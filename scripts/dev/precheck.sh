#!/usr/bin/env bash
# Pre-push check: the CI gates that most often turn a PR red, run locally
# against what YOUR branch changed (docs/dev/CI_CHECKLIST.md explains each).
#
#   bash scripts/dev/precheck.sh          fast (seconds): cheap gates only
#   bash scripts/dev/precheck.sh --full   adds typecheck, related unit tests,
#                                         ERD, API contract (minutes)
# Skip once: SKIP_PRECHECK=1 git push
set -u
FULL=0; [ "${1:-}" = "--full" ] && FULL=1
cd "$(git rev-parse --show-toplevel)"
BASE="${PRECHECK_BASE:-origin/main}"
git rev-parse --verify -q "$BASE" >/dev/null || { echo "precheck: $BASE not found (git fetch origin main)"; exit 0; }
CH=$(git diff --name-only --diff-filter=d "$BASE"...HEAD)
[ -z "$CH" ] && { echo "precheck: no changes against $BASE"; exit 0; }
FAIL=0
bad() { echo "✖ $*"; FAIL=1; }
ok()  { echo "✔ $*"; }
has() { echo "$CH" | grep -qE "$1"; }

# 1. Branch freshness: a stale branch makes the contract/ERD/boundary baselines lie.
if git merge-base --is-ancestor "$BASE" HEAD; then ok "branch contains $BASE"
else bad "branch is behind $BASE — merge it, then re-run (contract/ERD/baselines must be regenerated after the merge)"; fi

# 2. Whitespace / conflict markers.
git diff --check "$BASE"...HEAD >/dev/null 2>&1 && ok "no conflict markers / whitespace errors" || bad "git diff --check finds conflict markers or whitespace errors"

# 3. New migrations: lock_timeout first (squawk require-lock-timeout).
for f in $(echo "$CH" | grep -E 'apps/api/prisma/migrations/.*/migration\.sql$'); do
  [ -f "$f" ] || continue
  grep -qi 'lock_timeout' "$f" || bad "$f has no SET LOCAL lock_timeout (squawk will fail)"
done

# 4. i18n: every key used in code exists in the translations seed (prisma/seed/translations/*.json), all 85 languages filled.
if has '^(apps/(api|mobile|admin)/|scripts/i18n)'; then
  node scripts/i18n-audit.mjs --ci >/tmp/precheck-i18n.log 2>&1 && ok "i18n audit" || { bad "i18n audit (tail below; add keys with scripts/i18n-add.mjs)"; tail -8 /tmp/precheck-i18n.log; }
fi

# 5. Secrets on own diff.
if command -v gitleaks >/dev/null; then
  gitleaks git --no-banner --log-opts="$BASE..HEAD" . >/tmp/precheck-gl.log 2>&1 && ok "gitleaks" || { bad "gitleaks (rename fake tokens to test-…-token or add to .gitleaksignore)"; tail -12 /tmp/precheck-gl.log; }
else echo "· gitleaks not installed — skipped (brew install gitleaks)"; fi
if echo "$CH" | grep -q '^graphify-out/'; then bad "graphify-out/ is a local cache — do not commit it (gitleaks false positives)"; fi

# 6. Mobile: hardcoded strings/colours.
if has '^apps/mobile/lib/'; then
  python3 apps/mobile/tool/ci/hardcoded_check.py >/tmp/precheck-hc.log 2>&1 && ok "hardcoded strings/colours" || { bad "hardcoded_check.py"; tail -8 /tmp/precheck-hc.log; }
fi

# 7. Deep links: AASA / assetlinks generator vs AndroidManifest.xml (CI: "Repo guards").
if has '^(scripts/seo/|apps/mobile/android/app/src/main/AndroidManifest\.xml|docs/deeplinks/)'; then
  node --test scripts/seo/test/*.test.mjs >/tmp/precheck-seo.log 2>&1 && ok "SEO / deep-link generator tests" || { bad "scripts/seo tests (AndroidManifest paths must match scripts/seo/well-known.mjs APP_PATHS)"; grep -E "^not ok|error:" /tmp/precheck-seo.log | head -8; }
fi

if [ "$FULL" = 1 ]; then
  if has '^apps/api/'; then
    ( cd apps/api && npx tsc --noEmit -p tsconfig.json ) >/tmp/precheck-tsc.log 2>&1 && ok "api typecheck" || { bad "api typecheck"; tail -10 /tmp/precheck-tsc.log; }
    SPECS=$(echo "$CH" | grep -E '^apps/api/src/.*\.ts$' | sed 's|^apps/api/||' | tr '\n' ' ')
    [ -n "$SPECS" ] && ( cd apps/api && npx jest --findRelatedTests $SPECS ) >/tmp/precheck-jest.log 2>&1 && ok "unit tests related to changed files" || { [ -n "$SPECS" ] && { bad "related unit tests"; tail -25 /tmp/precheck-jest.log; }; }
    # Time bombs: the same specs with the clock 45 days ahead (CI: "Time-bomb check (nightly)").
    [ -n "$SPECS" ] && { ( cd apps/api && IGN=$(grep -rl useFakeTimers src --include='*.spec.ts' | sed 's#\.#\\.#g' | paste -sd'|'); TIME_SHIFT_DAYS=45 npx jest --setupFiles '<rootDir>/../test/time-shift.setup.js' --testPathIgnorePatterns "$IGN" --findRelatedTests $SPECS ) >/tmp/precheck-jest45.log 2>&1 && ok "related unit tests, clock +45 days" || { bad "a related spec breaks when the date moves forward (fixed calendar date?)"; grep -E "●.*›|FAIL " /tmp/precheck-jest45.log | head -8; }; }
  fi
  if has '^apps/api/prisma/schema\.prisma$'; then
    npm run db:erd --workspace apps/api >/dev/null 2>&1; git diff --quiet -- docs/db/ERD.md && ok "ERD up to date" || bad "docs/db/ERD.md changed — commit it"
  fi
  if has '^apps/api/src/'; then
    sh packages/api-contract/generate.sh >/tmp/precheck-gen.log 2>&1
    [ -z "$(git status --porcelain --untracked-files=all -- packages/api-contract)" ] && ok "API contract up to date" || bad "packages/api-contract is out of date — commit the regenerated files (then oasdiff vs main)"
  fi
  if has '^apps/mobile/'; then
    ( cd apps/mobile && flutter analyze ) >/tmp/precheck-fa.log 2>&1 && ok "flutter analyze (whole app)" || { bad "flutter analyze (CI fails even on info)"; tail -15 /tmp/precheck-fa.log; }
  fi
else
  echo "· fast mode. Before the LAST push run: bash scripts/dev/precheck.sh --full"
fi

[ "$FAIL" = 0 ] && echo "precheck: OK" || echo "precheck: FIX THE ✖ ABOVE BEFORE PUSHING"
exit $FAIL
