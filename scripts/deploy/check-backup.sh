#!/usr/bin/env sh
# docs/06 §6.4 "перед каждой продовой миграцией схемы проверяется, что
# свежий бэкап создан": CockroachDB Cloud managed backups — the latest
# full backup must be younger than 26 hours. Skips with a warning when the
# Cloud API key is not configured (staging).
set -eu
if [ -z "${COCKROACH_API_KEY:-}" ] || [ -z "${COCKROACH_CLUSTER_ID:-}" ]; then
  echo "::warning::COCKROACH_CLOUD_API_KEY not set — backup freshness not verified"
  exit 0
fi
LATEST=$(curl -fsS -H "Authorization: Bearer $COCKROACH_API_KEY" \
  "https://cockroachlabs.cloud/api/v1/clusters/${COCKROACH_CLUSTER_ID}/backups?type=FULL" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const b=JSON.parse(d).backups||[];const t=b.map(x=>Date.parse(x.completed_at||x.created_at)).filter(Boolean).sort((a,b)=>b-a)[0];console.log(t||0)})')
AGE_H=$(( ( $(date +%s) * 1000 - LATEST ) / 3600000 ))
echo "latest full backup: ${AGE_H}h ago"
[ "$LATEST" != "0" ] && [ "$AGE_H" -le 26 ]
