# Owner 2026-10-24: the database grows and shrinks by itself, so the bill
# follows the load. Design, thresholds, prices and risks:
# docs/architecture/DB_AUTOSCALE.md; how to switch it off / force a size:
# docs/runbooks/db-autoscale.md.
#
#   EventBridge Scheduler  every 5 min  {"mode":"tick"}  -> Lambda -> one step UP when loaded
#   EventBridge Scheduler  03:30 Chicago {"mode":"night"} -> Lambda -> one step DOWN after 3 quiet days
#
# The Lambda re-reads the facts on every run (class, status, metrics, ECS
# rollouts), so no static CloudWatch alarm threshold has to follow the size
# ladder. Any change is ModifyDBInstance(ApplyImmediately) and an e-mail
# through the existing alerts topic. State (last change times) lives in an
# SSM parameter; the on / dry-run / off switch in another one.
terraform {
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 5.60" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }
}

variable "name" {
  type        = string
  description = "Stack name, e.g. lawbid-prod."
}
variable "db_instance_id" { type = string }
variable "cluster_name" {
  type        = string
  default     = ""
  description = "ECS cluster; with service_names it is checked for a rollout in progress."
}
variable "service_names" {
  type    = list(string)
  default = []
}
variable "alerts_topic_arn" { type = string }
variable "kms_key_arn" {
  type        = string
  default     = null
  description = "Key of the alerts topic (the Lambda must be allowed to publish to an encrypted topic) and of the log group."
}

variable "ladder" {
  type = list(string)
  default = [
    "db.t4g.micro", "db.t4g.small", "db.t4g.medium", "db.t4g.large",
    "db.r7g.large", "db.r7g.xlarge", "db.r7g.2xlarge",
  ]
  description = "Sizes from small to large; one step at a time. Each must exist in local.class_specs."
  validation {
    condition     = length(var.ladder) >= 2 && length(distinct(var.ladder)) == length(var.ladder)
    error_message = "ladder: at least two different sizes."
  }
}
variable "min_class" {
  type    = string
  default = "db.t4g.micro"
}
variable "max_class" {
  type        = string
  default     = "db.r7g.xlarge"
  description = "Ceiling for the bill (≈ $698/month with Multi-AZ). Above it the owner gets an e-mail and decides."
}
variable "initial_ceiling" {
  type        = string
  default     = ""
  description = "Starting value of the money ceiling (SSM max-class): the biggest size the budget allows on day 1, not above max_class. Empty = max_class. The app lowers or raises it later from the allowed spend (economy tick); it can never exceed max_class."
}
variable "mode" {
  type        = string
  default     = "on"
  description = "Start value of the switch: on | dry-run (e-mails what it would do) | off. Changed later in SSM, not here (the value is ignored after creation, so a deploy never re-enables it)."
  validation {
    condition     = contains(["on", "dry-run", "off"], var.mode)
    error_message = "mode: on, dry-run or off."
  }
}
variable "require_multi_az" {
  type        = bool
  default     = true
  description = "Resize only a Multi-AZ database (≈ 1 minute pause); a single-AZ one is down for several minutes."
}
variable "night_schedule" {
  type    = string
  default = "cron(30 3 * * ? *)"
}
variable "night_timezone" {
  type    = string
  default = "America/Chicago"
}
variable "tick_minutes" {
  type    = number
  default = 5
}
variable "tuning" {
  type        = map(number)
  default     = {}
  description = "Overrides of decision.Config numbers, e.g. { up_cpu_pct = 75, down_window_h = 96 } (infra/modules/db-autoscale/lambda/decision.py)."
}
variable "log_retention_days" {
  type    = number
  default = 30
}
variable "tags" {
  type    = map(string)
  default = {}
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  # hourly = on-demand Multi-AZ price, us-east-1, PostgreSQL (AWS Price List API,
  # 2026-10-24); monthly = hourly x 730, instance only (storage, backups extra).
  # baseline = CPU % the burstable classes can hold without spending credits.
  class_specs = {
    "db.t4g.micro"   = { vcpu = 2, memory_gib = 1, hourly = 0.032, baseline = 10 }
    "db.t4g.small"   = { vcpu = 2, memory_gib = 2, hourly = 0.065, baseline = 20 }
    "db.t4g.medium"  = { vcpu = 2, memory_gib = 4, hourly = 0.129, baseline = 20 }
    "db.t4g.large"   = { vcpu = 2, memory_gib = 8, hourly = 0.258, baseline = 30 }
    "db.r7g.large"   = { vcpu = 2, memory_gib = 16, hourly = 0.478, baseline = null }
    "db.r7g.xlarge"  = { vcpu = 4, memory_gib = 32, hourly = 0.956, baseline = null }
    "db.r7g.2xlarge" = { vcpu = 8, memory_gib = 64, hourly = 1.913, baseline = null }
  }
  ladder_json = [for c in var.ladder : {
    name       = c
    vcpu       = local.class_specs[c].vcpu
    memory_gib = local.class_specs[c].memory_gib
    # RDS default: LEAST(DBInstanceClassMemory / 9531392, 5000); ~88 % of the memory is usable.
    max_connections = min(5000, floor(local.class_specs[c].memory_gib * 1073741824 * 0.88 / 9531392))
    monthly_usd     = floor(local.class_specs[c].hourly * 730 * 100) / 100
    baseline_pct    = local.class_specs[c].baseline
  }]
  prefix    = "/${var.name}/db-autoscale"
  fn_name   = "${var.name}-db-autoscale"
  db_arn    = "arn:aws:rds:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:db:${var.db_instance_id}"
  min_index = index(var.ladder, var.min_class)
  max_index = index(var.ladder, var.max_class)
}

resource "terraform_data" "check_ladder" {
  input = var.ladder
  lifecycle {
    precondition {
      condition     = alltrue([for c in var.ladder : contains(keys(local.class_specs), c)])
      error_message = "ladder has a size without a price / spec row (local.class_specs in modules/db-autoscale/main.tf)."
    }
    precondition {
      condition     = contains(var.ladder, var.min_class) && contains(var.ladder, var.max_class) && local.min_index <= local.max_index
      error_message = "min_class and max_class must be in the ladder, min not above max."
    }
    precondition {
      condition     = var.initial_ceiling == "" || (contains(var.ladder, var.initial_ceiling) && try(index(var.ladder, var.initial_ceiling), -1) <= local.max_index && try(index(var.ladder, var.initial_ceiling), -1) >= local.min_index)
      error_message = "initial_ceiling must be in the ladder, between min_class and max_class."
    }
  }
}

resource "aws_ssm_parameter" "mode" {
  name        = "${local.prefix}/mode"
  type        = "String"
  value       = var.mode
  description = "Database autoscale switch: on | dry-run | off (docs/runbooks/db-autoscale.md). Read on every run; changing it here after creation is ignored."
  tags        = var.tags
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "max_class" {
  name        = "${local.prefix}/max-class"
  type        = "String"
  value       = var.initial_ceiling != "" ? var.initial_ceiling : var.max_class
  description = "Biggest size the money allows right now (cost registry V4). The app writes it from the allowed monthly spend; the Lambda treats it as a ceiling that can only be LOWER than max_class, never higher. Changing it here after creation is ignored."
  tags        = var.tags
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "state" {
  name        = "${local.prefix}/state"
  type        = "String"
  value       = "{}"
  description = "Database autoscale memory: the size it last saw and when it last changed (written by the Lambda)."
  tags        = var.tags
  lifecycle { ignore_changes = [value] }
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  excludes    = ["tests", "tests/test_decision.py", "tests/test_handler.py", "__pycache__"]
  output_path = "${path.module}/.db-autoscale-${var.name}.zip"
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
    sid       = "RdsThisDatabaseOnly"
    actions   = ["rds:DescribeDBInstances", "rds:ModifyDBInstance"]
    resources = [local.db_arn]
  }
  statement {
    sid       = "MetricsNoResourceScope"
    actions   = ["cloudwatch:GetMetricData"]
    resources = ["*"]
  }
  dynamic "statement" {
    for_each = var.cluster_name == "" ? [] : [1]
    content {
      sid       = "EcsRolloutsOfThisCluster"
      actions   = ["ecs:DescribeServices"]
      resources = ["arn:aws:ecs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:service/${var.cluster_name}/*"]
    }
  }
  dynamic "statement" {
    for_each = var.cluster_name == "" ? [] : [1]
    content {
      sid       = "EcsOneOffTasksOfThisCluster"
      actions   = ["ecs:ListTasks", "ecs:DescribeTasks"]
      resources = ["*"]
      condition {
        test     = "ArnEquals"
        variable = "ecs:cluster"
        values   = ["arn:aws:ecs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:cluster/${var.cluster_name}"]
      }
    }
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
  statement {
    sid       = "ModeAndState"
    actions   = ["ssm:GetParameter", "ssm:PutParameter"]
    resources = [aws_ssm_parameter.mode.arn, aws_ssm_parameter.state.arn, aws_ssm_parameter.max_class.arn]
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
  description      = "Database size follows the load (docs/architecture/DB_AUTOSCALE.md)"
  role             = aws_iam_role.lambda.arn
  runtime          = "python3.12"
  architectures    = ["arm64"]
  handler          = "handler.lambda_handler"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  timeout          = 120
  memory_size      = 256
  # No reserved concurrency: this account's Lambda limit is 10, a reservation
  # is refused below that. Overlap is harmless: RDS refuses a second modify
  # while the first runs, and the status / pending checks come first.

  environment {
    variables = {
      LADDER           = jsonencode(local.ladder_json)
      MIN_CLASS        = var.min_class
      MAX_CLASS        = var.max_class
      REQUIRE_MULTI_AZ = tostring(var.require_multi_az)
      TUNING           = jsonencode(var.tuning)
      DB_ID            = var.db_instance_id
      TOPIC_ARN        = var.alerts_topic_arn
      STATE_PARAM      = aws_ssm_parameter.state.name
      MODE_PARAM       = aws_ssm_parameter.mode.name
      MAX_CLASS_PARAM  = aws_ssm_parameter.max_class.name
      CLUSTER          = var.cluster_name
      SERVICES         = join(",", var.service_names)
      NIGHT_TZ         = var.night_timezone
    }
  }
  tags       = var.tags
  depends_on = [aws_cloudwatch_log_group.lambda, aws_iam_role_policy.lambda, terraform_data.check_ladder]
}

# --- EventBridge Scheduler: the "tick" and the night check --------------------
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
  description         = "Database autoscale: look for a reason to grow"
  schedule_expression = "rate(${var.tick_minutes} minutes)"
  flexible_time_window { mode = "OFF" }
  target {
    arn      = aws_lambda_function.this.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ mode = "tick" })
    retry_policy {
      maximum_retry_attempts       = 0 # the next tick is the retry
      maximum_event_age_in_seconds = 60
    }
  }
}

resource "aws_scheduler_schedule" "night" {
  name                         = "${local.fn_name}-night"
  description                  = "Database autoscale: night check for a reason to shrink (after 3 quiet days)"
  schedule_expression          = var.night_schedule
  schedule_expression_timezone = var.night_timezone
  flexible_time_window { mode = "OFF" }
  target {
    arn      = aws_lambda_function.this.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ mode = "night" })
    retry_policy {
      maximum_retry_attempts       = 2
      maximum_event_age_in_seconds = 3600
    }
  }
}

# The Lambda itself failing (permissions, API errors) is an e-mail, never silence.
resource "aws_cloudwatch_metric_alarm" "errors" {
  alarm_name          = "${local.fn_name}-errors"
  alarm_description   = "LawBid: автомасштабирование базы данных дало сбой (несколько раз подряд). База осталась как была, ничего не сломано. Что делать: напишите Claude «автомасштаб базы». Инструкция: docs/runbooks/db-autoscale.md (EN: db-autoscale Lambda errors)."
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
output "state_parameter" { value = aws_ssm_parameter.state.name }
output "max_class_parameter" { value = aws_ssm_parameter.max_class.name }
output "monthly_usd" {
  description = "Approximate on-demand price per month with Multi-AZ, by class."
  value       = { for s in local.ladder_json : s.name => s.monthly_usd }
}
