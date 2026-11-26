# Б1 (25.11, docs/dev/STAGE2_SRE_CLOUD_2026-11-25.md): error budget left over
# the last 28 days, per SLO, and the alarms the release gate reads.
#
# Google SRE Workbook, ch. 2 + appendix "Example Error Budget Policy": when an
# SLO has spent its budget over the preceding four weeks, only fixes and
# security changes ship (docs/runbooks/error-budget-policy.md,
# scripts/deploy/budget-gate.sh in deploy.yml).
#
# Why a function and not a plain alarm: CloudWatch alarms look back at most
# 7 days (PutMetricAlarm: Period x EvaluationPeriods <= 604 800 s), and the
# managed AWS Application Signals SLO (rolling 28-day budget) has no Terraform
# resource in the AWS provider 6.72. The function sums the SAME metrics as
# the burn-rate alarms once an hour and writes `SloBudgetRemaining` (1 = all
# left, 0 = spent) with dimension Slo = otp / call / push / login / message /
# feed / pay / availability.
#
# Cost: 8 custom metrics x $0.30 + 8 alarms x $0.10 + about 720 GetMetricData
# calls a month (~$0.15) = about $3.40 a month; the Lambda stays in the free tier.

variable "error_budget_enabled" {
  type        = bool
  default     = true
  description = "Б1: 28-day error budget per SLO + `<env>-slo-<flow>-budget-exhausted` alarms (mail only) that the release gate reads. false = no function, no alarms (the gate then always passes)."
}
variable "error_budget_window_days" {
  type        = number
  default     = 28
  description = "Б1: the rolling window of the error budget (SRE Workbook: four weeks)."
}
variable "error_budget_min_events" {
  type        = number
  default     = 100
  description = "Б1: fewer events than this in the window = the budget counts as full (a quiet month is not an outage)."
}
variable "error_budget_schedule" {
  type        = string
  default     = "rate(1 hour)"
  description = "Б1: how often the budget is measured."
}

locals {
  eb_on = var.error_budget_enabled
  # Same inputs as slo.tf (good / total / bad counters) and observability.tf
  # (availability: ALB target 5xx / requests, both api groups during an ECS canary).
  eb_slos = merge(
    {
      for k, s in local.slos : k => {
        target = s.target
        good   = [{ ns = local.ns, name = s.good }]
        total  = s.total == null ? [] : [{ ns = local.ns, name = s.total }]
        bad    = s.bad == null ? [] : [{ ns = local.ns, name = s.bad }]
      }
    },
    {
      availability = {
        target = var.availability_slo_target
        good   = []
        bad    = [for q in local.api_5xx_series : { ns = "AWS/ApplicationELB", name = q.m, dims = { LoadBalancer = var.alb_arn_suffix, TargetGroup = q.tg } } if q.m == "HTTPCode_Target_5XX_Count"]
        total  = [for q in local.api_5xx_series : { ns = "AWS/ApplicationELB", name = q.m, dims = { LoadBalancer = var.alb_arn_suffix, TargetGroup = q.tg } } if q.m == "RequestCount"]
      }
    },
  )
  eb_labels = {
    otp          = "SMS-коды входа"
    call         = "звонки"
    push         = "пуш-уведомления"
    login        = "вход"
    message      = "отправка сообщений"
    feed         = "открытие ленты"
    pay          = "платежи"
    availability = "доступность API (ответы без 5xx)"
  }
  eb_fn = "${var.name}-error-budget"
}

data "archive_file" "error_budget" {
  count       = local.eb_on ? 1 : 0
  type        = "zip"
  source_file = "${path.module}/lambda/error-budget/handler.py"
  output_path = "${path.module}/.error-budget-${var.name}.zip"
}

resource "aws_cloudwatch_log_group" "error_budget" {
  count             = local.eb_on ? 1 : 0
  name              = "/aws/lambda/${local.eb_fn}"
  retention_in_days = 14
  tags              = var.tags
}

resource "aws_iam_role" "error_budget" {
  count                = local.eb_on ? 1 : 0
  permissions_boundary = var.permissions_boundary_arn
  name                 = local.eb_fn
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

resource "aws_iam_role_policy" "error_budget" {
  count = local.eb_on ? 1 : 0
  name  = "error-budget"
  role  = aws_iam_role.error_budget[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = "cloudwatch:GetMetricData", Resource = "*" },
      {
        Effect    = "Allow"
        Action    = "cloudwatch:PutMetricData"
        Resource  = "*"
        Condition = { StringEquals = { "cloudwatch:namespace" = local.ns } }
      },
      { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.error_budget[0].arn}:*" },
    ]
  })
}

resource "aws_lambda_function" "error_budget" {
  count            = local.eb_on ? 1 : 0
  function_name    = local.eb_fn
  description      = "Error budget left over the last ${var.error_budget_window_days} days per SLO (SRE Workbook)"
  role             = aws_iam_role.error_budget[0].arn
  runtime          = "python3.14"
  architectures    = ["arm64"]
  handler          = "handler.lambda_handler"
  filename         = data.archive_file.error_budget[0].output_path
  source_code_hash = data.archive_file.error_budget[0].output_base64sha256
  timeout          = 60
  memory_size      = 128
  environment {
    variables = {
      NAMESPACE   = local.ns
      SLOS        = jsonencode(local.eb_slos)
      WINDOW_DAYS = tostring(var.error_budget_window_days)
      MIN_EVENTS  = tostring(var.error_budget_min_events)
    }
  }
  tags       = var.tags
  depends_on = [aws_cloudwatch_log_group.error_budget, aws_iam_role_policy.error_budget]
}

# Scheduler -> Lambda, no retries (the next hour is the retry), as in modules/endpoints-autoscale.
resource "aws_iam_role" "error_budget_scheduler" {
  count                = local.eb_on ? 1 : 0
  permissions_boundary = var.permissions_boundary_arn
  name                 = "${local.eb_fn}-scheduler"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id } }
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy" "error_budget_scheduler" {
  count = local.eb_on ? 1 : 0
  role  = aws_iam_role.error_budget_scheduler[0].id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "lambda:InvokeFunction", Resource = aws_lambda_function.error_budget[0].arn }]
  })
}

resource "aws_scheduler_schedule" "error_budget" {
  count               = local.eb_on ? 1 : 0
  name                = "${local.eb_fn}-tick"
  description         = "Error budget: measure the last ${var.error_budget_window_days} days"
  schedule_expression = var.error_budget_schedule
  flexible_time_window { mode = "OFF" }
  target {
    arn      = aws_lambda_function.error_budget[0].arn
    role_arn = aws_iam_role.error_budget_scheduler[0].arn
    input    = jsonencode({ mode = "tick" })
    retry_policy {
      maximum_retry_attempts       = 0
      maximum_event_age_in_seconds = 300
    }
  }
}

resource "aws_lambda_function_event_invoke_config" "error_budget" {
  count                        = local.eb_on ? 1 : 0
  function_name                = aws_lambda_function.error_budget[0].function_name
  maximum_retry_attempts       = 0
  maximum_event_age_in_seconds = 300
}

# One alarm per SLO: the budget of the last 28 days is spent (<= 0). Mail only:
# a spent budget is a decision for the release process, not a 3 a.m. page
# (the burn-rate alarms in slo.tf / observability.tf page for the outage itself).
resource "aws_cloudwatch_metric_alarm" "budget_exhausted" {
  for_each            = { for k, v in local.eb_slos : k => v if local.eb_on }
  alarm_name          = "${var.name}-slo-${each.key}-budget-exhausted"
  alarm_description   = "LawBid: Запас ошибок за ${var.error_budget_window_days} дней по «${local.eb_labels[each.key]}» израсходован (цель ${format("%g", each.value.target * 100)} %). По политике запаса ошибок выкатка новых функций останавливается сама, проходят только исправления (коммит «fix:», «revert:», «security:»). Что делать: найти причину сбоев и выпустить исправление; обход только по решению владельца — переменная репозитория BUDGET_GATE=off. Инструкция: ${var.runbook_base_url}/error-budget-policy.md (EN: ${each.key} SLO error budget over ${var.error_budget_window_days} days is spent; feature releases are halted.)"
  comparison_operator = "LessThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 3600
  threshold           = 0
  statistic           = "Minimum"
  metric_name         = "SloBudgetRemaining"
  namespace           = local.ns
  dimensions          = { Slo = each.key }
  # No number this hour (the function failed) = keep the last state.
  treat_missing_data = "ignore"
  alarm_actions      = local.ops
  ok_actions         = local.ops
  tags               = var.tags
}

resource "aws_cloudwatch_metric_alarm" "error_budget_errors" {
  count               = local.eb_on ? 1 : 0
  alarm_name          = "${local.eb_fn}-errors"
  alarm_description   = "LawBid: Подсчёт запаса ошибок за ${var.error_budget_window_days} дней не работает три часа подряд — тревоги «budget-exhausted» и проверка перед выкаткой видят старое значение. Ничего не сломано. Что делать: CloudWatch → Log groups → /aws/lambda/${local.eb_fn}, текст ошибки; при повторе напишите Claude «запас ошибок». Инструкция: ${var.runbook_base_url}/error-budget-policy.md (EN: error-budget Lambda errors.)"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 10800
  threshold           = 3
  statistic           = "Sum"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  dimensions          = { FunctionName = aws_lambda_function.error_budget[0].function_name }
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

output "error_budget_alarm_names" {
  description = "Б1: the alarms scripts/deploy/budget-gate.sh reads (prefix <name>-slo-, suffix -budget-exhausted)."
  value       = [for a in aws_cloudwatch_metric_alarm.budget_exhausted : a.alarm_name]
}
