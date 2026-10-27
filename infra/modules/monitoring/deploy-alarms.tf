# Deploy safety audit 2026-10-27 (finding 8): two failures that had no alarm.
#   1. A scheduled (cron) job that keeps failing: queue-failed-critical does
#      not cover the cron lines and queue-failed-many needs 10 failures in
#      5 minutes.
#   2. A migrate task (prisma migrate deploy before a release) that stopped
#      with an error: only a GitHub issue told about it.
# Both mail the normal alerts topic (local.ops), not the phone. Runbook:
# docs/runbooks/TF_CATCHUP.md.

# --- 1. a cron job that keeps failing ---------------------------------------
# apps/api/src/jobs/jobs.runner.ts logs `cron job failed` on every failed
# attempt (3 attempts for hourly and slower schedules, 1 for faster ones), so
# one unlucky run is up to 3 lines in the SAME hour. Two different hours with
# at least one line out of the last three = the job failed again after a
# retry hour: a real problem, not bad luck.
resource "aws_cloudwatch_log_metric_filter" "cron_job_failed" {
  name           = "${var.name}-cron-job-failed"
  log_group_name = var.worker_log_group
  pattern        = "{ $.msg = \"cron job failed\" }"
  metric_transformation {
    name      = "CronJobFailed"
    namespace = local.ns
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "cron_job_failing" {
  alarm_name          = "${var.name}-cron-job-failing"
  alarm_description   = "LawBid: Регулярная фоновая задача (по расписанию) падает несколько часов подряд. Что делать: админка → Здоровье системы → «Повторить упавшие задачи»; не помогло за час — напишите Claude, какая задача (имя в журнале воркера: «cron job failed»). Инструкция: ${var.runbook_base_url}/queues.md (EN: cron job failures in at least 2 of the last 3 hours.)"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  period              = 3600
  threshold           = 1
  statistic           = "Sum"
  metric_name         = aws_cloudwatch_log_metric_filter.cron_job_failed.metric_transformation[0].name
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

# --- 2. a migrate task that stopped with an error ---------------------------
# scripts/deploy/run-migrations.sh starts `<name>-migrate` with run-task; its
# group is `family:<name>-migrate`. Fires for a non-zero exit code of any
# container, and for a task that never started (image pull, secret, quota).
resource "aws_cloudwatch_event_rule" "migrate_failed" {
  name        = "${var.name}-migrate-failed"
  description = "ECS: the migrate task stopped with an error"
  event_pattern = jsonencode({
    source        = ["aws.ecs"]
    "detail-type" = ["ECS Task State Change"]
    "$or" = [
      {
        detail = {
          clusterArn = ["arn:aws:ecs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:cluster/${var.cluster_name}"]
          group      = ["family:${var.name}-migrate"]
          lastStatus = ["STOPPED"]
          containers = { exitCode = [{ "anything-but" = 0 }] }
        }
      },
      {
        detail = {
          clusterArn = ["arn:aws:ecs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:cluster/${var.cluster_name}"]
          group      = ["family:${var.name}-migrate"]
          lastStatus = ["STOPPED"]
          stopCode   = ["TaskFailedToStart"]
        }
      },
    ]
  })
  tags = var.tags
}

resource "aws_cloudwatch_event_target" "migrate_failed" {
  rule      = aws_cloudwatch_event_rule.migrate_failed.name
  target_id = "alerts"
  arn       = aws_sns_topic.alerts.arn
  input_transformer {
    input_paths = { reason = "$.detail.stoppedReason" }
    # Plain Russian for the owner, like every other alarm.
    input_template = "\"LawBid: обновление базы данных перед выкладкой не прошло (задача migrate остановилась с ошибкой: <reason>). Что делать: новая версия НЕ запущена, сайт работает на прежней; ничего не нажимайте и напишите Claude. Инструкция: ${var.runbook_base_url}/migrate-resolve.md\""
  }
}
