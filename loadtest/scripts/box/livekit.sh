#!/usr/bin/env bash
# ON a generator box: LiveKit's official load tester (`lk load-test`) against
# the stack's LiveKit box: ROOMS group rooms, each with PUBLISHERS video
# publishers (the app's group-call limit is 9) and as many subscribers, for
# SECONDS seconds. The generator talks to the plain signalling port 7880
# inside the VPC; media goes to the box's public address like a real phone.
#
#   env: RUN_ID ARTIFACTS_BUCKET LIVEKIT_PRIVATE_URL (ws://10.x.x.x:7880)
#        LIVEKIT_KEY_SECRET LIVEKIT_SECRET_SECRET ROOMS PUBLISHERS SECONDS_RUN [SHARD=0]
set -uo pipefail
source "$(dirname "$0")/common.sh"
: "${LIVEKIT_PRIVATE_URL:?}" "${LIVEKIT_KEY_SECRET:?}" "${LIVEKIT_SECRET_SECRET:?}" "${ROOMS:?}" "${PUBLISHERS:?}"
secs="${SECONDS_RUN:-60}"; shard="${SHARD:-0}"
key="$(secret "$LIVEKIT_KEY_SECRET")"; sec="$(secret "$LIVEKIT_SECRET_SECRET")"
out=/tmp/lk-$shard; rm -rf "$out"; mkdir -p "$out"

echo "[livekit] $ROOMS rooms x $PUBLISHERS publishers for ${secs}s -> $LIVEKIT_PRIVATE_URL"
pids=()
for r in $(seq 1 "$ROOMS"); do
  ( lk load-test --url "$LIVEKIT_PRIVATE_URL" --api-key "$key" --api-secret "$sec" \
      --room "lt-$RUN_ID-$shard-$r" --duration "${secs}s" \
      --video-publishers "$PUBLISHERS" --subscribers "$PUBLISHERS" --num-per-second 3 \
      >"$out/room-$r.log" 2>&1; echo $? >"$out/room-$r.rc" ) &
  pids+=($!)
done
for p in "${pids[@]}"; do wait "$p"; done
fail=0; for r in $(seq 1 "$ROOMS"); do [ "$(cat "$out/room-$r.rc" 2>/dev/null || echo 1)" = 0 ] || fail=$((fail + 1)); done

python3 - "$out" "$ROOMS" "$PUBLISHERS" "$fail" <<'PY'
import glob, json, re, sys
out, rooms, pubs, fail = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
txt = "\n".join(open(f, errors="replace").read() for f in sorted(glob.glob(out + "/room-*.log")))
def grab(rx):
    return [float(x) for x in re.findall(rx, txt, re.I)]
res = {
    "rooms": rooms, "publishers_per_room": pubs, "rooms_failed": fail,
    "errors_in_log": len(re.findall(r"\b(error|failed|timeout)\b", txt, re.I)),
    "loss_values_pct": grab(r"loss[^0-9]{0,12}([\d.]+)\s*%")[:20],
    "note": "lk load-test prints a summary table per room; raw logs are in the artifact (room-N.log)",
    "tail": txt.strip().splitlines()[-25:],
}
json.dump(res, open(out + "/livekit.json", "w"), indent=1)
print(json.dumps({k: v for k, v in res.items() if k != "tail"}))
PY
aws s3 cp "$out" "$S3/results/livekit-$shard/" --recursive --only-show-errors || true
[ "$fail" = 0 ]
