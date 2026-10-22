# Owner 2026-10-22 (audit #4 §7): business SLO alerts and an uptime canary.
#
# The API and the worker write one `{metric: "slo", ...}` log line a minute
# (apps/api/src/common/ops/slo-metrics.service.ts): signups, OTP SMS sent /
# verified, calls connected / failed, pushes delivered / failed. The metric
# filters below turn them into CloudWatch metrics; the alarms follow the
# Google SRE workbook "Alerting on SLOs" multiwindow, multi-burn-rate
# recipe: page when the error budget burns 14.4× too fast over 1 h AND the
# last 5 min (2 % of a 30-day budget in an hour), or 6× over 6 h AND the
# last 30 min (5 % in 6 h). Both windows must agree, so a short spike that
# is already over does not page. Below `slo_min_events` events in a window
# the error rate counts as 0 (a quiet night is not an outage).

variable "slo_targets" {
  description = "SLO targets (share of good events) per business flow."
  type = object({
    otp  = number
    call = number
    push = number
  })
  default = { otp = 0.95, call = 0.95, push = 0.98 }
}

variable "slo_min_events" {
  description = "Fewer events than this in a window = no alarm (noise guard)."
  type        = number
  default     = 20
}

variable "min_daily_signups" {
  description = "Alarm when fewer signups than this happen in 24 h (0 = off; set after launch)."
  type        = number
  default     = 0
}

variable "canary_url" {
  description = "HTTPS URL the uptime canary calls (the API readiness probe); null = no canary."
  type        = string
  default     = null
}

variable "canary_runtime" {
  description = "CloudWatch Synthetics runtime (aws synthetics describe-runtime-versions)."
  type        = string
  default     = "syn-nodejs-puppeteer-9.1"
}

variable "canary_schedule" {
  description = "How often the canary runs. rate(5 minutes) ≈ 8 640 runs a month ≈ $10.4 at $0.0012 a run."
  type        = string
  default     = "rate(5 minutes)"
}

locals {
  slo_counters = {
    signup        = "SloSignup"
    otpSent       = "SloOtpSent"
    otpVerified   = "SloOtpVerified"
    callConnected = "SloCallConnected"
    callFailed    = "SloCallFailed"
    pushOk        = "SloPushOk"
    pushFailed    = "SloPushFailed"
  }
  slo_log_groups = {
    api    = var.api_log_group
    worker = var.worker_log_group
  }
  slo_filters = {
    for pair in setproduct(keys(local.slo_counters), keys(local.slo_log_groups)) :
    "${pair[0]}-${pair[1]}" => { counter = pair[0], group = pair[1] }
  }

  # good = the healthy events, bad = the failed ones (OTP: sent but never
  # verified — a code that did not arrive).
  slos = {
    otp = {
      good   = "SloOtpVerified"
      total  = "SloOtpSent"
      bad    = null
      target = var.slo_targets.otp
      text   = "LawBid: SMS-коды доходят хуже обычного — люди не могут войти. Что делать: проверить Twilio (баланс, ошибки доставки, страну) и лимиты SMS в админке. Инструкция: ${var.runbook_base_url}/slo.md (EN: OTP SMS verified/sent is burning its error budget.)"
    }
    call = {
      good   = "SloCallConnected"
      total  = null
      bad    = "SloCallFailed"
      target = var.slo_targets.call
      text   = "LawBid: Звонки не соединяются (видео/аудио не поднимается). Что делать: проверить TURN-сервер и его нагрузку. Инструкция: ${var.runbook_base_url}/slo.md (EN: Call connect rate is burning its error budget; check TURN.)"
    }
    push = {
      good   = "SloPushOk"
      total  = null
      bad    = "SloPushFailed"
      target = var.slo_targets.push
      text   = "LawBid: Пуш-уведомления не доходят. Что делать: проверить ключ Firebase (FCM) в админке → Интеграции и статус Firebase. Инструкция: ${var.runbook_base_url}/slo.md (EN: Push delivery failures are burning the error budget; check FCM.)"
    }
  }
  slo_windows = {
    fast_long  = { period = 3600, factor = 14.4, pair = "fast" }
    fast_short = { period = 300, factor = 14.4, pair = "fast" }
    slow_long  = { period = 21600, factor = 6, pair = "slow" }
    slow_short = { period = 1800, factor = 6, pair = "slow" }
  }
  slo_alarms = {
    for pair in setproduct(keys(local.slos), keys(local.slo_windows)) :
    "${pair[0]}-${pair[1]}" => {
      slo    = pair[0]
      window = pair[1]
    }
  }
}

resource "aws_cloudwatch_log_metric_filter" "slo" {
  for_each       = local.slo_filters
  name           = "${var.name}-slo-${each.key}"
  log_group_name = local.slo_log_groups[each.value.group]
  pattern        = "{ $.metric = \"slo\" }"
  metric_transformation {
    name          = local.slo_counters[each.value.counter]
    namespace     = local.ns
    value         = "$.${each.value.counter}"
    default_value = null
    unit          = "Count"
  }
}

# One alarm per (SLO, window): error rate above factor × error budget.
resource "aws_cloudwatch_metric_alarm" "slo_burn" {
  for_each            = local.slo_alarms
  alarm_name          = "${var.name}-slo-${each.key}"
  alarm_description   = "Burn-rate window ${each.value.window} of the ${each.value.slo} SLO (part of ${var.name}-slo-${each.value.slo}-${local.slo_windows[each.value.window].pair})."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold = min(
    1,
    local.slo_windows[each.value.window].factor * (1 - local.slos[each.value.slo].target),
  )
  treat_missing_data = "notBreaching"
  tags               = var.tags

  metric_query {
    id = "good"
    metric {
      metric_name = local.slos[each.value.slo].good
      namespace   = local.ns
      period      = local.slo_windows[each.value.window].period
      stat        = "Sum"
    }
  }
  metric_query {
    id = "other"
    metric {
      metric_name = coalesce(local.slos[each.value.slo].total, local.slos[each.value.slo].bad)
      namespace   = local.ns
      period      = local.slo_windows[each.value.window].period
      stat        = "Sum"
    }
  }
  metric_query {
    id          = "total"
    expression  = local.slos[each.value.slo].total != null ? "FILL(other, 0)" : "FILL(good, 0) + FILL(other, 0)"
    label       = "events"
    return_data = false
  }
  metric_query {
    id          = "err"
    expression  = "IF(total >= ${var.slo_min_events}, MAX([0, total - FILL(good, 0)]) / total, 0)"
    label       = "error rate"
    return_data = true
  }
}

# Page only when the long and the short window agree.
resource "aws_cloudwatch_composite_alarm" "slo" {
  for_each = {
    for pair in setproduct(keys(local.slos), ["fast", "slow"]) :
    "${pair[0]}-${pair[1]}" => { slo = pair[0], pair = pair[1] }
  }
  alarm_name        = "${var.name}-slo-${each.key}"
  alarm_description = local.slos[each.value.slo].text
  alarm_rule        = "ALARM(\"${aws_cloudwatch_metric_alarm.slo_burn["${each.value.slo}-${each.value.pair}_long"].alarm_name}\") AND ALARM(\"${aws_cloudwatch_metric_alarm.slo_burn["${each.value.slo}-${each.value.pair}_short"].alarm_name}\")"
  alarm_actions     = local.ops
  ok_actions        = local.ops
  tags              = var.tags
}

# Signups stopped (a broken sign-up screen, SMS or store listing).
resource "aws_cloudwatch_metric_alarm" "signups_low" {
  count               = var.min_daily_signups > 0 ? 1 : 0
  alarm_name          = "${var.name}-slo-signups-low"
  alarm_description   = "LawBid: За сутки почти нет новых регистраций. Что делать: открыть приложение и пройти регистрацию самому (SMS, экран входа), проверить магазины. Инструкция: ${var.runbook_base_url}/slo.md (EN: Fewer signups than min_daily_signups in 24 h.)"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  period              = 86400
  threshold           = var.min_daily_signups
  statistic           = "Sum"
  metric_name         = "SloSignup"
  namespace           = local.ns
  treat_missing_data  = "breaching"
  alarm_actions       = local.ops
  tags                = var.tags
}

# --- uptime canary (CloudWatch Synthetics) ---------------------------------
# Calls the API readiness probe from outside every 5 minutes, like a user
# would; the ALB alarms only see traffic that reaches the ALB. Cost: about
# $10 a month at rate(5 minutes) (+ a few cents of S3 / Lambda); a Route 53
# HTTPS health check (~$2.50 a month, metrics only in us-east-1) is the
# cheaper alternative if the region allows it.
locals {
  canary_on = var.canary_url != null
}

data "aws_region" "current" {}

resource "aws_s3_bucket" "canary" {
  count         = local.canary_on ? 1 : 0
  bucket        = "${var.name}-canary-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
  tags          = var.tags
}

resource "aws_s3_bucket_public_access_block" "canary" {
  count                   = local.canary_on ? 1 : 0
  bucket                  = aws_s3_bucket.canary[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "canary" {
  count  = local.canary_on ? 1 : 0
  bucket = aws_s3_bucket.canary[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "canary" {
  count  = local.canary_on ? 1 : 0
  bucket = aws_s3_bucket.canary[0].id
  rule {
    id     = "expire-runs"
    status = "Enabled"
    filter {}
    expiration {
      days = 14
    }
  }
}

resource "aws_iam_role" "canary" {
  count = local.canary_on ? 1 : 0
  name  = "${var.name}-canary"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy" "canary" {
  count = local.canary_on ? 1 : 0
  name  = "canary"
  role  = aws_iam_role.canary[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "${aws_s3_bucket.canary[0].arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetBucketLocation", "s3:ListAllMyBuckets"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/cwsyn-*"
      },
      {
        Effect    = "Allow"
        Action    = "cloudwatch:PutMetricData"
        Resource  = "*"
        Condition = { StringEquals = { "cloudwatch:namespace" = "CloudWatchSynthetics" } }
      },
    ]
  })
}

data "archive_file" "canary" {
  count       = local.canary_on ? 1 : 0
  type        = "zip"
  output_path = "${path.module}/.canary-${var.name}.zip"
  source {
    filename = "nodejs/node_modules/uptime.js"
    content  = <<-JS
      // Owner 2026-10-22: GET the readiness probe; any non-2xx fails the run.
      const synthetics = require('Synthetics');
      const https = require('https');
      const url = new URL(process.env.CANARY_URL);
      exports.handler = async () =>
        synthetics.executeStep('health', () =>
          new Promise((resolve, reject) => {
            const req = https.get(
              { hostname: url.hostname, path: url.pathname + url.search, timeout: 10000,
                headers: { 'User-Agent': 'LawBid-uptime-canary' } },
              (res) => {
                res.resume();
                if (res.statusCode >= 200 && res.statusCode < 300) resolve();
                else reject(new Error('HTTP ' + res.statusCode));
              },
            );
            req.on('timeout', () => req.destroy(new Error('timeout')));
            req.on('error', reject);
          }),
        );
    JS
  }
}

resource "aws_synthetics_canary" "uptime" {
  count                = local.canary_on ? 1 : 0
  name                 = substr(replace("${var.name}-up", "_", "-"), 0, 21)
  artifact_s3_location = "s3://${aws_s3_bucket.canary[0].bucket}/runs"
  execution_role_arn   = aws_iam_role.canary[0].arn
  handler              = "uptime.handler"
  zip_file             = data.archive_file.canary[0].output_path
  runtime_version      = var.canary_runtime
  start_canary         = true
  schedule {
    expression = var.canary_schedule
  }
  run_config {
    timeout_in_seconds = 30
    environment_variables = {
      CANARY_URL = var.canary_url
    }
  }
  success_retention_period = 2
  failure_retention_period = 14
  tags                     = var.tags
}

resource "aws_cloudwatch_metric_alarm" "canary" {
  count               = local.canary_on ? 1 : 0
  alarm_name          = "${var.name}-uptime-canary"
  alarm_description   = "LawBid: Сервер не отвечает снаружи (проверка каждые 5 минут). Что делать: открыть ${var.canary_url}; если не открывается — смотреть ECS-задачи API, базу и Redis. Инструкция: ${var.runbook_base_url}/api-unhealthy.md (EN: The external uptime canary failed twice in a row.)"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  period              = 300
  threshold           = 100
  statistic           = "Average"
  metric_name         = "SuccessPercent"
  namespace           = "CloudWatchSynthetics"
  dimensions = {
    CanaryName = aws_synthetics_canary.uptime[0].name
  }
  treat_missing_data = "breaching"
  alarm_actions      = local.ops
  ok_actions         = local.ops
  tags               = var.tags
}
