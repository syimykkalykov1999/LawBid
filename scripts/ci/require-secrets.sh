#!/usr/bin/env bash
# First step of a workflow job: every secret/variable the job cannot work
# without is non-empty, checked BEFORE minutes of builds or paid AWS calls
# (audit 2026-11-02: an unset secret surfaced as "Could not load credentials"
# or an empty --dart-define after a 30-minute build).
#
#   require-secrets.sh NAME [NAME ...] [?OPTIONALNAME ...]
#
# The values come from the step's env: (the workflow maps secrets.X -> X).
# A name with a leading "?" only warns. Every missing name is listed, not just
# the first. The values are never printed. Exit 1 when a required one is empty.
set -u
[ "$#" -ge 1 ] || { echo "usage: require-secrets.sh NAME... [?OPTIONAL...]" >&2; exit 2; }
bad=0
for n in "$@"; do
  opt=0; case "$n" in \?*) opt=1; n="${n#\?}" ;; esac
  case "$n" in *[!A-Za-z0-9_]*|"") echo "::error::bad name '$n'"; exit 2 ;; esac
  v="${!n-}"
  v="${v//[[:space:]]/}"
  if [ -n "$v" ]; then continue; fi
  if [ "$opt" = 1 ]; then echo "::warning::$n is empty (optional: the feature behind it stays off)"; continue; fi
  echo "::error::$n is empty or not set. Add it under Settings -> Secrets and variables -> Actions (names and meaning: docs/runbooks/DEPLOY_PROD.md, .github/workflows/README.md)."
  bad=1
done
[ "$bad" = 0 ] && echo "ok   ${#} required inputs present"
exit "$bad"
