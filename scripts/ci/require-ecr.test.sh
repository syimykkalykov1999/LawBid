#!/usr/bin/env bash
# Offline test of require-ecr.sh with a stub `aws` that answers per repo/tag.
set -u
D="$(cd "$(dirname "$0")" && pwd)"; T="$(mktemp -d)"; fail=0
trap 'rm -rf "$T"' EXIT
cat >"$T/aws" <<'STUB'
#!/usr/bin/env bash
# args: ecr describe-images --repository-name R [--image-ids imageTag=T | --max-items 1]
repo=""; tag=""
while [ $# -gt 0 ]; do case "$1" in --repository-name) repo="$2"; shift;; --image-ids) tag="${2#imageTag=}"; shift;; esac; shift; done
case "$repo" in
  lawbid-missing) echo "An error occurred (RepositoryNotFoundException) when calling the DescribeImages operation: The repository with name 'lawbid-missing' does not exist" >&2; exit 254;;
  lawbid-denied)  echo "An error occurred (AccessDeniedException) when calling the DescribeImages operation: nope" >&2; exit 254;;
esac
if [ -n "$tag" ] && [ "$tag" != "1.0" ]; then echo "An error occurred (ImageNotFoundException) when calling the DescribeImages operation: The image with imageId {imageTag:$tag} does not exist" >&2; exit 254; fi
echo '{"imageDetails":[]}'
STUB
chmod +x "$T/aws"
run() { # name want-exit want-text args...
  local name="$1" want="$2" text="$3"; shift 3
  out="$(AWS_CLI="$T/aws" "$D/require-ecr.sh" "$@" 2>&1)"; got=$?
  if [ "$got" != "$want" ] || ! echo "$out" | grep -q -- "$text"; then echo "FAIL $name: exit $got (want $want), output: $out"; fail=1; else echo "ok   $name"; fi
}
run "repo + tag present" 0 "ok   ECR lawbid-api:1.0" lawbid-api:1.0
run "repo only present" 0 "ok   ECR lawbid-api" --repo lawbid-api
run "missing repository names bootstrap" 1 "does not exist. Workflow roles cannot create" lawbid-missing:1.0
run "missing repo in --repo mode" 1 "repository 'lawbid-missing' does not exist" --repo lawbid-missing
run "missing tag names the workflow" 1 'Build PgBouncer' lawbid-pgbouncer:9.9
run "clamav tag names Mirror ClamAV" 1 'Mirror ClamAV' lawbid-clamav:1.4
run "unexpected error is shown" 2 "AccessDeniedException" lawbid-denied:1.0
run "reports every problem, not the first" 1 "lawbid-clamav:1.4" lawbid-missing:1.0 lawbid-clamav:1.4
run "--repo rejects a :tag" 2 "takes repository names only" --repo lawbid-api:1.0
run "denied is exit 2 with the hint" 2 "added to infra/bootstrap" lawbid-denied:1.0
run "probe: found" 0 "ok   ECR" --probe lawbid-api:1.0
run "probe: tag absent is exit 1" 1 "not there yet" --probe lawbid-api:9.9
run "probe: missing repository is exit 2, not 'absent'" 2 "does not exist" --probe lawbid-missing:1.0
run "tag required without --repo" 2 "has no :tag" lawbid-api
run "no args is usage" 2 "usage"

# The tags load-test.yml expects must be the tags the build workflows push by
# default (audit 2026-11-02: load-test asked for lawbid-clamav:1.4, Mirror
# ClamAV pushes 1.4-debian).
R="$D/../.."
pick() { sed -n "s/^ *$1=\([0-9A-Za-z._-]*\) *$/\1/p" "$R/.github/workflows/load-test.yml" | head -1; }
dflt() { awk -v k="$2" '$0 ~ "^ *"k":" {f=1} f && /default:/ {gsub(/[" ]/,"",$2); print $2; exit}' "$R/.github/workflows/$1"; }
chk() { if [ -z "$2" ] || [ "$2" != "$3" ]; then echo "FAIL $1: load-test has '$2', workflow default '$3'"; fail=1; else echo "ok   $1 ($2)"; fi; }
chk "pgbouncer tag matches Build PgBouncer" "$(pick PGBOUNCER_TAG)" "$(dflt build-pgbouncer.yml tag)"
chk "clamav tag matches Mirror ClamAV" "$(pick CLAMAV_TAG)" "$(dflt mirror-clamav.yml target_tag)"
exit $fail
