# Owner 2026-11-12 (row 67): every ECS service keeps one regular Fargate task
# (base 1) and runs the tasks autoscaling adds mostly on Fargate Spot
# (FARGATE 1 : FARGATE_SPOT 4). ECS does NOT fall back to regular Fargate
# when Spot has no capacity (AWS ECS developer guide, "Fargate capacity
# providers": "Fargate doesn't replace Spot capacity with on-demand
# capacity"), so this Lambda does:
#
#   EventBridge rule  "ECS Service Action" SERVICE_TASK_PLACEMENT_FAILURE on
#                     FARGATE_SPOT -> that service: FARGATE only + rolling
#                     deployment (the missing tasks start on regular Fargate)
#   Scheduler 5 min   backstop for a missed event (running < desired next to a
#                     "Capacity is unavailable" service event) and the way
#                     back: after a quiet hold (30 min, doubled per repeat,
#                     at most 6 h) the normal weights + a rolling deployment
#                     move the tasks back to Spot without downtime.
#
# The services ignore capacity_provider_strategy in Terraform (modules/ecs,
# modules/pgbouncer) so an apply never undoes a fallback; the weights here
# are the source of truth and the tick brings a service back to them.
# Switch (on | dry-run | off) in SSM; the owner's admin control
# `scale.spot_fallback.mode` (off | on | auto) in ops/scale-controls.json.
terraform {
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 5.60" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }
}

variable "name" { type = string }
variable "cluster_name" { type = string }
variable "cluster_arn" { type = string }
variable "services" {
  type = map(object({
    arn     = string
    base    = number
    fargate = number
    spot    = number
  }))
  description = "ECS services on Fargate Spot (name => service ARN and the normal strategy). Empty = nothing to watch."
}
variable "alerts_topic_arn" { type = string }
variable "kms_key_arn" {
  type    = string
  default = null
}
variable "controls_bucket" {
  type    = string
  default = ""
}
variable "controls_key" {
  type    = string
  default = "ops/scale-controls.json"
}
variable "mode" {
  type        = string
  default     = "on"
  description = "Start value of the switch: on | dry-run (e-mails what it would do) | off. Changed later in SSM."
  validation {
    condition     = contains(["on", "dry-run", "off"], var.mode)
    error_message = "mode: on, dry-run or off."
  }
}
variable "tuning" {
  type        = map(number)
  default     = {}
  description = "Overrides of decision.Config, e.g. { restore_after_min = 60, max_hold_min = 720 }."
}
variable "schedule" {
  type    = string
  default = "rate(5 minutes)"
}
variable "log_retention_days" {
  type    = number
  default = 30
}
variable "tags" {
  type    = map(string)
  default = {}
}

data "aws_caller_identity" "current" {}

locals {
  prefix  = "/${var.name}/spot-fallback"
  fn_name = "${var.name}-spot-fallback"
}

resource "aws_ssm_parameter" "mode" {
  name        = "${local.prefix}/mode"
  type        = "String"
  value       = var.mode
  description = "Fargate Spot fallback switch: on | dry-run | off. Read on every run; changing it here after creation is ignored."
  tags        = var.tags
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "state" {
  name        = "${local.prefix}/state"
  type        = "String"
  value       = "{}"
  description = "Per service: since when on regular Fargate, last Spot failure, repeats (written by the Lambda)."
  tags        = var.tags
  lifecycle { ignore_changes = [value] }
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  excludes    = ["tests", "tests/test_decision.py", "tests/test_handler.py", "__pycache__", "tests/__pycache__"]
  output_path = "${path.module}/.spot-fallback-${var.name}.zip"
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.fn_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
  tags              = var.tags
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = local.fn_name
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "lambda" {
  statement {
    sid       = "ChangeOnlyTheSpotServices"
    actions   = ["ecs:DescribeServices", "ecs:UpdateService"]
    resources = length(var.services) > 0 ? [for s in values(var.services) : s.arn] : ["arn:aws:ecs:*:${data.aws_caller_identity.current.account_id}:service/${var.cluster_name}/none"]
  }
  statement {
    sid       = "PublishToAlerts"
    actions   = ["sns:Publish"]
    resources = [var.alerts_topic_arn]
  }
  dynamic "statement" {
    for_each = var.kms_key_arn == null ? [] : [1]
    content {
      sid       = "AlertsTopicKey"
      actions   = ["kms:GenerateDataKey", "kms:Decrypt"]
      resources = [var.kms_key_arn]
    }
  }
  dynamic "statement" {
    for_each = var.controls_bucket == "" ? [] : [1]
    content {
      sid       = "ReadOwnerControl"
      actions   = ["s3:GetObject"]
      resources = ["arn:aws:s3:::${var.controls_bucket}/${var.controls_key}"]
    }
  }
  statement {
    sid       = "SwitchAndState"
    actions   = ["ssm:GetParameter", "ssm:PutParameter"]
    resources = [aws_ssm_parameter.mode.arn, aws_ssm_parameter.state.arn]
  }
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.lambda.arn}:*"]
  }
}

resource "aws_iam_role_policy" "lambda" {
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda.json
}

resource "aws_lambda_function" "this" {
  function_name    = local.fn_name
  description      = "Fargate Spot without capacity: tasks on regular Fargate; back to Spot after a quiet hold"
  role             = aws_iam_role.lambda.arn
  runtime          = "python3.12"
  architectures    = ["arm64"]
  handler          = "handler.lambda_handler"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  timeout          = 60
  memory_size      = 128
  # No reserved concurrency (a new account's limit of 10 refuses it). Two
  # runs at once at worst both send the same UpdateService; the decision
  # reads the live strategy each time, so a repeat is harmless.

  environment {
    variables = {
      CLUSTER         = var.cluster_name
      SERVICES        = jsonencode({ for k, s in var.services : k => { base = s.base, fargate = s.fargate, spot = s.spot } })
      MODE_PARAM      = aws_ssm_parameter.mode.name
      STATE_PARAM     = aws_ssm_parameter.state.name
      TOPIC_ARN       = var.alerts_topic_arn
      CONTROLS_BUCKET = var.controls_bucket
      CONTROLS_KEY    = var.controls_key
      TUNING          = jsonencode(var.tuning)
    }
  }
  tags       = var.tags
  depends_on = [aws_cloudwatch_log_group.lambda, aws_iam_role_policy.lambda]
}

# --- the fast path: Spot placement failures of this cluster -----------------
resource "aws_cloudwatch_event_rule" "placement_failure" {
  name        = "${local.fn_name}-placement"
  description = "ECS could not place a task (Fargate Spot without capacity): the spot-fallback Lambda moves the service to regular Fargate"
  event_pattern = jsonencode({
    source        = ["aws.ecs"]
    "detail-type" = ["ECS Service Action"]
    detail = {
      eventName  = ["SERVICE_TASK_PLACEMENT_FAILURE"]
      clusterArn = [var.cluster_arn]
    }
  })
  tags = var.tags
}

resource "aws_cloudwatch_event_target" "placement_failure" {
  rule = aws_cloudwatch_event_rule.placement_failure.name
  arn  = aws_lambda_function.this.arn
  retry_policy {
    maximum_retry_attempts       = 2
    maximum_event_age_in_seconds = 600
  }
}

resource "aws_lambda_permission" "events" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.placement_failure.arn
}

# --- the tick: backstop and the way back to Spot ----------------------------
data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${local.fn_name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy" "scheduler" {
  role = aws_iam_role.scheduler.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "lambda:InvokeFunction", Resource = aws_lambda_function.this.arn }]
  })
}

resource "aws_scheduler_schedule" "tick" {
  name                = "${local.fn_name}-tick"
  description         = "Fargate Spot fallback: backstop and back to Spot"
  schedule_expression = var.schedule
  flexible_time_window { mode = "OFF" }
  target {
    arn      = aws_lambda_function.this.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ mode = "tick" })
    retry_policy {
      maximum_retry_attempts       = 0 # the next tick is the retry
      maximum_event_age_in_seconds = 120
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "errors" {
  alarm_name          = "${local.fn_name}-errors"
  alarm_description   = "LawBid: автоматика Spot дала сбой (несколько раз подряд). Серверы работают как были; если Spot кончится, новые копии могут не запуститься. Что делать: напишите Claude «spot автомат». Инструкция: docs/runbooks/ARM64_SPOT.md (EN: spot-fallback Lambda errors)."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 1800
  threshold           = 3
  statistic           = "Sum"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  dimensions          = { FunctionName = aws_lambda_function.this.function_name }
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alerts_topic_arn]
  ok_actions          = [var.alerts_topic_arn]
  tags                = var.tags
}

output "function_name" { value = aws_lambda_function.this.function_name }
output "mode_parameter" { value = aws_ssm_parameter.mode.name }

# D1-41 (13.11): EventBridge Scheduler invokes the function asynchronously, so
# Lambda's own async retries (default 2, events kept up to 6 h) came on top of
# the Scheduler's retry_policy = 0: a refused change was tried 3 times in
# about 3 minutes, and a throttled event could run long after its tick. No
# retries here: the next tick really is the only retry.
variable "async_event_max_age_seconds" {
  type        = number
  default     = 300
  description = "Oldest async event the function still runs (60-21600 s); older ones are dropped, the next tick decides again."
}

resource "aws_lambda_function_event_invoke_config" "this" {
  function_name                = aws_lambda_function.this.function_name
  maximum_retry_attempts       = 0
  maximum_event_age_in_seconds = var.async_event_max_age_seconds
}
