#!/usr/bin/env bash
# ON generator box 0 (inside the VPC, with the tasks security group, so it
# reaches the private database and Redis): loads the load-test data into the
# stack's database (the same seed files the local run uses), then creates the
# admin sessions in Redis.
#   env: RUN_ID ARTIFACTS_BUCKET DB_SECRET_ARN REDIS_SECRET_ARN
set -euo pipefail
source "$(dirname "$0")/common.sh"
: "${DB_SECRET_ARN:?}" "${REDIS_SECRET_ARN:?}"
repo="$LT/loadtest/.."

j="$(secret "$DB_SECRET_ARN")"
export PGPASSWORD="$(jq -r .password <<<"$j")"
PSQL=(psql "host=$(jq -r .host <<<"$j") port=5432 dbname=$(jq -r .dbname <<<"$j") user=$(jq -r .username <<<"$j") sslmode=require" -v ON_ERROR_STOP=1 -q)

echo "== database reachable?"
"${PSQL[@]}" -tAc "select version()" | head -1
if [ "$("${PSQL[@]}" -tAc "select count(*) from users")" -gt 1000 ]; then
  echo "== users already seeded, skipping the seed files"
else
  for f in scripts/ops/admin-load-gen.sql scripts/ops/user-load-gen.sql loadtest/sql/loadtest-extra.sql; do
    echo "== $f"; "${PSQL[@]}" -f "$LT/$f" >/dev/null
  done
fi
"${PSQL[@]}" -tAc "select 'users', count(*) from users union all select 'messages', count(*) from messages union all select 'posts', count(*) from posts"

echo "== admin sessions in Redis"
aws s3 cp "$S3/tokens.json.admin-sessions.txt" /tmp/admin-sessions.txt --only-show-errors
url="$(secret "$REDIS_SECRET_ARN")"            # rediss://:<password>@<host>:6379
pw="${url#rediss://:}"; pw="${pw%%@*}"; host="${url##*@}"; host="${host%%:*}"
REDISCLI_AUTH="$pw" REDIS_CLI="redis6-cli --tls -h $host -p 6379" "$LT/loadtest/scripts/seed-admin-sessions.sh" /tmp/admin-sessions.txt
