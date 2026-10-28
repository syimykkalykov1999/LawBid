#!/usr/bin/env bash
# Test accounts + ids for the k6 runs against the local stack (seeded DB).
#   prepare.sh <outdir> [clients=6000] [attorneys=1500] [admins=10]
set -euo pipefail
out="$1"; nc="${2:-6000}"; na="${3:-1500}"; nadm="${4:-10}"
here="$(cd "$(dirname "$0")" && pwd)"; repo="${REPO:-$(cd "$here/../.." && pwd)}"; stack="$here"
envf="${API_ENV:-$stack/api.env}"
mkdir -p "$out"
keys="$(grep '^JWT_KEYS=' "$envf" | cut -d= -f2-)"
export JWT_SECRET="${keys#*:}" JWT_KID="${keys%%:*}"
node "$repo/loadtest/scripts/mint.mjs" "$out/tokens.json" "$nc" "$na" "$nadm"
REDIS_CLI="docker exec -i lawbid-lt-redis-1 redis-cli -n 0" "$repo/loadtest/scripts/seed-admin-sessions.sh" "$out/tokens.json.admin-sessions.txt"
API_URL="http://127.0.0.1:3055/api/v1" node "$repo/loadtest/scripts/discover.mjs" "$out/fixtures.json" 1500 0
python3 -c "import json,sys;t=json.load(open('$out/tokens.json'));f=json.load(open('$out/fixtures.json'));print({k:len(v) for k,v in t.items() if isinstance(v,list)},{k:len(v) for k,v in f.items() if isinstance(v,list)})"
