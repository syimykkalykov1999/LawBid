#!/usr/bin/env sh
# Deploy speed (25.11): the «Translations (all 85 languages)» step of deploy.yml
# took 2m13 on EVERY release (a one-off Fargate task) even when nothing it reads
# changed. It only ADDS what the database lacks (--missing-only), so when every
# input is byte-identical to the release that ran it last time, there is nothing
# new to add or update. Same idea as Turborepo / Nx / Bazel task caching: the inputs'
# content hash decides, not the commit.
#
#   i18n-needed.sh <from-ref> <to-ref>
# <from-ref> = the release running now (SSM last_good_tag: written only after a
# release passed every deploy step, the translations step included).
# Prints `needed=true|false` (also to $GITHUB_OUTPUT) and why.
# needed=true (run as before) when: I18N_SEED_ALWAYS=true, <from-ref> is empty or
# not a commit here, or the git object id (SHA content hash) of ANY input differs:
#   the seed itself (and its known earlier texts), the importer and its i18n module, the languages list, the
#   Prisma schema and the migrations (a migration may touch the translations).
set -eu
FROM="${1:-}"; TO="${2:?to-ref}"
INPUTS="${I18N_INPUTS:-apps/api/prisma/seed/translations apps/api/prisma/seed/translations-superseded.json apps/api/prisma/seed/languages.seed.json apps/api/src/cli/import-translations.ts apps/api/src/modules/i18n apps/api/prisma/schema.prisma apps/api/prisma/migrations}"
say() {
  echo "needed=$1"
  echo "translations: $2"
  [ -z "${GITHUB_OUTPUT:-}" ] || echo "needed=$1" >> "$GITHUB_OUTPUT"
  exit 0
}
[ "${I18N_SEED_ALWAYS:-false}" != true ] || say true "I18N_SEED_ALWAYS=true: run"
[ -n "$FROM" ] || say true "running release unknown: run"
git rev-parse --verify -q "$FROM^{commit}" >/dev/null || say true "running release $FROM is not a commit here: run"
git rev-parse --verify -q "$TO^{commit}" >/dev/null || say true "$TO is not a commit here: run"
for P in $INPUTS; do
  A=$(git rev-parse -q --verify "$FROM:$P" 2>/dev/null || echo missing)
  B=$(git rev-parse -q --verify "$TO:$P" 2>/dev/null || echo missing)
  [ "$A" = "$B" ] || say true "$P changed since $FROM ($A -> $B): run"
done
say false "every input is byte-identical to the running release $FROM (git object ids): nothing new to add, step skipped"
