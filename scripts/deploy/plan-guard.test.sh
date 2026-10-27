#!/usr/bin/env bash
# Unit test for the two plan gates, on small `terraform show -json` fixtures
# (no AWS, no terraform needed; jq only):
#   * scripts/deploy/plan-guard.sh  - data-bearing resources never deleted/replaced
#   * scripts/dev/tf-catchup.sh summarize - the owner's red STOP / green rule
# Run: bash scripts/deploy/plan-guard.test.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
GUARD="$ROOT/scripts/deploy/plan-guard.sh"
CATCHUP="$ROOT/scripts/dev/tf-catchup.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAILS=0

# plan <name> <json lines of resource_changes>  -> writes $TMP/<name>.json
plan() {
  local name="$1"; shift
  printf '{"format_version":"1.2","resource_changes":[%s]}\n' "$*" > "$TMP/$name.json"
}
rc() { # rc <address> <type> <actions as JSON array>
  printf '{"address":"%s","type":"%s","change":{"actions":%s}}' "$1" "$2" "$3"
}
expect() { # expect <0|1> <label> <command...>
  local want="$1" label="$2"; shift 2
  local got=0
  "$@" >/dev/null 2>&1 || got=$?
  if [ "$got" = "$want" ]; then
    echo "ok   - $label"
  else
    echo "FAIL - $label (exit $got, wanted $want)"
    FAILS=$((FAILS + 1))
  fi
}

DEL='["delete"]'; REPL='["delete","create"]'; CREATE='["create"]'; UPD='["update"]'

plan alarms "$(rc 'module.stack.module.growth.aws_cloudwatch_metric_alarm.db_cpu[0]' aws_cloudwatch_metric_alarm "$DEL"),$(rc 'module.m.aws_cloudwatch_composite_alarm.x' aws_cloudwatch_composite_alarm "$REPL"),$(rc 'module.m.aws_cloudwatch_metric_alarm.y[0]' aws_cloudwatch_metric_alarm "$CREATE")"
plan taskdef "$(rc 'module.stack.module.ecs.aws_ecs_task_definition.api' aws_ecs_task_definition "$REPL"),$(rc 'module.stack.module.ecs.aws_ecs_service.api' aws_ecs_service "$UPD")"
plan loggroup "$(rc 'module.stack.module.postgres[0].aws_cloudwatch_log_group.rds' aws_cloudwatch_log_group "$REPL")"
plan guardduty "$(rc 'module.stack.module.security_baseline[0].aws_guardduty_detector_feature.rds_login' aws_guardduty_detector_feature "$REPL")"
plan db "$(rc 'module.stack.module.postgres[0].aws_db_instance.this' aws_db_instance "$REPL")"
plan secret "$(rc 'module.stack.aws_secretsmanager_secret.keys' aws_secretsmanager_secret "$DEL")"
plan kms "$(rc 'module.stack.module.kms.aws_kms_key.this' aws_kms_key "$REPL")"
plan redis "$(rc 'module.stack.module.redis.aws_elasticache_replication_group.this' aws_elasticache_replication_group "$REPL")"
plan bucket "$(rc 'module.stack.module.s3.aws_s3_bucket.media' aws_s3_bucket "$DEL")"
plan service "$(rc 'module.stack.module.ecs.aws_ecs_service.worker' aws_ecs_service "$DEL")"
plan green "$(rc 'module.m.aws_cloudwatch_metric_alarm.a' aws_cloudwatch_metric_alarm "$CREATE"),$(rc 'module.m.aws_iam_role_policy.p' aws_iam_role_policy "$UPD"),$(rc 'module.m.aws_cloudwatch_log_metric_filter.f' aws_cloudwatch_log_metric_filter "$CREATE")"

echo "# plan-guard.sh (data-bearing resources)"
expect 0 "alarm delete/replace passes the guard"        sh "$GUARD" "$TMP/alarms.json"
expect 0 "task definition new revision passes"          sh "$GUARD" "$TMP/taskdef.json"
expect 0 "log group replace is not the guard's job"     sh "$GUARD" "$TMP/loggroup.json"
expect 0 "only creates/updates passes"                  sh "$GUARD" "$TMP/green.json"
expect 1 "database replace is refused"                  sh "$GUARD" "$TMP/db.json"
expect 1 "secret delete is refused"                     sh "$GUARD" "$TMP/secret.json"
expect 1 "KMS key replace is refused"                   sh "$GUARD" "$TMP/kms.json"
expect 1 "Redis replace is refused"                     sh "$GUARD" "$TMP/redis.json"
expect 1 "S3 bucket delete is refused"                  sh "$GUARD" "$TMP/bucket.json"

echo "# tf-catchup.sh summarize (owner's STOP rule)"
expect 0 "alarm delete/replace is green"                bash "$CATCHUP" summarize "$TMP/alarms.json"
expect 0 "task definition new revision is green"        bash "$CATCHUP" summarize "$TMP/taskdef.json"
expect 0 "only creates/updates is green"                bash "$CATCHUP" summarize "$TMP/green.json"
expect 1 "RDS log group replace is STOP"                bash "$CATCHUP" summarize "$TMP/loggroup.json"
expect 1 "GuardDuty feature replace is STOP"            bash "$CATCHUP" summarize "$TMP/guardduty.json"
expect 1 "database replace is STOP"                     bash "$CATCHUP" summarize "$TMP/db.json"
expect 1 "ECS service delete is STOP"                   bash "$CATCHUP" summarize "$TMP/service.json"
expect 1 "secret delete is STOP"                        bash "$CATCHUP" summarize "$TMP/secret.json"

# The green message must be the exact phrase the runbook tells the owner to look for.
if bash "$CATCHUP" summarize "$TMP/alarms.json" 2>/dev/null | grep -q 'Опасных удалений и замен нет'; then
  echo "ok   - green phrase printed for the alarm-only plan"
else
  echo "FAIL - green phrase missing for the alarm-only plan"; FAILS=$((FAILS + 1))
fi

if [ "$FAILS" -gt 0 ]; then echo "plan-guard.test: $FAILS failure(s)"; exit 1; fi
echo "plan-guard.test: all passed"
