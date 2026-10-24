#!/usr/bin/env bash
# The admin API accepts a token only while Redis holds adm:sess:<jti> (the
# admin session; apps/api admin-session.service.ts). mint.mjs wrote the jti
# list; this creates the keys (8 h; every request extends the 30 min idle).
#   REDIS_CLI='redis-cli -n 7' seed-admin-sessions.sh tokens.json.admin-sessions.txt
#   (AWS: REDIS_CLI='redis6-cli --tls -u rediss://:<password>@<host>:6379')
set -euo pipefail
file="${1:?usage: seed-admin-sessions.sh <admin-sessions.txt>}"
cli="${REDIS_CLI:?REDIS_CLI is required}"
n=0
while read -r jti uid; do
  [ -z "$jti" ] && continue
  $cli SET "adm:sess:$jti" "$uid" EX 28800 >/dev/null
  n=$((n + 1))
done <"$file"
echo "admin sessions created: $n"
