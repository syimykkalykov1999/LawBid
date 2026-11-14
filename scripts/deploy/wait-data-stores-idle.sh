#!/usr/bin/env sh
# D1-40 (detective round 1, 13.11): the autoscalers never start a resize
# during a deploy (DEPLOY_QUIET_SEC), but a deploy could start while a resize
# was already running: migrations and the roll then ran against a database or
# Redis that was 'modifying' (half-applied migrations, smoke 500 as in
# KNOWN_ERRORS run 43393586005). This waits, before the migrations, until
# every database server and Redis group is `available` with nothing pending,
# and fails clearly when that does not happen in time.
#
#   wait-data-stores-idle.sh <prefix>          e.g. lawbid-prod
#   DATA_STORES_WAIT_SECONDS  total wait (default 1800); 0 = check once
#   DATA_STORES_POLL_SECONDS  poll interval (default 30)
#   DATA_STORES_STRICT=true   also fail when AWS refuses the read (default:
#                             warn, so a missing IAM permission before the
#                             bootstrap apply does not stop a release)
#   DB_INSTANCE_IDS / REDIS_GROUP_IDS  override the lists (space-separated)
#   DATA_STORES_FAKE_DIR      offline test: <id>.json files instead of AWS
set -eu
P="${1:?prefix, e.g. lawbid-prod}"
WAIT="${DATA_STORES_WAIT_SECONDS:-1800}"
POLL="${DATA_STORES_POLL_SECONDS:-30}"
DBS="${DB_INSTANCE_IDS:-$P-postgres $P-db1-postgres $P-db2-postgres $P-db3-postgres}"
RGS="${REDIS_GROUP_IDS:-$P-redis $P-cache-redis}"
ERR="${TMPDIR:-/tmp}/data-stores.$$.err"
trap 'rm -f "$ERR"' EXIT

# Prints "<status> <pending>" (pending = 0 or 1), "missing" or "error <text>".
describe() { # kind id
  if [ -n "${DATA_STORES_FAKE_DIR:-}" ]; then
    if [ -f "$DATA_STORES_FAKE_DIR/$2.json" ]; then cat "$DATA_STORES_FAKE_DIR/$2.json"; else echo missing; fi
    return 0
  fi
  if [ "$1" = db ]; then
    OUT=$(aws rds describe-db-instances --db-instance-identifier "$2" \
      --query 'DBInstances[0].[DBInstanceStatus, length(keys(PendingModifiedValues || `{}`))]' --output text 2>"$ERR") || OUT=""
  else
    OUT=$(aws elasticache describe-replication-groups --replication-group-id "$2" \
      --query 'ReplicationGroups[0].[Status, length(keys(PendingModifiedValues || `{}`))]' --output text 2>"$ERR") || OUT=""
  fi
  if [ -n "$OUT" ]; then
    S=$(printf '%s' "$OUT" | cut -f1); N=$(printf '%s' "$OUT" | cut -f2)
    if [ "${N:-0}" -gt 0 ] 2>/dev/null; then echo "$S 1"; else echo "$S 0"; fi
    return 0
  fi
  if grep -Eq 'NotFound' "$ERR"; then echo missing; else echo "error $(tr '\n' ' ' <"$ERR" | cut -c1-160)"; fi
}

start=$(date +%s)
while :; do
  busy=""
  for pair in $(for d in $DBS; do echo "db:$d"; done; for r in $RGS; do echo "redis:$r"; done); do
    K="${pair%%:*}"; ID="${pair#*:}"
    R=$(describe "$K" "$ID")
    case "$R" in
      missing) ;;
      "error "*)
        if [ "${DATA_STORES_STRICT:-false}" = "true" ]; then echo "::error::$ID: ${R#error }"; exit 1; fi
        echo "::warning::$ID: could not read its state (${R#error }); not waited for" ;;
      "available 0") ;;
      *) busy="$busy $ID($R)" ;;
    esac
  done
  if [ -z "$busy" ]; then echo "data stores idle: no resize in progress"; exit 0; fi
  if [ $(( $(date +%s) - start )) -ge "$WAIT" ]; then
    echo "::error::a database / Redis resize is still in progress after ${WAIT}s:$busy. Deploy later (or wait for the autoscaler to finish)."
    exit 1
  fi
  echo "waiting for a resize to finish:$busy"
  sleep "$POLL"
done
