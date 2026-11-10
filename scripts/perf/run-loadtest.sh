#!/usr/bin/env bash
# Owner order 11 (2026-11-09): the AWS load test, three stages of "people online"
# (u1k -> u10k -> u100k), price named BEFORE anything starts, kill switch, proof
# that nothing is left. Plan: docs/dev/LOAD_TEST_PLAN_2026-11-09.md.
#
# This is a thin driver over what already exists and is proven in this repo:
#   loadtest/profiles.json + loadtest/scripts/estimate-cost.mjs   (price, caps)
#   .github/workflows/load-test.yml                               (creates the
#       throw-away copy of the platform, loads it, destroys it; refuses prod)
#   loadtest/scripts/cost-guard.py / guard.py / watchdog.sh       (money + abort)
# Nothing here talks to production and nothing is created by default: every
# paid action needs --go, and even then the workflow waits for the owner's
# approval (GitHub environment `load-test`).
#
#   scripts/perf/run-loadtest.sh price   [profile...]     # tables + total, no AWS
#   scripts/perf/run-loadtest.sh check   <profile>        # preconditions, read-only
#   scripts/perf/run-loadtest.sh start   <profile> [--go] # dispatch the workflow
#   scripts/perf/run-loadtest.sh status                   # runs of the workflow
#   scripts/perf/run-loadtest.sh kill    [run-id] [--go]  # KILL SWITCH (see below)
#   scripts/perf/run-loadtest.sh ladder  [--go]           # smoke -> u1k -> u10k -> u100k,
#                                                          # each only after a green one
# env: REPO (owner/name, default from git), CONFIRM_MARGIN (default 1.0 = the
#      upper bound of the estimate is what we accept to pay), AWS_REGION.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
PROFILES_FILE="$repo/loadtest/profiles.json"
WORKFLOW="load-test.yml"
STAGES=(smoke u1k u10k u100k)
PROD_HOSTS="api.lawbid.dev api.lawbid.app lawbid.dev lawbid.app admin.lawbid.dev admin.lawbid.app"

usage() { sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
need() { command -v "$1" >/dev/null || { echo "missing tool: $1" >&2; exit 2; }; }
gh_repo() {
  if [ -n "${REPO:-}" ]; then echo "$REPO"; return; fi
  # owner/name from the git remote (no network); gh is asked only when that fails
  local u; u="$(git -C "$repo" remote get-url origin 2>/dev/null || true)"
  case "$u" in *github.com[:/]*) u="${u##*github.com[:/]}"; echo "${u%.git}"; return;; esac
  gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true
}

# --- never production: the same three refusals as loadtest/k6/lib/env.js ----------
refuse_prod() {
  local v
  for v in "${API_URL:-}" "${WS_URL:-}" "${HOST_HEADER:-}"; do
    [ -z "$v" ] && continue
    local h; h="$(printf '%s' "$v" | sed -E 's#^[a-z]+://([^/:?]+).*#\1#' | tr '[:upper:]' '[:lower:]')"
    for p in $PROD_HOSTS; do [ "$h" = "$p" ] && { echo "REFUSING: $h is a production host" >&2; exit 5; }; done
  done
}

profile_ok() {
  jq -e --arg p "$1" '.profiles[$p] | select(.stack_hours != null)' "$PROFILES_FILE" >/dev/null 2>&1 \
    || { echo "profile '$1' cannot run on AWS (known: $(jq -r '[.profiles | to_entries[] | select(.value.stack_hours != null) | .key] | join(" ")' "$PROFILES_FILE"))" >&2; exit 2; }
}

cmd_price() {
  need node; need jq
  local list=("$@"); [ ${#list[@]} -eq 0 ] && list=("${STAGES[@]}")
  local total=0 upper=0 p j
  for p in "${list[@]}"; do
    profile_ok "$p"
    node "$repo/loadtest/scripts/estimate-cost.mjs" "$p"; echo
    j="$(node "$repo/loadtest/scripts/estimate-cost.mjs" "$p" --json)"
    total="$(jq -n --argjson a "$total" --argjson b "$(jq .estimate_usd <<<"$j")" '$a + $b')"
    upper="$(jq -n --argjson a "$upper" --argjson b "$(jq .upper_bound_usd <<<"$j")" '$a + $b')"
  done
  printf '\nPRICE LINE: %s = about $%.2f, upper bound $%.2f (AWS list prices, estimate +-30 %%; the workflow refuses to start above the number you type in confirm_cost).\n' "${list[*]}" "$total" "$upper"
}

cmd_check() {
  need gh; need jq; need aws
  local p="${1:?profile}"; profile_ok "$p"
  local r; r="$(gh_repo)"
  echo "== repo: ${r:-?}   profile: $p"
  echo "== profiles.json and tfvars agree:"; node "$repo/loadtest/scripts/check-profiles.mjs"
  echo "== required GitHub pieces (read-only):"
  gh api "repos/$r/environments/load-test" --jq '"environment load-test: reviewers=\(.protection_rules | map(select(.type=="required_reviewers")) | length)"' 2>/dev/null || echo "environment load-test: MISSING (docs/runbooks/LOAD_TEST.md §4.2)"
  gh secret list --repo "$r" --env load-test 2>/dev/null | awk '{print "  env secret: "$1}' || echo "  (cannot list env secrets: no admin token, fine)"
  gh secret list --repo "$r" 2>/dev/null | awk '/AWS_LOADTEST_WATCHDOG_ROLE|AWS_REGION|ECR_REGISTRY/ {print "  repo secret: "$1}' || true
  echo "== images in ECR (the 2026-11-02 runs died here):"
  local reg; reg="$(aws ecr describe-registry --query registryId --output text 2>/dev/null || echo '?')"
  echo "  registry: $reg"
  aws ecr describe-images --repository-name lawbid-pgbouncer --image-ids imageTag=1.24.0-1 --query 'imageDetails[0].imagePushedAt' --output text 2>/dev/null | sed 's/^/  lawbid-pgbouncer:1.24.0-1 pushed /' || echo "  lawbid-pgbouncer:1.24.0-1 MISSING -> Actions -> Build PgBouncer"
  aws ecr describe-images --repository-name lawbid-api --query 'sort_by(imageDetails,&imagePushedAt)[-1].imageTags[0]' --output text 2>/dev/null | sed 's/^/  newest lawbid-api tag: /' || echo "  lawbid-api: cannot read (no AWS login?)"
  echo "== gate: the previous stage must be green in the last 3 days"
  local need=""; case "$p" in m1|m10|u1k) need=smoke;; u10k) need=u1k;; u100k) need=u10k;; calls-full) need=calls-smoke;; esac
  if [ -n "$need" ]; then
    local since n; since="$(date -u -v-3d +%FT%TZ 2>/dev/null || date -u -d '3 days ago' +%FT%TZ)"
    n="$(gh run list --repo "$r" --workflow "$WORKFLOW" --status success --limit 50 --json displayTitle,createdAt \
         --jq "[.[] | select(.createdAt > \"$since\") | select(.displayTitle | startswith(\"Load test $need \"))] | length" 2>/dev/null || echo 0)"
    [ "${n:-0}" -ge 1 ] && echo "  ok: green $need exists" || echo "  NOT YET: no green '$need' run in 3 days -> run it first"
  else echo "  no gate for $p"; fi
  echo "== money brake of the account:"; "$here/loadtest-budget-brake.sh" check || true
}

cmd_start() {
  need gh; need node; need jq
  local p="${1:?profile}"; shift || true
  local go=0; [ "${1:-}" = "--go" ] && go=1
  profile_ok "$p"; refuse_prod
  local r; r="$(gh_repo)"
  local j upper confirm
  j="$(node "$repo/loadtest/scripts/estimate-cost.mjs" "$p" --json)"
  upper="$(jq -r .upper_bound_usd <<<"$j")"
  confirm="$(jq -n --argjson u "$upper" --argjson m "${CONFIRM_MARGIN:-1.0}" '($u * $m | ceil)')"
  echo "profile $p: estimate \$$(jq -r .estimate_usd <<<"$j"), upper bound \$$upper -> confirm_cost=$confirm"
  local cmd=(gh workflow run "$WORKFLOW" --repo "$r" -f "profile=$p" -f "confirm_cost=$confirm" -f "gameday=none")
  [ -n "${IMAGE_TAG:-}" ] && cmd+=(-f "image_tag=$IMAGE_TAG")
  if [ "$go" = 1 ]; then
    "${cmd[@]}"
    echo "dispatched. The run waits for the owner's approval in GitHub (Review deployments -> load-test). Watch: $0 status"
  else
    echo "DRY RUN (add --go to dispatch): ${cmd[*]}"
  fi
}

cmd_status() {
  need gh
  local r; r="$(gh_repo)"
  gh run list --repo "$r" --workflow "$WORKFLOW" --limit "${LIMIT:-10}"
  echo; echo "watchdog (hourly, destroys anything older than 4 h):"
  gh run list --repo "$r" --workflow load-test-watchdog.yml --limit 2
}

# KILL SWITCH. Cancelling the GitHub run is enough: the `always()` steps of the
# workflow destroy the stack (3 tries, then sweep by tag), the hourly watchdog
# is the second net, verify-clean.sh is the proof. Nothing is deleted here by
# hand unless the owner asks for sweep (loadtest/scripts/sweep.sh).
cmd_kill() {
  need gh
  local id="${1:-}"; local go=0; [ "${1:-}" = "--go" ] && { go=1; id=""; }; [ "${2:-}" = "--go" ] && go=1
  local r; r="$(gh_repo)"
  if [ -z "$id" ]; then
    id="$(gh run list --repo "$r" --workflow "$WORKFLOW" --status in_progress --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
    [ -z "$id" ] || [ "$id" = null ] && { echo "no load-test run in progress"; "$repo/loadtest/scripts/verify-clean.sh" --quiet 2>/dev/null || true; return 0; }
  fi
  if [ "$go" = 1 ]; then
    gh run cancel "$id" --repo "$r"
    echo "run $id cancelled -> the workflow's always() steps destroy the stack now; in ~20 min run: loadtest/scripts/verify-clean.sh"
  else
    echo "DRY RUN (add --go): gh run cancel $id --repo $r  (then loadtest/scripts/verify-clean.sh; last resort: loadtest/scripts/sweep.sh)"
  fi
}

cmd_ladder() {
  need gh; need jq
  local go="${1:-}"; local r; r="$(gh_repo)"
  cmd_price "${STAGES[@]}"
  local since prev=""; since="$(date -u -v-3d +%FT%TZ 2>/dev/null || date -u -d '3 days ago' +%FT%TZ)"
  for p in "${STAGES[@]}"; do
    if [ -n "$prev" ]; then
      local n; n="$(gh run list --repo "$r" --workflow "$WORKFLOW" --status success --limit 50 --json displayTitle,createdAt \
        --jq "[.[] | select(.createdAt > \"$since\") | select(.displayTitle | startswith(\"Load test $prev \"))] | length" 2>/dev/null || echo 0)"
      [ "${n:-0}" -ge 1 ] || { echo "ladder stops at $p: '$prev' has no green run in 3 days. Run '$0 start $prev --go' first, read its report, then come back."; return 0; }
    fi
    local running; running="$(gh run list --repo "$r" --workflow "$WORKFLOW" --status in_progress --limit 1 --json databaseId --jq 'length' 2>/dev/null || echo 0)"
    [ "${running:-0}" = 0 ] || { echo "a load test is running: one at a time (concurrency group load-test)"; return 0; }
    local green; green="$(gh run list --repo "$r" --workflow "$WORKFLOW" --status success --limit 50 --json displayTitle,createdAt \
      --jq "[.[] | select(.createdAt > \"$since\") | select(.displayTitle | startswith(\"Load test $p \"))] | length" 2>/dev/null || echo 0)"
    if [ "${green:-0}" -ge 1 ]; then echo "$p: already green in the last 3 days, next"; prev="$p"; continue; fi
    echo "next stage: $p"; cmd_start "$p" "$go"; return 0
  done
  echo "all stages green: write the results into docs/perf/README.md and restore the budget (scripts/perf/loadtest-budget-brake.sh restore)"
}

case "${1:-}" in
  price) shift; cmd_price "$@";;
  check) shift; cmd_check "$@";;
  start) shift; cmd_start "$@";;
  status) cmd_status;;
  kill) shift; cmd_kill "$@";;
  ladder) shift; cmd_ladder "$@";;
  *) usage;;
esac
