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
variable "runbook_base_url" {
  type    = string
  default = "https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks"
}
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
  alarm_description   = "LawBid: Быстрая память (Redis) заполнена больше чем на 80 %. Что делать: Держится больше суток — увеличьте Redis при следующем «ставь на AWS». Данные не теряются. Инструкция: ${var.runbook_base_url}/redis.md (EN: Redis memory > 80%.)"
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
resource "aws_cloudwatch_metric_alarm" "service_running_tasks" {
  for_each = {
    api    = var.api_service_name
    worker = var.worker_service_name
  }
  alarm_name          = "${var.name}-${each.key}-no-running-tasks"
  alarm_description   = "LawBid: Сервер ${each.key} не запущен ни разу. Что делать: AWS пытается запустить его сам. Не прошло за 10 минут — GitHub → Actions → «Rollback production» на прошлую версию. Инструкция: ${var.runbook_base_url}/ecs-capacity.md (EN: ${each.key} has no running ECS tasks.)"
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
# ops-guard.job.ts). CockroachDB Cloud is outside AWS, so this is how its
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
    cost_ceiling = "CostCeilingReached"
    backup_stale = "BackupStale"
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
  alarm_description   = "LawBid: База данных не отвечает 3 минуты подряд. Что делать: приложение переподключится само, когда база вернётся. Откройте CockroachDB Cloud → Status: если там авария, её чинит провайдер. Инструкция: ${var.runbook_base_url}/db-redis-unavailable.md (EN: db_health ok=0 for 3 minutes.)"
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
  alarm_description   = "LawBid: Нет свежей резервной копии базы (старше 26 часов) или проверка не смогла её найти. Что делать: откройте CockroachDB Cloud → Backups. Есть ошибка — напишите в их поддержку (бэкапы делают они) или Claude «бэкап». Инструкция: ${var.runbook_base_url}/backup-failed.md (EN: newest CockroachDB Cloud backup is stale.)"
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
