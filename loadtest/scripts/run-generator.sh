#!/usr/bin/env bash
# One load generator (a GitHub runner, an EC2 Spot box or the Mac): checks the
# target, runs k6 for the profile with the abort guard beside it, leaves the
# results in $OUT. Exit code: 0 ok, 3 aborted by the guard, 4 k6 thresholds
# failed (the load ran fully, something was slower than the targets),
# 5 refused (target check), other = k6 failed to run.
#
# env: PROFILE API_URL WS_URL TOKENS_FILE FIXTURES_FILE [HOST_HEADER CDN_URL
#      SHARD SHARDS OUT ALLOW_LOCAL PROD_HOSTS]
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"

: "${PROFILE:?PROFILE is required}"
: "${API_URL:?API_URL is required}"
: "${WS_URL:?WS_URL is required}"
: "${TOKENS_FILE:?TOKENS_FILE is required}"
: "${FIXTURES_FILE:?FIXTURES_FILE is required}"
OUT="${OUT:-$root/results/$PROFILE-${SHARD:-0}}"
mkdir -p "$OUT"

# --- refuse production (second of three independent checks; k6 setup() is the third) ---
host="$(printf '%s' "$API_URL" | sed -E 's#^[a-z]+://([^/:?]+).*#\1#' | tr 'A-Z' 'a-z')"
prod_hosts="${PROD_HOSTS:-api.lawbid.dev,api.lawbid.app,lawbid.dev,lawbid.app,admin.lawbid.dev,admin.lawbid.app}"
for h in "$host" "$(printf '%s' "$WS_URL" | sed -E 's#^[a-z]+://([^/:?]+).*#\1#' | tr 'A-Z' 'a-z')" "$(printf '%s' "${HOST_HEADER:-}" | tr 'A-Z' 'a-z')"; do
  [ -z "$h" ] && continue
  case ",$prod_hosts," in *",$h,"*) echo "REFUSING: $h is a production host" >&2; exit 5;; esac
done
case "$host" in
  localhost|127.0.0.1) [ "${ALLOW_LOCAL:-}" = 1 ] || { echo "REFUSING: localhost needs ALLOW_LOCAL=1" >&2; exit 5; };;
  *loadtest*) ;;
  *) echo "REFUSING: $host does not look like a load-test stack (name must contain 'loadtest')" >&2; exit 5;;
esac

total_s="$(python3 - "$root/profiles.json" "$PROFILE" <<'PY'
import json, sys
p = json.load(open(sys.argv[1]))["profiles"][sys.argv[2]]
u = {"s": 1, "m": 60, "h": 3600}
print(sum(int(d[:-1]) * u[d[-1]] for d, _ in p["stages"]))
PY
)"
limit_s="$(python3 -c "import json;print(json.load(open('$root/profiles.json'))['limits']['max_wall_minutes']*60)")"
# the workflow passes what is left of the 2 h cap
[ -n "${MAX_WALL_SECONDS:-}" ] && [ "$MAX_WALL_SECONDS" -lt "$limit_s" ] && limit_s="$MAX_WALL_SECONDS"
# k6 gets the profile length + 10 min of slack, never more than the hard cap
max_s=$(( total_s + 600 )); [ "$max_s" -gt "$limit_s" ] && max_s="$limit_s"

export PROFILE API_URL WS_URL TOKENS_FILE FIXTURES_FILE HOST_HEADER CDN_URL SHARD SHARDS ALLOW_LOCAL PROD_HOSTS
echo "[generator] profile=$PROFILE shard=${SHARD:-0}/${SHARDS:-1} target=$host max=${max_s}s out=$OUT"

MAX_SECONDS="$max_s" python3 "$here/guard.py" "$OUT" >"$OUT/guard.log" 2>&1 &
guard_pid=$!

TO="$(command -v timeout || command -v gtimeout || true)"
${TO:+$TO --foreground "$max_s"} k6 run \
  --address 127.0.0.1:6565 \
  --summary-export "$OUT/summary.json" \
  --no-color \
  ${EXTRA_K6_ARGS:-} \
  "$root/k6/main.js" 2>&1 | tee "$OUT/k6.log"
k6_rc=${PIPESTATUS[0]}

# give the guard one poll to notice the end, then make sure it is gone
sleep 6
kill "$guard_pid" 2>/dev/null; wait "$guard_pid" 2>/dev/null
guard_rc=0
# k6's own abort (thresholds with abortOnFail) counts as an abort too
if [ ! -f "$OUT/abort.json" ] && grep -q "stopping test prematurely" "$OUT/k6.log" 2>/dev/null; then
  printf '{"reason":"k6_threshold","detail":{"line":"%s"},"at":"%s"}\n' \
    "$(grep 'stopping test prematurely' "$OUT/k6.log" | head -1 | sed 's/"/\x27/g' | cut -c1-300)" "$(date -u +%FT%TZ)" >"$OUT/abort.json"
fi
aborted=false; [ -f "$OUT/abort.json" ] && { aborted=true; guard_rc=3; }
printf '{"profile":"%s","shard":%s,"shards":%s,"k6_exit":%s,"aborted":%s}\n' \
  "$PROFILE" "${SHARD:-0}" "${SHARDS:-1}" "$k6_rc" "$aborted" >"$OUT/result.json"

[ "$guard_rc" = 3 ] && { echo "[generator] ABORTED by the guard: $(cat "$OUT/abort.json")"; exit 3; }
[ "$k6_rc" = 0 ] && exit 0
[ "$k6_rc" = 99 ] && { echo "[generator] k6 thresholds failed (the run completed)"; exit 4; }
exit "$k6_rc"
