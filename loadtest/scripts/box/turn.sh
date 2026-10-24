#!/usr/bin/env bash
# ON a generator box: TURN relay test with coturn's own test client
# (turnutils_uclient, from the official coturn image, same version family as
# the server). N clients each open a relayed allocation and exchange
# media-like packets (160 bytes every 20 ms = G.711 audio, 50 packets/s)
# through the relay, client to client (-y), for SECONDS seconds.
# Measured by the tool: lost packets, round-trip delay, jitter; we add
# allocation success. The TURN boxes' CPU / network come from CloudWatch.
#
#   env: RUN_ID ARTIFACTS_BUCKET TURN_HOST TURN_SECRET_PARAM CLIENTS SECONDS
#        [SHARD=0] [TRANSPORT=udp|tcp] [COTURN_IMAGE=coturn/coturn:4.6.3]
set -uo pipefail
source "$(dirname "$0")/common.sh"
: "${TURN_HOST:?}" "${TURN_SECRET_PARAM:?}" "${CLIENTS:?}" "${SECONDS_TO_RUN:=${SECONDS_RUN:-60}}"
IMAGE="${COTURN_IMAGE:-coturn/coturn:4.6.3}"
shard="${SHARD:-0}"
secret="$(aws ssm get-parameter --with-decryption --name "$TURN_SECRET_PARAM" --query Parameter.Value --output text)"
user="$(( $(date +%s) + 7200 )):loadtest"                       # coturn "TURN REST API" credentials
pass="$(printf '%s' "$user" | openssl dgst -sha1 -hmac "$secret" -binary | base64)"
messages=$(( SECONDS_TO_RUN * 50 ))
out=/tmp/turn-$shard; rm -rf "$out"; mkdir -p "$out"
tflag=""; [ "${TRANSPORT:-udp}" = tcp ] && tflag="-t"

echo "[turn] $CLIENTS clients, $messages packets each (~${SECONDS_TO_RUN}s) -> $TURN_HOST"
docker run --rm --network host "$IMAGE" turnutils_uclient $tflag -y -m "$CLIENTS" -n "$messages" -l 160 -z 20 \
  -u "$user" -w "$pass" "$TURN_HOST" >"$out/uclient.log" 2>&1
rc=$?

python3 - "$out" "$CLIENTS" "$rc" "$shard" <<'PY'
import json, re, sys
out, clients, rc, shard = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
txt = open(out + "/uclient.log", errors="replace").read()
def nums(rx):
    return [float(x) for x in re.findall(rx, txt)]
sent = nums(r"tot_send_msgs=(\d+)")
recv = nums(r"tot_recv_msgs=(\d+)")
lost = nums(r"Total lost packets (\d+)")
lostpct = re.findall(r"Total lost packets \d+ \(([\d.]+)%\)", txt)
rtt = nums(r"Average round trip delay ([\d.]+) ms")
jit = nums(r"Average jitter ([\d.]+) ms")
alloc_err = len(re.findall(r"(Cannot complete Allocation|allocation.*(error|fail)|ERROR: )", txt, re.I))
ok = sum(1 for r in recv if r > 0)
res = {
    "shard": shard, "clients_requested": clients, "uclient_exit": rc,
    "clients_reporting": len(recv), "clients_with_traffic": ok,
    "allocation_success_rate": round(ok / clients, 4) if clients else None,
    "allocation_errors_in_log": alloc_err,
    "packets_sent": sum(sent) if sent else None, "packets_received": sum(recv) if recv else None,
    "lost_packets_pct": float(lostpct[-1]) if lostpct else None,
    "avg_rtt_ms": round(sum(rtt) / len(rtt), 2) if rtt else None,
    "avg_jitter_ms": round(sum(jit) / len(jit), 2) if jit else None,
    "parsed_from": "turnutils_uclient output; raw log is in the artifact (uclient.log)",
}
json.dump(res, open(out + "/turn.json", "w"), indent=1)
print(json.dumps(res))
PY
aws s3 cp "$out" "$S3/results/turn-$shard/" --recursive --only-show-errors || true
[ "$rc" = 0 ]
