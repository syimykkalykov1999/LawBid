#!/usr/bin/env bash
# scripts/deploy/i18n-needed.sh on a throw-away git repository.
#   bash scripts/deploy/i18n-needed.test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
T="$(mktemp -d "${TMPDIR:-/tmp}/i18n-needed.XXXXXX")"; trap 'rm -rf "$T"' EXIT
mkdir "$T/repo" && cd "$T/repo"
git init -q . && git config user.email t@example.com && git config user.name t && git config commit.gpgsign false
mkdir -p apps/api/prisma/seed/translations apps/api/prisma/migrations/1 apps/api/src/cli apps/api/src/modules/i18n apps/web
echo '{"a":"A"}' > apps/api/prisma/seed/translations/en.json
echo '[]' > apps/api/prisma/seed/languages.seed.json
echo 'x' > apps/api/src/cli/import-translations.ts
echo 'svc' > apps/api/src/modules/i18n/s.ts
echo 'model A {}' > apps/api/prisma/schema.prisma
echo 'SELECT 1;' > apps/api/prisma/migrations/1/migration.sql
echo 'app' > apps/web/x.ts
git add -A && git commit -qm base && BASE=$(git rev-parse HEAD)
PASS=0
ok() { PASS=$((PASS + 1)); echo "ok - $1"; }
die() { echo "not ok - $1"; cat "$T/out.log"; exit 1; }
run() { GITHUB_OUTPUT="$T/gh.out" sh "$ROOT/scripts/deploy/i18n-needed.sh" "$@" > "$T/out.log" 2>&1; }
change() { echo "$2" >> "$1"; git add -A; git commit -qm "$1"; git rev-parse HEAD; }

# 1. an unrelated change: skip.
TO=$(change apps/web/x.ts more)
: > "$T/gh.out"; run "$BASE" "$TO"; grep -q '^needed=false$' "$T/out.log" || die "unrelated change did not skip"
grep -q '^needed=false$' "$T/gh.out" || die "GITHUB_OUTPUT not written"
ok "only other files changed: skipped"

# 2.-6. every input counts.
for F in apps/api/prisma/seed/translations/en.json apps/api/prisma/seed/languages.seed.json apps/api/src/cli/import-translations.ts apps/api/src/modules/i18n/s.ts apps/api/prisma/schema.prisma; do
  FROM=$(git rev-parse HEAD); TO=$(change "$F" changed)
  run "$FROM" "$TO"; grep -q '^needed=true$' "$T/out.log" || die "$F change did not run"
  ok "$F changed: runs"
done

# 7. a new migration: runs.
FROM=$(git rev-parse HEAD); mkdir -p apps/api/prisma/migrations/2; echo 'SELECT 2;' > apps/api/prisma/migrations/2/migration.sql
git add -A; git commit -qm mig; TO=$(git rev-parse HEAD)
run "$FROM" "$TO"; grep -q '^needed=true$' "$T/out.log" || die "new migration did not run"
ok "a new migration: runs"

# 8. a file added to the seed folder and removed again = identical content: skip.
FROM=$(git rev-parse HEAD); echo '{}' > apps/api/prisma/seed/translations/de.json; git add -A; git commit -qm add
git rm -q apps/api/prisma/seed/translations/de.json; git commit -qm rm; TO=$(git rev-parse HEAD)
run "$FROM" "$TO"; grep -q '^needed=false$' "$T/out.log" || die "identical content did not skip"
ok "content identical after add+remove: skipped (content hash, not history)"

# 9.-11. the safe side: unknown release, not a commit, forced.
run "" "$TO"; grep -q '^needed=true$' "$T/out.log" || die "empty from did not run"
ok "running release unknown: runs"
run 0123456789abcdef0123456789abcdef01234567 "$TO"; grep -q '^needed=true$' "$T/out.log" || die "unknown commit did not run"
ok "running release not in the clone: runs"
I18N_SEED_ALWAYS=true run "$TO" "$TO"; grep -q '^needed=true$' "$T/out.log" || die "I18N_SEED_ALWAYS did not run"
ok "I18N_SEED_ALWAYS=true: runs"

echo "i18n-needed: $PASS passed"
