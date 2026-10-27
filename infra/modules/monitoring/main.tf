# docs/06 §8 — alerts (SNS → email + Slack webhook) and the log metric
# filters that turn the app's structured logs into CloudWatch metrics
# (queue depth from the `ops.metrics` job, journal integrity, Stripe
# webhook failures, SMS budget). Each alarm has a runbook in
# docs/runbooks/<alarm>.md (the alarm description names it).
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
    # Owner 2026-10-22: zips the uptime canary script (slo.tf).
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }
}

variable "name" { type = string }
variable "alert_emails" { type = list(string) }
variable "slack_webhook_url" {
  type      = string
  default   = null
  sensitive = true
}
# Batch A item 1 (docs/architecture/P0_AND_COST_PLAN.md): a phone page for the
# CRITICAL composite alarms only. PagerDuty Free: 100 phone/SMS per month, so
# only the 6 SLO composites (slo.tf) publish to the second topic.
variable "pagerduty_https_endpoint" {
  type        = string
  default     = null
  sensitive   = true
  description = "PagerDuty Events API v2 integration URL (https://events.pagerduty.com/integration/<key>/enqueue). Kept in the Secrets Manager tfvars, never in git. null = no phone paging; the critical topic still exists and e-mails the owner."
}
variable "critical_email_too" {
  type        = bool
  default     = true
  description = "Also e-mail alert_emails from the critical topic (a second copy of the page); false when the normal topic mail is enough."
}
variable "redis_memory_alarm_percent" {
  type        = number
  default     = 70
  description = "Redis (queue node) memory alarm threshold in percent (Batch A item 9). 70 leaves room to act before noeviction starts failing BullMQ writes."
}
variable "nat_gateway_ids" {
  type        = list(string)
  default     = []
  description = "NAT gateways to watch (AWS/NATGateway). Empty = no NAT traffic alarm."
}
variable "nat_traffic_alarm_gb_per_day" {
  type        = number
  default     = 20
  description = "Alarm when one NAT gateway processes more than this many GB (in + out) in 24 h; 0 = off. At $0.045/GB that is about $0.9/day (S4-13: was 100 GB = $4.5/day = $135/month before any alarm). See docs/runbooks/nat-endpoints.md."
}
variable "ses_send_alarm_per_day" {
  type        = number
  default     = 4000
  description = "S9-13: alarm when SES sends more than this many e-mails in 24 h (the app's own cap is 2 000 a day, BUDGET_EMAIL_DAILY_MAX, so 2x = something bypasses it or the cap was raised); 0 = off."
}
variable "media_bucket_name" {
  type        = string
  default     = ""
  description = "Media bucket whose daily growth is watched (it equals the volume replicated to the other Region, replicate_media). Empty = no alarm."
}
variable "media_replication_max_gb_per_day" {
  type        = number
  default     = 50
  description = "Review R-54: alarm when the media bucket grows by more than this many GB in a day, i.e. when the replica Region copy (storage + $0.02/GB transfer) would too. 0 = no alarm. S3 itself has no byte cap on replication: on the alarm, set replicate_media = false (docs/runbooks/cost.md)."
}
variable "alb_arn_suffix" { type = string }

# --- spend alarms on pay-per-use edge services (cost registry, V2 / V6) ------
variable "waf_alb_acl_name" {
  type        = string
  default     = ""
  description = "Name of the ALB web ACL (modules/alb output waf_acl_name); empty = no request-count alarm for it."
}
variable "waf_alb_requests_per_day" {
  type        = number
  default     = 3000000
  description = "Alarm when the ALB web ACL inspects more than this many requests in 24 h (AWS WAF bills $0.60 per million, so 3 M = $1.80/day); 0 = off."
}
variable "waf_cdn_acl_name" {
  type        = string
  default     = ""
  description = "Name of the CloudFront web ACL (modules/cdn-waf output web_acl_name); empty = no alarm."
}
variable "waf_cdn_requests_per_day" {
  type        = number
  default     = 10000000
  description = "Alarm when the CloudFront web ACL inspects more than this many requests in 24 h ($0.60 per million, so 10 M = $6/day); 0 = off."
}
variable "cloudfront_distribution_ids" {
  type        = map(string)
  default     = {}
  description = "CloudFront distributions to watch, label => distribution id (web, media, documents)."
}
variable "cloudfront_gb_per_day_alarm" {
  type        = number
  default     = 60
  description = "Alarm when one distribution serves more than this many GB in 24 h. The free tier is 1 TB/month (about 33 GB/day); after it CloudFront bills about $0.085/GB. 0 = off. Hard cap option: modules/cdn-waf rate rule or signed URLs (docs/runbooks/COST_LADDER.md)."
}
variable "api_target_group_arn_suffix" { type = string }
variable "cluster_name" { type = string }
variable "api_service_name" { type = string }
variable "worker_service_name" { type = string }
variable "redis_replication_group_id" { type = string }
variable "redis_replicas" {
  type        = number
  default     = 0
  description = "Replicas of the main Redis (modules/redis). > 0 adds a replication-lag alarm per replica."
}
variable "redis_node_type" {
  type        = string
  default     = ""
  description = "Node type of the main Redis (modules/redis). cache.t4g.* adds the CPU-credit alarm (burstable nodes throttle silently when credits run out)."
}
variable "redis_cache_replication_group_id" {
  type        = string
  default     = ""
  description = "Replication group id of the cache-only Redis (modules/redis name + \"-redis\"). Empty = no cache node: the Evictions alarm is not created."
}
variable "redis_connections_alarm" {
  type        = number
  default     = 10000
  description = "CurrConnections alarm on the main Redis node (ElastiCache allows 65000; 10000 leaves room before a reconnect storm hurts)."
}
variable "redis_new_connections_alarm" {
  type        = number
  default     = 2000
  description = "NewConnections per minute above this = a reconnect storm (failover, deploy, leaking connections)."
}
variable "api_log_group" { type = string }
variable "worker_log_group" { type = string }
variable "runbook_base_url" {
  type    = string
  default = "https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks"
}
variable "p95_target_ms" {
  type    = number
  default = 600
}
variable "search_p95_alarm_ms" {
  type        = number
  default     = 300
  description = "p95 of the Postgres search (log metric search_latency) above this for 15 minutes = «пора включить отдельный поиск». 0 = no alarm."
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

data "aws_caller_identity" "current" {}

# The account keeps full control; CloudWatch alarms and EventBridge rules
# (backup-job failures, modules/backup) of this account may publish.
resource "aws_sns_topic_policy" "alerts" {
  arn = aws_sns_topic.alerts.arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "Owner"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = ["SNS:Publish", "SNS:Subscribe", "SNS:Receive", "SNS:ListSubscriptionsByTopic", "SNS:GetTopicAttributes", "SNS:SetTopicAttributes", "SNS:AddPermission", "SNS:RemovePermission", "SNS:DeleteTopic"]
        Resource  = aws_sns_topic.alerts.arn
      },
      {
        Sid       = "AlarmAndEventPublishers"
        Effect    = "Allow"
        Principal = { Service = ["cloudwatch.amazonaws.com", "events.amazonaws.com", "budgets.amazonaws.com"] }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.alerts.arn
        Condition = {
          StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
        }
      },
      {
        # Cost Anomaly Detection (modules/budget, IMMEDIATE subscription).
        Sid       = "CostAnomalyPublisher"
        Effect    = "Allow"
        Principal = { Service = "costalerts.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.alerts.arn
      },
    ]
  })
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

# --- critical topic: the only one that can ring a phone -----------------
resource "aws_sns_topic" "critical" {
  name              = "${var.name}-critical"
  kms_master_key_id = var.kms_key_arn
  tags              = var.tags
}

resource "aws_sns_topic_policy" "critical" {
  arn = aws_sns_topic.critical.arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "Owner"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = ["SNS:Publish", "SNS:Subscribe", "SNS:Receive", "SNS:ListSubscriptionsByTopic", "SNS:GetTopicAttributes", "SNS:SetTopicAttributes", "SNS:AddPermission", "SNS:RemovePermission", "SNS:DeleteTopic"]
        Resource  = aws_sns_topic.critical.arn
      },
      {
        Sid       = "AlarmPublishers"
        Effect    = "Allow"
        Principal = { Service = ["cloudwatch.amazonaws.com", "events.amazonaws.com", "budgets.amazonaws.com"] }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.critical.arn
        Condition = {
          StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
        }
      },
    ]
  })
}

# Owner 2026-10-24: the owner can also paste the PagerDuty link in the admin
# (Ключи и сервисы -> PagerDuty); the API then subscribes it itself. That
# subscription is NOT in this state, so Terraform never touches it. Use ONE
# path: either this variable or the admin. (If both name the same link SNS
# returns the same subscription and removing it in one place removes it for
# both.) The admin path needs no apply and no secret in the tfvars.
# PagerDuty: HTTPS subscription to the Events API integration. PagerDuty
# confirms the subscription by itself (it opens the SubscribeURL); the
# message stays the CloudWatch JSON (raw_message_delivery must be false).
resource "aws_sns_topic_subscription" "pagerduty" {
  count                  = var.pagerduty_https_endpoint == null ? 0 : 1
  topic_arn              = aws_sns_topic.critical.arn
  protocol               = "https"
  endpoint               = var.pagerduty_https_endpoint
  raw_message_delivery   = false
  endpoint_auto_confirms = true
}

resource "aws_sns_topic_subscription" "critical_email" {
  for_each  = var.critical_email_too ? toset(var.alert_emails) : toset([])
  topic_arn = aws_sns_topic.critical.arn
  protocol  = "email"
  endpoint  = each.key
}

locals {
  ns  = "LawBid/${var.name}"
  ops = [aws_sns_topic.alerts.arn]
  # Normal mail stream + the page. Only the SLO composites use it.
  page = [aws_sns_topic.alerts.arn, aws_sns_topic.critical.arn]
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

# Owner 2026-10-22: the worker scales on queue depth (modules/ecs,
# `worker_queue`). One line per minute carries the total of waiting jobs
# over all consumed queues (the DLQ is left out), so the metric needs no
# dimension and needs no math over many series.
resource "aws_cloudwatch_log_metric_filter" "queue_waiting_total" {
  name           = "${var.name}-queue-waiting-total"
  log_group_name = var.worker_log_group
  pattern        = "{ $.metric = \"queue_waiting_total\" }"
  metric_transformation {
    name      = "QueueWaitingTotal"
    namespace = local.ns
    value     = "$.waiting"
    unit      = "Count"
  }
}

# Same value with no dimension, so one alarm sees every queue (an alarm on a
# dimensionless metric never matches the per-queue series above). The DLQ
# has no consumer — its jobs wait by design — so it is left out.
resource "aws_cloudwatch_log_metric_filter" "queue_oldest_age_all" {
  name           = "${var.name}-queue-oldest-age-all"
  log_group_name = var.worker_log_group
  pattern        = "{ $.metric = \"queue_depth\" && $.queue != \"stripe-webhooks-dlq\" && $.queue != \"cron-heavy\" && $.queue != \"account-deletion\" && $.queue != \"channel-fanout\" && $.queue != \"admin-broadcast\" }"
  metric_transformation {
    name      = "QueueOldestAgeSecondsAll"
    namespace = local.ns
    value     = "$.oldestAgeSeconds"
    unit      = "Seconds"
  }
}

# S10-2 / S10-7 (queues hardening 2026-10-25): lanes where a long wait is
# normal (heavy cron jobs run one at a time, daily deletions, fan-outs) are
# left out of the 5-minute alarm above and watched by their own, lenient
# 1-hour alarm below. Pure log metric filter + one alarm: cents per month.
resource "aws_cloudwatch_log_metric_filter" "queue_oldest_age_slow" {
  name           = "${var.name}-queue-oldest-age-slow"
  log_group_name = var.worker_log_group
  pattern        = "{ $.metric = \"queue_depth\" && ($.queue = \"cron-heavy\" || $.queue = \"account-deletion\" || $.queue = \"channel-fanout\" || $.queue = \"admin-broadcast\") }"
  metric_transformation {
    name      = "QueueOldestAgeSecondsSlow"
    namespace = local.ns
    value     = "$.oldestAgeSeconds"
    unit      = "Seconds"
  }
}

# Jobs that ended in `failed` (retries used up) during the last 5 minutes,
# from BullMQ's own metrics (apps/api ops-metrics.job.ts `failed5m`). The
# dead-letter queue has no consumer and is left out.
resource "aws_cloudwatch_log_metric_filter" "queue_failed_all" {
  name           = "${var.name}-queue-failed-all"
  log_group_name = var.worker_log_group
  pattern        = "{ $.metric = \"queue_depth\" && $.queue != \"stripe-webhooks-dlq\" }"
  metric_transformation {
    name      = "QueueFailed5mAll"
    namespace = local.ns
    value     = "$.failed5m"
    unit      = "Count"
  }
}

# Queues whose single failed job is a person's problem: a data export, an
# account deletion, a payment event, a subscription reminder, an upload scan,
# an image check.
resource "aws_cloudwatch_log_metric_filter" "queue_failed_critical" {
  name           = "${var.name}-queue-failed-critical"
  log_group_name = var.worker_log_group
  pattern        = "{ $.metric = \"queue_depth\" && ($.queue = \"data-export\" || $.queue = \"case-history-export\" || $.queue = \"account-deletion\" || $.queue = \"stripe-webhooks\" || $.queue = \"subscriptions\" || $.queue = \"files\" || $.queue = \"media-moderation\") }"
  metric_transformation {
    name      = "QueueFailed5mCritical"
    namespace = local.ns
    value     = "$.failed5m"
    unit      = "Count"
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
# --- «пора вынести поиск» (docs/architecture/SEARCH_READY.md) ---------------
# One log line per search answered by Postgres: {metric: "search_latency",
# engine: "postgres", ms}. p95 over 15 minutes above the threshold means the
# built-in search is slowing the database down: turn the separate search on.
resource "aws_cloudwatch_log_metric_filter" "search_latency" {
  name           = "${var.name}-search-pg-latency"
  log_group_name = var.api_log_group
  pattern        = "{ $.metric = \"search_latency\" && $.engine = \"postgres\" }"
  metric_transformation {
    name      = "SearchPgLatencyMs"
    namespace = local.ns
    value     = "$.ms"
    unit      = "Milliseconds"
  }
}

resource "aws_cloudwatch_metric_alarm" "search_slow" {
  count               = var.search_p95_alarm_ms > 0 ? 1 : 0
  alarm_name          = "${var.name}-search-slow"
  alarm_description   = "LawBid: Поиск отвечает медленно — пора включить отдельный поиск (Админка → Настройки → search.engine). Что делать: поставьте search.engine = shadow, потом engine; инструкция: docs/architecture/SEARCH_READY.md (EN: Postgres search p95 above ${var.search_p95_alarm_ms} ms for 15 minutes.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  period              = 300
  threshold           = var.search_p95_alarm_ms
  extended_statistic  = "p95"
  metric_name         = aws_cloudwatch_log_metric_filter.search_latency.metric_transformation[0].name
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx_ratio" {
  alarm_name          = "${var.name}-api-5xx-ratio"
  alarm_description   = "LawBid: Приложение выдаёт ошибки (больше 1 % запросов). Что делать: Обычно это неудачное обновление — оно откатывается само. Не прошло за 15 минут: GitHub → Actions → «Rollback production». Инструкция: ${var.runbook_base_url}/api-5xx.md (EN: 5xx > 1% for 5 minutes.)"
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
  alarm_description   = "LawBid: Приложение отвечает медленно. Что делать: Сервер добавляет мощность сам. Не прошло за 20 минут — откройте админку → Система → Здоровье системы. Инструкция: ${var.runbook_base_url}/api-latency.md (EN: p95 above target for 10 minutes.)"
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
  alarm_description   = "LawBid: Один из серверов приложения не отвечает. Что делать: AWS заменяет его сам за пару минут. Ничего делать не нужно, если письмо «OK» придёт следом. Инструкция: ${var.runbook_base_url}/api-unhealthy.md (EN: API tasks failing the ALB health check (/health/live).)"
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
  alarm_description   = "LawBid: Фоновые задачи (пуши, письма, оплаты) копятся или обработчик молчит. Что делать: AWS перезапускает обработчик сам. Не прошло за 15 минут — админка → Здоровье системы → «Перезапустить фоновые задачи». Инструкция: ${var.runbook_base_url}/queues.md (EN: Oldest waiting job older than 5 minutes, or the worker stopped reporting queue depth.)"
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

resource "aws_cloudwatch_metric_alarm" "queue_backlog_slow" {
  alarm_name          = "${var.name}-queue-backlog-slow"
  alarm_description   = "LawBid: Длинная фоновая очередь (тяжёлые пересчёты, удаление аккаунтов, рассылки) стоит больше часа. Что делать: админка → Здоровье системы → «Перезапустить фоновые задачи»; не помогло — напишите Claude. Инструкция: ${var.runbook_base_url}/queues.md (EN: oldest job of a slow lane waited over 1 hour.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 1800
  threshold           = 3600
  statistic           = "Maximum"
  metric_name         = "QueueOldestAgeSecondsSlow"
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

# One failed job in a queue that touches a person's data or money.
resource "aws_cloudwatch_metric_alarm" "queue_failed_critical" {
  alarm_name          = "${var.name}-queue-failed-critical"
  alarm_description   = "LawBid: Фоновая задача упала окончательно (выгрузка данных, удаление аккаунта, оплата, проверка файла или картинки). Что делать: админка → Здоровье системы → «Повторить упавшие задачи»; упало снова — напишите Claude. Инструкция: ${var.runbook_base_url}/queues.md (EN: a job in a critical queue exhausted its retries in the last 5 minutes.)"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 300
  threshold           = 1
  statistic           = "Maximum"
  metric_name         = "QueueFailed5mCritical"
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

# Many failures in any one queue: a handler is broken, not unlucky.
resource "aws_cloudwatch_metric_alarm" "queue_failed_many" {
  alarm_name          = "${var.name}-queue-failed-many"
  alarm_description   = "LawBid: Много фоновых задач падает подряд (10 и больше за 5 минут в одной очереди). Что делать: подождите 15 минут — если не прекратилось, напишите Claude. Инструкция: ${var.runbook_base_url}/queues.md (EN: 10 or more failed jobs in 5 minutes in one queue.)"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  period              = 300
  threshold           = 10
  statistic           = "Maximum"
  metric_name         = "QueueFailed5mAll"
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "tx_retries" {
  alarm_name          = "${var.name}-tx-retries"
  alarm_description   = "LawBid: База данных перегружена одновременными изменениями. Что делать: Система повторяет запросы сама и ставит тяжёлые задачи на паузу. Повторяется каждый день — напишите Claude. Инструкция: ${var.runbook_base_url}/db-contention.md (EN: Spike of 40001 transaction retries.)"
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
  alarm_description   = "LawBid: Часть событий Stripe (оплаты) не обработалась. Что делать: Деньги не теряются: Stripe хранит события. Напишите Claude «Stripe DLQ» — разберёт и прогонит заново. Инструкция: ${var.runbook_base_url}/stripe-webhooks.md (EN: Stripe webhook events reached the DLQ.)"
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
  alarm_description   = "LawBid: Много неудачных оплат подписок за час. Что делать: Проверьте Stripe Dashboard → Payments: проблема у банка или у Stripe. Система сама шлёт людям напоминания оплатить. Инструкция: ${var.runbook_base_url}/payments-failed.md (EN: Spike of failed subscription payments.)"
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
  alarm_description   = "LawBid: ВАЖНО: нарушена целостность журнала кейсов. Что делать: Ничего не удаляйте. Сразу напишите Claude «журнал кейсов» — это надо разобрать в тот же день. Инструкция: ${var.runbook_base_url}/journal-integrity.md (EN: CRITICAL: case_journal hash chain broken.)"
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
  alarm_description   = "LawBid: Необычно много SMS за час (расходы Twilio). Что делать: Похоже на атаку на SMS-коды. Система уже ограничивает отправку сама. Проверьте Twilio → Usage. Инструкция: ${var.runbook_base_url}/sms-spend.md (EN: SMS volume spike (cost).)"
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
  alarm_description   = "LawBid: Быстрая память (Redis) сильно загружена. Что делать: Обычно проходит само. Держится больше суток — увеличьте Redis при следующем «ставь на AWS». Инструкция: ${var.runbook_base_url}/redis.md (EN: Redis engine CPU > 80%.)"
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
  alarm_description   = "LawBid: Быстрая память (Redis) заполнена больше чем на ${var.redis_memory_alarm_percent} %. Что делать: Держится больше суток — увеличьте Redis при следующем «ставь на AWS». Данные не теряются. Инструкция: ${var.runbook_base_url}/redis.md (EN: Redis memory above ${var.redis_memory_alarm_percent}%.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 300
  threshold           = var.redis_memory_alarm_percent
  statistic           = "Average"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  dimensions          = { ReplicationGroupId = var.redis_replication_group_id }
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

# S6-4 (Redis hardening 2026-10-25): node-level ElastiCache metrics the old
# alarms (EngineCPU, memory) cannot see. Source: AWS «Which metrics should I
# monitor» (CacheMetrics.WhichShouldIMonitor). These metrics are published per
# node (CacheClusterId = <group>-001: the primary of a single-node group).
locals {
  redis_primary_node = "${var.redis_replication_group_id}-001"
  redis_is_burstable = startswith(var.redis_node_type, "cache.t")
}

resource "aws_cloudwatch_metric_alarm" "redis_cpu_credits" {
  count               = local.redis_is_burstable ? 1 : 0
  alarm_name          = "${var.name}-redis-cpu-credits"
  alarm_description   = "LawBid: У быстрой памяти (Redis) кончаются «кредиты» процессора, скоро она замедлится. Что делать: Увеличьте Redis при следующем «ставь на AWS» (класс не t4g). Инструкция: ${var.runbook_base_url}/redis.md (EN: CPUCreditBalance < 20 on the burstable Redis node.)"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3
  period              = 300
  threshold           = 20
  statistic           = "Minimum"
  metric_name         = "CPUCreditBalance"
  namespace           = "AWS/ElastiCache"
  dimensions          = { CacheClusterId = local.redis_primary_node }
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "redis_network_allowance" {
  alarm_name          = "${var.name}-redis-network-allowance"
  alarm_description   = "LawBid: Быстрая память (Redis) упёрлась в сетевой лимит своего класса, пакеты отбрасываются. Что делать: Увеличьте Redis при следующем «ставь на AWS». Инструкция: ${var.runbook_base_url}/redis.md (EN: NetworkBandwidthAllowanceExceeded > 0.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  period              = 60
  threshold           = 0
  statistic           = "Sum"
  metric_name         = "NetworkBandwidthAllowanceExceeded"
  namespace           = "AWS/ElastiCache"
  dimensions          = { CacheClusterId = local.redis_primary_node }
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "redis_traffic_management" {
  alarm_name          = "${var.name}-redis-traffic-management"
  alarm_description   = "LawBid: Быстрая память (Redis) сама притормаживает клиентов (перегружена по трафику). Что делать: Увеличьте Redis при следующем «ставь на AWS». Инструкция: ${var.runbook_base_url}/redis.md (EN: TrafficManagementActive > 0.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  period              = 60
  threshold           = 0
  statistic           = "Maximum"
  metric_name         = "TrafficManagementActive"
  namespace           = "AWS/ElastiCache"
  dimensions          = { CacheClusterId = local.redis_primary_node }
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "redis_connections" {
  alarm_name          = "${var.name}-redis-connections"
  alarm_description   = "LawBid: К быстрой памяти (Redis) подключено слишком много соединений. Что делать: Обычно после переключения Redis или утечки; если не проходит за час — напишите Claude «redis соединения». Инструкция: ${var.runbook_base_url}/redis.md (EN: CurrConnections high.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  period              = 60
  threshold           = var.redis_connections_alarm
  statistic           = "Maximum"
  metric_name         = "CurrConnections"
  namespace           = "AWS/ElastiCache"
  dimensions          = { CacheClusterId = local.redis_primary_node }
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "redis_new_connections" {
  alarm_name          = "${var.name}-redis-new-connections"
  alarm_description   = "LawBid: Всплеск новых подключений к быстрой памяти (Redis): похоже на «шторм переподключений». Что делать: Обычно после переключения Redis или выкладки; если повторяется — напишите Claude «redis соединения». Инструкция: ${var.runbook_base_url}/redis.md (EN: NewConnections spike.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 60
  threshold           = var.redis_new_connections_alarm
  statistic           = "Sum"
  metric_name         = "NewConnections"
  namespace           = "AWS/ElastiCache"
  dimensions          = { CacheClusterId = local.redis_primary_node }
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

# Evictions on the cache-only node (allkeys-lru) mean it is too small for the
# working set: every eviction is a future cache miss.
resource "aws_cloudwatch_metric_alarm" "redis_cache_evictions" {
  count               = var.redis_cache_replication_group_id != "" ? 1 : 0
  alarm_name          = "${var.name}-redis-cache-evictions"
  alarm_description   = "LawBid: Кэш-узел Redis вытесняет данные (мало памяти). Что делать: не срочно, сайт работает чуть медленнее; увеличьте кэш-узел при следующем «ставь на AWS». Инструкция: ${var.runbook_base_url}/redis.md (EN: Evictions > 0 on the cache node.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  period              = 300
  threshold           = 0
  statistic           = "Sum"
  metric_name         = "Evictions"
  namespace           = "AWS/ElastiCache"
  dimensions          = { CacheClusterId = "${var.redis_cache_replication_group_id}-001" }
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

# S6-1: the cron schedulers live only in Redis. The worker heartbeat logs
# `cron_schedulers` (missing = expected - found) every 30 s and re-registers
# them itself; this alarm says it happened and did not heal.
resource "aws_cloudwatch_log_metric_filter" "cron_schedulers_missing" {
  name           = "${var.name}-cron-schedulers-missing"
  log_group_name = var.worker_log_group
  pattern        = "{ $.metric = \"cron_schedulers\" }"
  metric_transformation {
    name      = "CronSchedulersMissing"
    namespace = local.ns
    value     = "$.missing"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "cron_schedulers_missing" {
  alarm_name          = "${var.name}-cron-schedulers-missing"
  alarm_description   = "LawBid: Расписание фоновых задач пропало из Redis (после замены или сбоя Redis). Что делать: система сама вернёт его за 30 секунд; если тревога держится больше 10 минут — перезапустите сервис worker. Инструкция: ${var.runbook_base_url}/redis.md (EN: cron job schedulers missing in Redis.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  period              = 60
  threshold           = 0
  statistic           = "Maximum"
  metric_name         = "CronSchedulersMissing"
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags
}

variable "db_instance_id" {
  type        = string
  default     = ""
  description = "RDS instance identifier. Empty = the database is not ours (no connection alarm)."
}
variable "db_max_connections" {
  type        = number
  default     = 0
  description = "max_connections of that database (stack estimates it from the instance class)."
}

# Scale audit 2026-10-23: every API / worker task keeps a small pool of
# database connections; autoscaling and rolling deploys multiply them. Past
# 80 % of max_connections new connections start to fail - this alarm comes
# before that, while there is still time to lower DB_POOL_SIZE or move the
# database one size up.
resource "aws_cloudwatch_metric_alarm" "db_connections" {
  count               = var.db_instance_id != "" && var.db_max_connections > 0 ? 1 : 0
  alarm_name          = "${var.name}-db-connections"
  alarm_description   = "LawBid: База данных заполнена соединениями больше чем на 80 % (так бывает при большом числе серверов). Что делать: админка → Здоровье системы → увеличить базу на один размер; если повторяется — напишите Claude «пул соединений». Инструкция: ${var.runbook_base_url}/db-contention.md (EN: RDS DatabaseConnections above 80 % of max_connections.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 300
  threshold           = floor(var.db_max_connections * 0.8)
  statistic           = "Maximum"
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  dimensions          = { DBInstanceIdentifier = var.db_instance_id }
  treat_missing_data  = "notBreaching"
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
  alarm_description   = "LawBid: Сервер ${each.key} загружен больше 85 % уже 10 минут. Что делать: Сервер растёт сам до потолка. Если письма идут каждый день — поднимите потолок (api_max_tasks) при следующем «ставь на AWS». Инструкция: ${var.runbook_base_url}/ecs-capacity.md (EN: ${each.key} CPU > 85% for 10 minutes (autoscaling ceiling?).)"
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
# 2026-10-24: Container Insights is off (it cost about $30/month), so the old
# ECS/ContainerInsights RunningTaskCount is gone. Two free signals instead:
#   api    = ALB HealthyHostCount of the api target group (tasks that really
#            pass the health check; free, one point a minute);
#   worker = SampleCount of LawBid/Runtime HeapUsedMb {Service=worker}: every
#            running worker writes one line a minute (RuntimeStatsService), so
#            "no samples" = "no running worker". Period 180 s so one late line
#            never looks like an outage. No data = breaching, a dead service
#            still pages.
resource "aws_cloudwatch_metric_alarm" "service_running_tasks" {
  for_each = {
    api    = var.api_service_name
    worker = var.worker_service_name
  }
  alarm_name          = "${var.name}-${each.key}-no-running-tasks"
  alarm_description   = "LawBid: Сервер ${each.key} не запущен ни разу. Что делать: AWS пытается запустить его сам. Не прошло за 10 минут — GitHub → Actions → «Rollback production» на прошлую версию. Инструкция: ${var.runbook_base_url}/ecs-capacity.md (EN: ${each.key} has no running ECS tasks.)"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  period              = each.key == "api" ? 60 : 180
  threshold           = 1
  statistic           = each.key == "api" ? "Minimum" : "SampleCount"
  metric_name         = each.key == "api" ? "HealthyHostCount" : "HeapUsedMb"
  namespace           = each.key == "api" ? "AWS/ApplicationELB" : "LawBid/Runtime"
  dimensions = each.key == "api" ? {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.api_target_group_arn_suffix
    } : {
    Service = "worker"
  }
  treat_missing_data = "breaching"
  alarm_actions      = local.ops
  ok_actions         = local.ops
  tags               = var.tags
}

# Email reputation (SES production-access promise): AWS pauses sending
# above ~10 % bounces or ~0.5 % complaints, so warn well before that.
# Bounced and complained addresses are skipped by the SES account
# suppression list (modules/ses).
resource "aws_cloudwatch_metric_alarm" "ses_bounce_rate" {
  alarm_name          = "${var.name}-ses-bounce-rate"
  alarm_description   = "LawBid: Много писем не доходят (bounce > 4 %). Что делать: Возможно, боты регистрируются с выдуманными адресами. Плохие адреса отключаются сами; при 10 % AWS остановит почту. Инструкция: ${var.runbook_base_url}/ses.md (EN: SES bounce rate > 4%. Sending pauses at ~10%.)"
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
  alarm_description   = "LawBid: Люди отмечают наши письма как спам (> 0,1 %). Что делать: Проверьте, не уходят ли лишние рассылки (админка → Связь → Рассылки). При 0,5 % AWS остановит почту. Инструкция: ${var.runbook_base_url}/ses.md (EN: SES complaint rate > 0.1%. Sending pauses at ~0.5%.)"
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

# S9-13 (2026-10-25): e-mail pumping costs almost nothing ($0.10 per 1 000)
# but wrecks the sender reputation. The app caps e-mails per day; this alarm
# is the second net that works even if the app's counter is bypassed.
resource "aws_cloudwatch_metric_alarm" "ses_send_volume" {
  count               = var.ses_send_alarm_per_day > 0 ? 1 : 0
  alarm_name          = "${var.name}-ses-send-volume"
  alarm_description   = "LawBid: За сутки отправлено больше ${var.ses_send_alarm_per_day} писем (обычно не больше 2 000). Что делать: возможно, боты запрашивают коды на выдуманные адреса. Посмотрите админка → Безопасность и лимиты на письма; AWS остановит почту при плохой репутации. Инструкция: ${var.runbook_base_url}/ses.md (EN: SES Send > ${var.ses_send_alarm_per_day} in 24 h.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 86400
  threshold           = var.ses_send_alarm_per_day
  treat_missing_data  = "notBreaching"
  statistic           = "Sum"
  metric_name         = "Send"
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

# Owner 2026-10-23 («связь пропала»): how often live connections drop and
# come back. The API logs one line per event (realtime.gateway.ts); the
# board «Состояние системы» shows the same numbers per minute.
resource "aws_cloudwatch_log_metric_filter" "ws_events" {
  for_each = {
    ws_disconnect = "WebSocketDisconnects"
    ws_reconnect  = "WebSocketReconnects"
  }
  name           = "${var.name}-${replace(each.key, "_", "-")}"
  log_group_name = var.api_log_group
  pattern        = "{ $.metric = \"${each.key}\" }"
  metric_transformation {
    name          = each.value
    namespace     = local.ns
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

resource "aws_cloudwatch_log_metric_filter" "ws_going_away" {
  name           = "${var.name}-ws-going-away"
  log_group_name = var.api_log_group
  pattern        = "{ $.metric = \"ws_going_away\" }"
  metric_transformation {
    name      = "WebSocketGoingAway"
    namespace = local.ns
    value     = "$.count"
    unit      = "Count"
  }
}

# A reconnect wave that is not a deploy: the apps lose their live
# connection and come back in numbers (token expiry bug, network, a dying
# instance). Busy-day baseline is far below this.
resource "aws_cloudwatch_metric_alarm" "ws_reconnect_storm" {
  alarm_name          = "${var.name}-ws-reconnect-storm"
  alarm_description   = "LawBid: Много людей теряют и восстанавливают связь (более 1500 переподключений за 5 минут). Что делать: если только что был выкат — подождите 10 минут, это нормально. Иначе откройте админку → Состояние системы → «Живое соединение» и посмотрите причины разрывов. Инструкция: ${var.runbook_base_url}/REALTIME_LIFECYCLE.md (EN: websocket reconnects > 1500 per 5 min.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 300
  threshold           = 1500
  statistic           = "Sum"
  metric_name         = "WebSocketReconnects"
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
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
  alarm_description   = "LawBid: Платный сервис (SMS, почта, переводы, видео) дошёл до своего лимита. Что делать: Это защита от больших счетов: лишние запросы просто не отправляются. Поднять лимит: админка → Система → Настройки (budget.*). Инструкция: ${var.runbook_base_url}/sms-spend.md (EN: A paid-provider budget is exhausted or nearly so, or the cost guard cannot reach Redis.)"
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

# --- zero maintenance (owner 2026-10-05) ------------------------------------
# The worker's `ops.guard` job probes the database every minute and logs
# `metric: db_health`; `ops.cost-check` / `ops.backup-check` log
# `alert: cost_ceiling` / `alert: backup_stale` (src/jobs/handlers/
# ops-guard.job.ts). The managed PostgreSQL host may be outside AWS, so this is how its
# health reaches CloudWatch.
resource "aws_cloudwatch_log_metric_filter" "db_ok" {
  name           = "${var.name}-db-ok"
  log_group_name = var.worker_log_group
  pattern        = "{ $.metric = \"db_health\" }"
  metric_transformation {
    name      = "DbOk"
    namespace = local.ns
    value     = "$.ok"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_log_metric_filter" "db_latency" {
  name           = "${var.name}-db-latency"
  log_group_name = var.worker_log_group
  pattern        = "{ $.metric = \"db_health\" && $.ok = 1 }"
  metric_transformation {
    name      = "DbLatencyMs"
    namespace = local.ns
    value     = "$.latencyMs"
    unit      = "Milliseconds"
  }
}

resource "aws_cloudwatch_log_metric_filter" "ops_alert" {
  for_each = {
    cost_ceiling        = "CostCeilingReached"
    backup_stale        = "BackupStale"
    cost_budget_ceiling = "CostBudgetCeiling"

    # Owner 2026-10-16: the economy guard (src/common/economy).
    economy_guard_on  = "EconomyGuardOn"
    economy_guard_off = "EconomyGuardOff"
    capacity_pressure = "CapacityPressure"

    # Day-one foundations: the nightly money-ledger check (ledger.reconcile).
    ledger_mismatch = "LedgerMismatch"
  }
  name           = "${var.name}-ops-${replace(each.key, "_", "-")}"
  log_group_name = var.worker_log_group
  pattern        = "{ $.alert = \"${each.key}\" }"
  metric_transformation {
    name      = each.value
    namespace = local.ns
    value     = "1"
    unit      = "Count"
  }
}

# Missing data is left to queue_backlog (a silent worker already alarms).
resource "aws_cloudwatch_metric_alarm" "db_down" {
  alarm_name          = "${var.name}-db-down"
  alarm_description   = "LawBid: База данных не отвечает 3 минуты подряд. Что делать: приложение переподключится само, когда база вернётся. Откройте кабинет хостинга базы данных (Status): если там авария, её чинит провайдер. Инструкция: ${var.runbook_base_url}/db-redis-unavailable.md (EN: db_health ok=0 for 3 minutes.)"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3
  period              = 60
  threshold           = 1
  statistic           = "Maximum"
  metric_name         = "DbOk"
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "db_slow" {
  alarm_name          = "${var.name}-db-slow"
  alarm_description   = "LawBid: База данных отвечает медленно (дольше 1 секунды) 10 минут. Что делать: тяжёлые задачи уже на паузе сами. Повторяется каждый день — нужна база побольше, напишите Claude. Инструкция: ${var.runbook_base_url}/db-contention.md (EN: average DB probe > 1000 ms for 10 minutes.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 300
  threshold           = 1000
  statistic           = "Average"
  metric_name         = "DbLatencyMs"
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "cost_ceiling" {
  alarm_name          = "${var.name}-aws-budget-reached"
  alarm_description   = "LawBid: Бюджет AWS на месяц исчерпан. Что делать: ничего — система уже держит сервер на минимуме до конца месяца, приложение работает. Нужна полная мощность — админка → Здоровье системы → «Обычный режим». Инструкция: ${var.runbook_base_url}/cost.md (EN: monthly AWS budget reached; autoscaling capped.)"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 3600
  threshold           = 1
  statistic           = "Sum"
  metric_name         = "CostCeilingReached"
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "backup_stale" {
  alarm_name          = "${var.name}-backup-stale"
  alarm_description   = "LawBid: Нет свежей резервной копии базы (старше 26 часов) или проверка не смогла её найти. Что делать: откройте кабинет хостинга базы данных → Backups. Есть ошибка — напишите в их поддержку (бэкапы делает хостинг) или Claude «бэкап». Инструкция: ${var.runbook_base_url}/backup-failed.md (EN: newest CockroachDB Cloud backup is stale.)"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 3600
  threshold           = 1
  statistic           = "Sum"
  metric_name         = "BackupStale"
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
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
  alarm_description   = "LawBid: Файлы или база выросли за сутки быстрее обычного. Что делать: откройте админку → Система → Хранилище и посмотрите «Кто занимает больше всего» и «Самые большие таблицы»; при необходимости поставьте пользователю лимит. Ненужные файлы система удаляет сама. (EN: files or DB grew more than storage.growth_alert_percent in a day.)"
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

# Owner 2026-10-24 (Cloudflare R2): the same nightly storage.snapshot counts
# the R2 bucket and logs `alert: r2_storage_high` past the 10 GB free tier
# and `alert: r2_ops_high` when the object count jumped (paid writes).
locals {
  r2_alerts = {
    r2_storage_high = {
      metric = "R2StorageHigh"
      text   = "LawBid: Фото и медиа в Cloudflare R2 заняли больше 10 ГБ (бесплатный лимит). Что делать: ничего срочного — дальше $0.015 за ГБ в месяц, скачивание бесплатно. Посмотрите админку → Система → Хранилище (строка Cloudflare R2) и при желании ужмите картинки. Инструкция: ${var.runbook_base_url}/DNS_TO_CLOUDFLARE.md (EN: R2 storage passed the 10 GB free tier.)"
    }
    r2_ops_high = {
      metric = "R2OpsHigh"
      text   = "LawBid: В Cloudflare R2 за сутки появилось необычно много файлов (платные операции записи). Что делать: админка → Система → Хранилище → «Кто занимает больше всего»; нет ли массовой загрузки или бота. Инструкция: ${var.runbook_base_url}/DNS_TO_CLOUDFLARE.md (EN: R2 object count grew faster than storage.growth_alert_percent.)"
    }
  }
}

resource "aws_cloudwatch_log_metric_filter" "r2" {
  for_each       = local.r2_alerts
  name           = "${var.name}-${replace(each.key, "_", "-")}"
  log_group_name = var.worker_log_group
  pattern        = "{ $.alert = \"${each.key}\" }"
  metric_transformation {
    name      = each.value.metric
    namespace = local.ns
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "r2" {
  for_each            = local.r2_alerts
  alarm_name          = "${var.name}-${replace(each.key, "_", "-")}"
  alarm_description   = each.value.text
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 3600
  threshold           = 1
  statistic           = "Sum"
  metric_name         = each.value.metric
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags
}

# Owner 2026-10-05 «Прибыль и резерв»: the daily treasury.daily job logs
# an `alert` when the monthly split of the Stripe balance needs the owner.
locals {
  treasury_alerts = {
    treasury_setup_needed = {
      metric = "TreasurySetupNeeded"
      text   = "LawBid: Деление денег на «Прибыль» и «Расходы» не сработало: в Stripe выплаты всё ещё автоматические. Что делать: Stripe → Settings → Payouts → Payout schedule → Manual. Пока это не сделано, Stripe сам переводит всё на основной банк. Инструкция: ${var.runbook_base_url}/treasury.md (EN: Stripe payouts are not on Manual.)"
    }
    treasury_low = {
      metric = "TreasuryLow"
      text   = "LawBid: На Stripe не хватает денег на месяц расходов и резерв. Счёт «Расходы» получил столько, сколько было, прибыль в этом месяце не выплачена. Что делать: ничего срочного. Если на карте для расходов мало денег, пополните её один раз сами. Подробности: админка → Деньги → Прибыль и резерв. Инструкция: ${var.runbook_base_url}/treasury.md (EN: Stripe balance below a month of costs plus the reserve.)"
    }
    treasury_payout_failed = {
      metric = "TreasuryPayoutFailed"
      text   = "LawBid: Банк не принял выплату из Stripe (прибыль или расходы). Что делать: Stripe → Balances → Payouts, откройте неудачную выплату и проверьте реквизиты банка. Деньги остались на балансе Stripe и уйдут при следующем делении. Инструкция: ${var.runbook_base_url}/treasury.md (EN: a treasury payout failed.)"
    }
    treasury_bank_changed = {
      metric = "TreasuryBankChanged"
      text   = "LawBid: В Stripe изменились банки для выплат. Если это сделали вы, всё в порядке. Если нет: срочно войдите в Stripe, удалите чужой банк, смените пароль Stripe и включите в админке «Прибыль и резерв» → «авто» выключено, пока не разберётесь. Инструкция: ${var.runbook_base_url}/treasury.md (EN: the payout banks in Stripe changed.)"
    }
    payroll_funds_low = {
      metric = "PayrollFundsLow"
      text   = "LawBid: На Stripe не хватает денег на ближайшую зарплату. Зарплаты уходят сами в день выплаты, но только когда денег хватает; система проверяет каждый день. Что делать: подождите поступлений от клиентов или пополните баланс Stripe (Stripe → Balances → Add funds). Сумма и дата: админка → Деньги → Прибыль и резерв → «Зарплаты сами». Инструкция: ${var.runbook_base_url}/treasury.md (EN: Stripe balance below the salaries due.)"
    }
    payroll_auto_failed = {
      metric = "PayrollAutoFailed"
      text   = "LawBid: Stripe не принял автоматическую выплату зарплаты кому-то из сотрудников. Что делать: админка → Деньги → Зарплаты → История: у кого «Не прошло», попросите человека заново открыть свою ссылку Stripe и проверить банк, потом нажмите «Выплатить». Инструкция: ${var.runbook_base_url}/treasury.md (EN: an automatic payroll transfer failed.)"
    }
  }
}

resource "aws_cloudwatch_log_metric_filter" "treasury" {
  for_each       = local.treasury_alerts
  name           = "${var.name}-${replace(each.key, "_", "-")}"
  log_group_name = var.worker_log_group
  pattern        = "{ $.alert = \"${each.key}\" }"
  metric_transformation {
    name      = each.value.metric
    namespace = local.ns
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "treasury" {
  for_each            = local.treasury_alerts
  alarm_name          = "${var.name}-${replace(each.key, "_", "-")}"
  alarm_description   = each.value.text
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 3600
  threshold           = 1
  statistic           = "Sum"
  metric_name         = each.value.metric
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags
}

# Owner 2026-10-05: spend caps in mode «Авто» (src/common/cost-guard/
# cost-autoscale.service.ts) want to grow past their safety ceiling.
resource "aws_cloudwatch_metric_alarm" "cost_budget_ceiling" {
  alarm_name          = "${var.name}-cost-budget-ceiling"
  alarm_description   = "LawBid: Автоматический лимит расходов (SMS, письма, проверки, загрузки, перевод или видео) упёрся в потолок безопасности. Что делать: если пользователей действительно стало больше — админка → Система → Настройки → Лимиты расходов → поднимите «Потолок». Если роста не было — возможно, это злоупотребление, и лимит вас защищает: напишите Claude «лимиты». (EN: cost autoscale target clamped by its ceiling.)"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 3600
  threshold           = 1
  statistic           = "Sum"
  metric_name         = "CostBudgetCeiling"
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags
}

# Owner 2026-10-16: the economy guard e-mails on every transition and when the
# database / Redis come under load (events also show in the admin card).
resource "aws_cloudwatch_metric_alarm" "economy" {
  for_each = {
    economy_guard_on = {
      metric = "EconomyGuardOn"
      text   = "Расходы на сторонние сервисы превысили правило (доля дохода). Что делать: ничего — система сама включила ограничения: лимиты сервисов на минимум, новые видео на паузе, SMS только для входа, контейнеры на минимуме. Снимутся сами, когда расходы придут в норму. Подробности и правило: админка → Система → Экономика. (EN: economy guard switched on.)"
    }
    economy_guard_off = {
      metric = "EconomyGuardOff"
      text   = "Ограничения экономики сняты: расходы снова в норме или автоматика выключена. Что делать: ничего. (EN: economy guard switched off.)"
    }
    ledger_mismatch = {
      metric = "LedgerMismatch"
      text   = "Ночная сверка денег нашла расхождение: книга учёта денег не сходится с платежами или со Stripe. Что делать: деньги пользователей не затронуты, но откройте логи воркера (поиск alert ledger_mismatch) и пришлите их Claude «ledger mismatch». Инструкция: docs/architecture/MONEY_LEDGER.md. (EN: nightly ledger reconciliation found a mismatch.)"
    }
    capacity_pressure = {
      metric = "CapacityPressure"
      text   = "База данных или Redis под нагрузкой (процессор базы выше 70 %, соединения выше 80 % или память Redis выше 75 %). Что делать: админка → Система → Экономика → «Увеличить» (одна кнопка, нужен код 2FA; перезапуск на 1–5 минут). (EN: DB/Redis pressure.)"
    }
  }
  alarm_name          = "${var.name}-${replace(each.key, "_", "-")}"
  alarm_description   = "LawBid: ${each.value.text}"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 300
  threshold           = 1
  statistic           = "Sum"
  metric_name         = each.value.metric
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags
}

# Owner 2026-10-22: Redis with a replica. A replica that falls behind cannot
# take over without losing writes. Node ids of a replication group are
# <group>-001 (first primary) and <group>-002 ...; after a failover the
# roles swap but the ids stay, so every replica node gets an alarm.
resource "aws_cloudwatch_metric_alarm" "redis_replication_lag" {
  for_each            = toset([for i in range(2, var.redis_replicas + 2) : format("%03d", i)])
  alarm_name          = "${var.name}-redis-replication-lag-${each.key}"
  alarm_description   = "LawBid: Запасная копия быстрой памяти (Redis) отстаёт больше 30 секунд. Что делать: ничего срочного, приложение работает; если не проходит за час — это нужно проверить. Инструкция: ${var.runbook_base_url}/redis.md (EN: ElastiCache ReplicationLag > 30 s on replica ${each.key}.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  period              = 300
  threshold           = 30
  statistic           = "Maximum"
  metric_name         = "ReplicationLag"
  namespace           = "AWS/ElastiCache"
  dimensions          = { CacheClusterId = "${var.redis_replication_group_id}-${each.key}" }
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

# Review R-54: the media bucket growing faster than the owner's ceiling. The
# replication copies every new object (no filter), so the day's growth is the
# day's replicated bytes. BucketSizeBytes is a daily metric per storage class:
# new files land in Standard / Intelligent-Tiering frequent access; RATE() is
# the change per second between two daily points. Mail only (not a failure).
resource "aws_cloudwatch_metric_alarm" "media_growth" {
  count               = var.media_bucket_name != "" && var.media_replication_max_gb_per_day > 0 ? 1 : 0
  alarm_name          = "${var.name}-media-replication-gb-per-day"
  alarm_description   = "LawBid: Фото и видео за сутки выросли больше чем на ${var.media_replication_max_gb_per_day} ГБ, и столько же уходит в копию в другой регион (платное хранение и пересылка $0,02 за ГБ). Что делать: админка → Система → Хранилище → «Кто занимает больше всего» (нет ли массовой загрузки или бота); если это ожидаемо, поднимите media_replication_max_gb_per_day; чтобы остановить копирование, поставьте replicate_media = false в terraform.tfvars. Инструкция: ${var.runbook_base_url}/cost.md (EN: media bucket grew over ${var.media_replication_max_gb_per_day} GB in a day.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = var.media_replication_max_gb_per_day
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags

  metric_query {
    id          = "gb_per_day"
    expression  = "RATE(std + ia) * 86400 / 1073741824"
    label       = "GB added per day"
    return_data = true
  }
  metric_query {
    id = "std"
    metric {
      metric_name = "BucketSizeBytes"
      namespace   = "AWS/S3"
      period      = 86400
      stat        = "Average"
      dimensions  = { BucketName = var.media_bucket_name, StorageType = "StandardStorage" }
    }
  }
  metric_query {
    id = "ia"
    metric {
      metric_name = "BucketSizeBytes"
      namespace   = "AWS/S3"
      period      = 86400
      stat        = "Average"
      dimensions  = { BucketName = var.media_bucket_name, StorageType = "IntelligentTieringFAStorage" }
    }
  }
}

# Batch A item 15: NAT gateway data processed (in + out, the billed number).
# Not a failure: an e-mail that a flow got big, to check VPC endpoints or a
# runaway download before the bill does (docs/runbooks/nat-endpoints.md).
resource "aws_cloudwatch_metric_alarm" "nat_bytes" {
  for_each            = var.nat_traffic_alarm_gb_per_day > 0 ? { for i, id in var.nat_gateway_ids : tostring(i) => id } : {}
  alarm_name          = "${var.name}-nat-bytes-${each.key}"
  alarm_description   = "LawBid: Через выход в интернет (NAT) за сутки прошло больше ${var.nat_traffic_alarm_gb_per_day} ГБ — это деньги ($0,045 за ГБ). Что делать: ничего срочного, приложение работает; посмотрите, не качается ли что-то лишнее, и нужны ли VPC-эндпоинты. Инструкция: ${var.runbook_base_url}/nat-endpoints.md (EN: NAT gateway ${each.value} processed over ${var.nat_traffic_alarm_gb_per_day} GB in 24 h.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = var.nat_traffic_alarm_gb_per_day * 1073741824
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags

  metric_query {
    id = "out"
    metric {
      metric_name = "BytesOutToDestination"
      namespace   = "AWS/NATGateway"
      period      = 86400
      stat        = "Sum"
      dimensions  = { NatGatewayId = each.value }
    }
  }
  metric_query {
    id = "in"
    metric {
      metric_name = "BytesInFromDestination"
      namespace   = "AWS/NATGateway"
      period      = 86400
      stat        = "Sum"
      dimensions  = { NatGatewayId = each.value }
    }
  }
  metric_query {
    id          = "total"
    expression  = "FILL(out, 0) + FILL(in, 0)"
    label       = "NAT bytes in + out"
    return_data = true
  }
}

output "critical_topic_arn" { value = aws_sns_topic.critical.arn }

# --- outside usage that costs money without a hard limit ---------------------
# Batch C items 11 and 16 (2026-10-24): the worker's daily `ops.usage-poll`
# job (src/jobs/handlers/usage-poll.job.ts) reads Cloudflare Realtime TURN
# egress (GraphQL callsTurnUsageAdaptiveGroups; free 1000 GB/month, shared
# with SFU) and Bunny traffic / storage, logs the numbers as metrics and logs
# `alert: usage_*` lines when a threshold set in the admin (Settings,
# usage.*) is passed. Thresholds live in the admin (one place); these filters
# only turn the log lines into mails (warn) and a page (crit).
resource "aws_cloudwatch_log_metric_filter" "cf_realtime_egress" {
  name           = "${var.name}-cf-realtime-egress-gb"
  log_group_name = var.worker_log_group
  pattern        = "{ $.metric = \"cf_realtime_egress_gb\" }"
  metric_transformation {
    name      = "CloudflareRealtimeEgressGb"
    namespace = local.ns
    value     = "$.gb"
    unit      = "Gigabytes"
  }
}

resource "aws_cloudwatch_log_metric_filter" "bunny_usage" {
  for_each = {
    BunnyBandwidthGb = "bandwidthGb"
    BunnyStorageGb   = "storageGb"
  }
  name           = "${var.name}-bunny-${lower(each.value)}"
  log_group_name = var.worker_log_group
  pattern        = "{ $.metric = \"bunny_usage\" }"
  metric_transformation {
    name      = each.key
    namespace = local.ns
    value     = "$.${each.value}"
    unit      = "Gigabytes"
  }
}

resource "aws_cloudwatch_log_metric_filter" "usage_alert" {
  for_each = {
    usage_cf_warn              = "UsageCfWarn"
    usage_cf_crit              = "UsageCfCrit"
    usage_bunny_bandwidth_warn = "UsageBunnyBandwidthWarn"
    usage_bunny_bandwidth_crit = "UsageBunnyBandwidthCrit"
    usage_bunny_storage_warn   = "UsageBunnyStorageWarn"
    usage_bunny_storage_crit   = "UsageBunnyStorageCrit"
    usage_poll_failed          = "UsagePollFailed"
  }
  name           = "${var.name}-${replace(each.key, "_", "-")}"
  log_group_name = var.worker_log_group
  pattern        = "{ $.alert = \"${each.key}\" }"
  metric_transformation {
    name      = each.value
    namespace = local.ns
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "usage_alert" {
  for_each = {
    usage_cf_warn = {
      metric = "UsageCfWarn"
      page   = false
      text   = "Звонки Cloudflare за месяц дошли до порога предупреждения (по умолчанию 700 ГБ из бесплатных 1000). Что делать: ничего срочного; дальше 0,05 $ за ГБ. Порог меняется в админке → Настройки (usage.cloudflare_egress_warn_gb). EN: Cloudflare Realtime egress passed the warning threshold."
    }
    usage_cf_crit = {
      metric = "UsageCfCrit"
      page   = true
      text   = "Звонки Cloudflare за месяц дошли до 950 ГБ из бесплатных 1000, дальше платно (0,05 $ за ГБ). Что делать: напишите Claude «трафик звонков», он посмотрит, кто тратит. EN: Cloudflare Realtime egress is about to leave the free 1000 GB."
    }
    usage_bunny_bandwidth_warn = {
      metric = "UsageBunnyBandwidthWarn"
      page   = false
      text   = "Трафик видео Bunny за месяц превысил порог предупреждения. Пороги: админка → Настройки (usage.bunny_bandwidth_warn_gb). EN: Bunny CDN traffic passed the warning threshold."
    }
    usage_bunny_bandwidth_crit = {
      metric = "UsageBunnyBandwidthCrit"
      page   = true
      text   = "Трафик видео Bunny за месяц превысил срочный порог. Что делать: напишите Claude «трафик видео». Сразу можно снизить rate_limit.video_upload_per_day в админке. EN: Bunny CDN traffic passed the urgent threshold."
    }
    usage_bunny_storage_warn = {
      metric = "UsageBunnyStorageWarn"
      page   = false
      text   = "Хранилище видео Bunny выросло выше порога предупреждения (usage.bunny_storage_warn_gb). EN: Bunny storage passed the warning threshold."
    }
    usage_bunny_storage_crit = {
      metric = "UsageBunnyStorageCrit"
      page   = true
      text   = "Хранилище видео Bunny выросло выше срочного порога (usage.bunny_storage_crit_gb). Что делать: напишите Claude «хранилище видео». EN: Bunny storage passed the urgent threshold."
    }
    usage_poll_failed = {
      metric = "UsagePollFailed"
      page   = false
      text   = "Ежедневная проверка расхода Cloudflare/Bunny не смогла получить данные (ключ устарел или сервис не ответил). Что делать: админка → Безопасность → Ключи и сервисы, проверьте токен аналитики Cloudflare и ключ аккаунта Bunny. EN: the daily usage poll failed."
    }
  }
  alarm_name          = "${var.name}-${replace(each.key, "_", "-")}"
  alarm_description   = "LawBid: ${each.value.text}"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 86400
  threshold           = 1
  statistic           = "Sum"
  metric_name         = each.value.metric
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = each.value.page ? local.page : local.ops
  tags                = var.tags

  depends_on = [aws_cloudwatch_log_metric_filter.usage_alert]
}

# --- WAF request counts: AWS WAF is billed per inspected request, so a flood
# costs money even when every request is blocked. One alarm per web ACL on
# the day's total (allowed + blocked). Cents, listed in the cost registry.
resource "aws_cloudwatch_metric_alarm" "waf_alb_requests" {
  count               = var.waf_alb_acl_name != "" && var.waf_alb_requests_per_day > 0 ? 1 : 0
  alarm_name          = "${var.name}-waf-alb-requests"
  alarm_description   = "LawBid: Фильтр атак перед сервером (WAF) за сутки проверил больше ${var.waf_alb_requests_per_day} запросов — каждый миллион стоит 0,60 $, в том числе заблокированные. Что делать: ничего срочного; посмотрите в админке «Расходы» и в AWS WAF → Web ACLs, не наплыв ли ботов; при атаке правила уже режут лишнее. Инструкция: ${var.runbook_base_url}/COST_LADDER.md (EN: ALB web ACL inspected over ${var.waf_alb_requests_per_day} requests in 24 h.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = var.waf_alb_requests_per_day
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags

  metric_query {
    id = "allowed"
    metric {
      metric_name = "AllowedRequests"
      namespace   = "AWS/WAFV2"
      period      = 86400
      stat        = "Sum"
      dimensions  = { WebACL = var.waf_alb_acl_name, Region = data.aws_region.current.name, Rule = "ALL" }
    }
  }
  metric_query {
    id = "blocked"
    metric {
      metric_name = "BlockedRequests"
      namespace   = "AWS/WAFV2"
      period      = 86400
      stat        = "Sum"
      dimensions  = { WebACL = var.waf_alb_acl_name, Region = data.aws_region.current.name, Rule = "ALL" }
    }
  }
  metric_query {
    id          = "total"
    expression  = "FILL(allowed, 0) + FILL(blocked, 0)"
    label       = "WAF requests (ALB)"
    return_data = true
  }
}

resource "aws_cloudwatch_metric_alarm" "waf_cdn_requests" {
  count               = var.waf_cdn_acl_name != "" && var.waf_cdn_requests_per_day > 0 ? 1 : 0
  alarm_name          = "${var.name}-waf-cdn-requests"
  alarm_description   = "LawBid: Фильтр атак на раздаче файлов (WAF CloudFront) за сутки проверил больше ${var.waf_cdn_requests_per_day} запросов — каждый миллион стоит 0,60 $. Что делать: ничего срочного; посмотрите в админке «Расходы», не качает ли кто-то файлы массово. Инструкция: ${var.runbook_base_url}/COST_LADDER.md (EN: CloudFront web ACL inspected over ${var.waf_cdn_requests_per_day} requests in 24 h.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = var.waf_cdn_requests_per_day
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags

  metric_query {
    id = "allowed"
    metric {
      metric_name = "AllowedRequests"
      namespace   = "AWS/WAFV2"
      period      = 86400
      stat        = "Sum"
      dimensions  = { WebACL = var.waf_cdn_acl_name, Region = "Global", Rule = "ALL" }
    }
  }
  metric_query {
    id = "blocked"
    metric {
      metric_name = "BlockedRequests"
      namespace   = "AWS/WAFV2"
      period      = 86400
      stat        = "Sum"
      dimensions  = { WebACL = var.waf_cdn_acl_name, Region = "Global", Rule = "ALL" }
    }
  }
  metric_query {
    id          = "total"
    expression  = "FILL(allowed, 0) + FILL(blocked, 0)"
    label       = "WAF requests (CloudFront)"
    return_data = true
  }
}

# --- CloudFront bytes downloaded per distribution (V6): the biggest variable
# bill after the free 1 TB. The alarm is the early warning; the hard stop is
# a WAF rate rule or signed URLs (docs/runbooks/COST_LADDER.md, "Раздача
# файлов"). CloudFront metrics live in us-east-1, the stack's region.
resource "aws_cloudwatch_metric_alarm" "cloudfront_bytes" {
  for_each            = var.cloudfront_gb_per_day_alarm > 0 ? var.cloudfront_distribution_ids : {}
  alarm_name          = "${var.name}-cloudfront-bytes-${each.key}"
  alarm_description   = "LawBid: Раздача файлов (CloudFront «${each.key}») за сутки отдала больше ${var.cloudfront_gb_per_day_alarm} ГБ. Бесплатно 1 ТБ в месяц, дальше около 0,085 $ за ГБ. Что делать: ничего срочного; админка → «Расходы» → «Раздача файлов»; если это наплыв, снизьте cdn_waf_rate_limit_per_5m или переведите фото на Bunny/R2 (growth.cdn_images_provider, media.public_store). Инструкция: ${var.runbook_base_url}/COST_LADDER.md (EN: distribution ${each.value} served over ${var.cloudfront_gb_per_day_alarm} GB in 24 h.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 86400
  threshold           = var.cloudfront_gb_per_day_alarm * 1073741824
  statistic           = "Sum"
  metric_name         = "BytesDownloaded"
  namespace           = "AWS/CloudFront"
  dimensions          = { DistributionId = each.value, Region = "Global" }
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags
}
