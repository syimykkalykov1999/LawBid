# docs/06 §8 — alerts (SNS → email + Slack webhook) and the log metric
# filters that turn the app's structured logs into CloudWatch metrics
# (queue depth from the `ops.metrics` job, journal integrity, Stripe
# webhook failures, SMS budget). Each alarm has a runbook in
# docs/runbooks/<alarm>.md (the alarm description names it).
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "name" { type = string }
variable "alert_emails" { type = list(string) }
variable "slack_webhook_url" {
  type      = string
  default   = null
  sensitive = true
}
variable "alb_arn_suffix" { type = string }
variable "api_target_group_arn_suffix" { type = string }
variable "cluster_name" { type = string }
variable "api_service_name" { type = string }
variable "worker_service_name" { type = string }
variable "redis_replication_group_id" { type = string }
variable "api_log_group" { type = string }
variable "worker_log_group" { type = string }
variable "p95_target_ms" {
  type    = number
  default = 600
}
variable "kms_key_arn" { type = string }
variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_sns_topic" "alerts" {
  name              = "${var.name}-alerts"
  kms_master_key_id = var.kms_key_arn
  tags              = var.tags
}

resource "aws_sns_topic_subscription" "email" {
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.key
}

resource "aws_sns_topic_subscription" "slack" {
  count     = var.slack_webhook_url == null ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "https"
  endpoint  = var.slack_webhook_url
}

locals {
  ns  = "LawBid/${var.name}"
  ops = [aws_sns_topic.alerts.arn]
}

# --- metrics from structured logs ----------------------------------------
resource "aws_cloudwatch_log_metric_filter" "queue_waiting" {
  name           = "${var.name}-queue-waiting"
  log_group_name = var.worker_log_group
  pattern        = "{ $.metric = \"queue_depth\" }"
  metric_transformation {
    name       = "QueueWaiting"
    namespace  = local.ns
    value      = "$.waiting"
    dimensions = { queue = "$.queue" }
    unit       = "Count"
  }
}

resource "aws_cloudwatch_log_metric_filter" "queue_oldest_age" {
  name           = "${var.name}-queue-oldest-age"
  log_group_name = var.worker_log_group
  pattern        = "{ $.metric = \"queue_depth\" }"
  metric_transformation {
    name       = "QueueOldestAgeSeconds"
    namespace  = local.ns
    value      = "$.oldestAgeSeconds"
    dimensions = { queue = "$.queue" }
    unit       = "Seconds"
  }
}

# Same value with no dimension, so one alarm sees every queue (an alarm on a
# dimensionless metric never matches the per-queue series above). The DLQ
# has no consumer — its jobs wait by design — so it is left out.
resource "aws_cloudwatch_log_metric_filter" "queue_oldest_age_all" {
  name           = "${var.name}-queue-oldest-age-all"
  log_group_name = var.worker_log_group
  pattern        = "{ $.metric = \"queue_depth\" && $.queue != \"stripe-webhooks-dlq\" }"
  metric_transformation {
    name      = "QueueOldestAgeSecondsAll"
    namespace = local.ns
    value     = "$.oldestAgeSeconds"
    unit      = "Seconds"
  }
}

resource "aws_cloudwatch_log_metric_filter" "journal_broken" {
  name           = "${var.name}-journal-broken"
  log_group_name = var.worker_log_group
  pattern        = "{ $.msg = \"case_journal hash chain broken\" }"
  metric_transformation {
    name      = "JournalChainBroken"
    namespace = local.ns
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_log_metric_filter" "tx_retries" {
  name           = "${var.name}-tx-retries"
  log_group_name = var.api_log_group
  pattern        = "{ $.msg = \"transaction retried\" }"
  metric_transformation {
    name      = "TxRetries"
    namespace = local.ns
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_log_metric_filter" "stripe_webhook_failed" {
  name           = "${var.name}-stripe-webhook-failed"
  log_group_name = var.worker_log_group
  pattern        = "{ $.msg = \"stripe webhook moved to DLQ\" }"
  metric_transformation {
    name      = "StripeWebhookFailed"
    namespace = local.ns
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_log_metric_filter" "payment_failed" {
  name           = "${var.name}-payment-failed"
  log_group_name = var.worker_log_group
  pattern        = "{ $.msg = \"subscription payment failed\" }"
  metric_transformation {
    name      = "PaymentFailed"
    namespace = local.ns
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_log_metric_filter" "sms_sent" {
  name           = "${var.name}-sms-sent"
  log_group_name = var.api_log_group
  pattern        = "{ $.msg = \"Twilio SMS OTP sent\" }"
  metric_transformation {
    name      = "SmsSent"
    namespace = local.ns
    value     = "1"
    unit      = "Count"
  }
}

# --- alarms (docs/06 §8 list) ----------------------------------------------
resource "aws_cloudwatch_metric_alarm" "alb_5xx_ratio" {
  alarm_name          = "${var.name}-api-5xx-ratio"
  alarm_description   = "5xx > 1% for 5 minutes. Runbook: docs/runbooks/api-5xx.md"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"
  metric_query {
    id          = "ratio"
    expression  = "IF(req > 0, 100 * err / req, 0)"
    label       = "5xx %"
    return_data = true
  }
  metric_query {
    id = "err"
    metric {
      metric_name = "HTTPCode_Target_5XX_Count"
      namespace   = "AWS/ApplicationELB"
      period      = 300
      stat        = "Sum"
      dimensions  = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.api_target_group_arn_suffix }
    }
  }
  metric_query {
    id = "req"
    metric {
      metric_name = "RequestCount"
      namespace   = "AWS/ApplicationELB"
      period      = 300
      stat        = "Sum"
      dimensions  = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.api_target_group_arn_suffix }
    }
  }
  alarm_actions = local.ops
  ok_actions    = local.ops
  tags          = var.tags
}

resource "aws_cloudwatch_metric_alarm" "api_p95" {
  alarm_name          = "${var.name}-api-p95"
  alarm_description   = "p95 above target for 10 minutes. Runbook: docs/runbooks/api-latency.md"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 300
  threshold           = var.p95_target_ms / 1000
  extended_statistic  = "p95"
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  dimensions          = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.api_target_group_arn_suffix }
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "unhealthy_hosts" {
  alarm_name          = "${var.name}-api-unhealthy-hosts"
  alarm_description   = "API tasks failing the ALB health check (/health/live). Runbook: docs/runbooks/api-unhealthy.md"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  period              = 60
  threshold           = 1
  statistic           = "Maximum"
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  dimensions          = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.api_target_group_arn_suffix }
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

# Missing data breaches: no queue_depth lines means the worker's ops.metrics
# job is not running, which is itself a backlog in the making.
resource "aws_cloudwatch_metric_alarm" "queue_backlog" {
  alarm_name          = "${var.name}-queue-backlog"
  alarm_description   = "Oldest waiting job older than 5 minutes, or the worker stopped reporting queue depth. Runbook: docs/runbooks/queues.md"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 300
  threshold           = 300
  statistic           = "Maximum"
  metric_name         = "QueueOldestAgeSecondsAll"
  namespace           = local.ns
  treat_missing_data  = "breaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "tx_retries" {
  alarm_name          = "${var.name}-tx-retries"
  alarm_description   = "Spike of 40001 transaction retries. Runbook: docs/runbooks/db-contention.md"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 300
  threshold           = 200
  statistic           = "Sum"
  metric_name         = "TxRetries"
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "stripe_webhooks" {
  alarm_name          = "${var.name}-stripe-webhooks"
  alarm_description   = "Stripe webhook events reached the DLQ. Runbook: docs/runbooks/stripe-webhooks.md"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 300
  threshold           = 1
  statistic           = "Sum"
  metric_name         = "StripeWebhookFailed"
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "payments_failed" {
  alarm_name          = "${var.name}-payments-failed"
  alarm_description   = "Spike of failed subscription payments. Runbook: docs/runbooks/payments-failed.md"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 3600
  threshold           = 20
  statistic           = "Sum"
  metric_name         = "PaymentFailed"
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "journal_integrity" {
  alarm_name          = "${var.name}-journal-integrity"
  alarm_description   = "CRITICAL: case_journal hash chain broken. Runbook: docs/runbooks/journal-integrity.md"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 300
  threshold           = 1
  statistic           = "Sum"
  metric_name         = "JournalChainBroken"
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "sms_spend" {
  alarm_name          = "${var.name}-sms-spend"
  alarm_description   = "SMS volume spike (cost). Runbook: docs/runbooks/sms-spend.md"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 3600
  threshold           = 2000
  statistic           = "Sum"
  metric_name         = "SmsSent"
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${var.name}-redis-cpu"
  alarm_description   = "Redis engine CPU > 80%. Runbook: docs/runbooks/redis.md"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 300
  threshold           = 80
  statistic           = "Average"
  metric_name         = "EngineCPUUtilization"
  namespace           = "AWS/ElastiCache"
  dimensions          = { ReplicationGroupId = var.redis_replication_group_id }
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${var.name}-redis-memory"
  alarm_description   = "Redis memory > 80%. Runbook: docs/runbooks/redis.md"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 300
  threshold           = 80
  statistic           = "Average"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  dimensions          = { ReplicationGroupId = var.redis_replication_group_id }
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "service_cpu" {
  for_each = {
    api    = var.api_service_name
    worker = var.worker_service_name
  }
  alarm_name          = "${var.name}-${each.key}-cpu"
  alarm_description   = "${each.key} CPU > 85% for 10 minutes (autoscaling ceiling?). Runbook: docs/runbooks/ecs-capacity.md"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 300
  threshold           = 85
  statistic           = "Average"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  dimensions          = { ClusterName = var.cluster_name, ServiceName = each.value }
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

# A service with zero running tasks (crash loop, failed deploy, capacity).
resource "aws_cloudwatch_metric_alarm" "service_running_tasks" {
  for_each = {
    api    = var.api_service_name
    worker = var.worker_service_name
  }
  alarm_name          = "${var.name}-${each.key}-no-running-tasks"
  alarm_description   = "${each.key} has no running ECS tasks. Runbook: docs/runbooks/ecs-capacity.md"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  period              = 60
  threshold           = 1
  statistic           = "Minimum"
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  dimensions          = { ClusterName = var.cluster_name, ServiceName = each.value }
  treat_missing_data  = "breaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

# Email reputation (SES production-access promise): AWS pauses sending
# above ~10 % bounces or ~0.5 % complaints, so warn well before that.
# Bounced and complained addresses are skipped by the SES account
# suppression list (modules/ses).
resource "aws_cloudwatch_metric_alarm" "ses_bounce_rate" {
  alarm_name          = "${var.name}-ses-bounce-rate"
  alarm_description   = "SES bounce rate > 4%. Check signup e-mails for typos or bots; sending pauses at ~10%."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 3600
  threshold           = 0.04
  treat_missing_data  = "notBreaching"
  statistic           = "Maximum"
  metric_name         = "Reputation.BounceRate"
  namespace           = "AWS/SES"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "ses_complaint_rate" {
  alarm_name          = "${var.name}-ses-complaint-rate"
  alarm_description   = "SES complaint rate > 0.1%. Someone marked our mail as spam; sending pauses at ~0.5%."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 3600
  threshold           = 0.001
  treat_missing_data  = "notBreaching"
  statistic           = "Maximum"
  metric_name         = "Reputation.ComplaintRate"
  namespace           = "AWS/SES"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

output "alerts_topic_arn" { value = aws_sns_topic.alerts.arn }
output "metrics_namespace" { value = local.ns }

# --- gauges for the dashboards (docs/06 §8 metrics list) ------------------
resource "aws_cloudwatch_log_metric_filter" "ws_connections" {
  name           = "${var.name}-ws-connections"
  log_group_name = var.api_log_group
  pattern        = "{ $.metric = \"ws_connections\" }"
  metric_transformation {
    name      = "WebSocketConnections"
    namespace = local.ns
    value     = "$.count"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_log_metric_filter" "business" {
  for_each = toset([
    "registrations24h",
    "casesOpen",
    "bidsActive",
    "subscriptionsActive",
    "subscriptionsTrialing",
    "subscriptionsPastDue",
  ])
  name           = "${var.name}-business-${each.key}"
  log_group_name = var.worker_log_group
  pattern        = "{ $.metric = \"business\" }"
  metric_transformation {
    name      = "Business${title(each.key)}"
    namespace = local.ns
    value     = "$.${each.key}"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_log_metric_filter" "push_failed" {
  name           = "${var.name}-push-failed"
  log_group_name = var.worker_log_group
  pattern        = "{ $.msg = \"push send failed\" }"
  metric_transformation {
    name      = "PushFailed"
    namespace = local.ns
    value     = "1"
    unit      = "Count"
  }
}

# docs/COST_PROTECTION.md / OQ-001c: CostGuard emits `alert: cost_budget`
# when a paid provider's budget window is exhausted (or nearly so), and
# `alert: cost_guard_unavailable` when it cannot reach Redis (paid calls
# are refused). Both the API and the worker make paid calls.
resource "aws_cloudwatch_log_metric_filter" "cost_budget" {
  for_each = {
    api    = var.api_log_group
    worker = var.worker_log_group
  }
  name           = each.key == "api" ? "${var.name}-cost-budget" : "${var.name}-cost-budget-${each.key}"
  log_group_name = each.value
  pattern        = "{ $.alert = \"cost_budget\" || $.alert = \"cost_guard_unavailable\" }"
  metric_transformation {
    name      = "CostBudgetAlerts"
    namespace = local.ns
    value     = "1"
    unit      = "Count"
  }
}

moved {
  from = aws_cloudwatch_log_metric_filter.cost_budget
  to   = aws_cloudwatch_log_metric_filter.cost_budget["api"]
}

resource "aws_cloudwatch_metric_alarm" "cost_budget" {
  alarm_name          = "${var.name}-cost-budget"
  alarm_description   = "A paid-provider budget (SMS/email/ID checks/storage/translate/video) is exhausted or nearly so, or the cost guard cannot reach Redis. Runbook: docs/runbooks/sms-spend.md"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 300
  threshold           = 1
  statistic           = "Sum"
  metric_name         = "CostBudgetAlerts"
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags
}

# Owner 2026-10-05 (storage like Telegram): the nightly storage.snapshot
# logs `alert: storage_growth` when files or the database grew more than
# storage.growth_alert_percent (admin Система → Хранилище) in a day.
resource "aws_cloudwatch_log_metric_filter" "storage_growth" {
  name           = "${var.name}-storage-growth"
  log_group_name = var.worker_log_group
  pattern        = "{ $.alert = \"storage_growth\" }"
  metric_transformation {
    name      = "StorageGrowthAlerts"
    namespace = local.ns
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "storage_growth" {
  alarm_name          = "${var.name}-storage-growth"
  alarm_description   = "Files or the database grew faster than storage.growth_alert_percent in a day. Check admin Система → Хранилище (top users, biggest tables)."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 3600
  threshold           = 1
  statistic           = "Sum"
  metric_name         = "StorageGrowthAlerts"
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags
}
