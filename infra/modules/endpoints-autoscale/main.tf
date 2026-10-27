# Owner rule 2026-10-25 (S9-6): nothing is "off forever". The four interface
# VPC endpoints (ecr.api, ecr.dkr, logs, secretsmanager) cost ≈ $29/month and
# pay off only above ≈ 830 GB/month through the NAT gateway, so the stack
# starts WITHOUT them (interface_endpoints = []) and this Lambda creates /
# removes them by itself, like the database and Redis autoscalers
# (modules/db-autoscale, modules/redis-autoscale):
#
#   EventBridge Scheduler  hourly  -> Lambda
#     up:   NAT traffic above up_gb_per_day (extrapolated from the last hour,
#           same number as the NAT alarm) -> create the missing endpoints
#     down: 7 quiet days (NAT + endpoint traffic under down_gb_per_day) -> delete
#
# Only endpoints tagged ManagedBy=<name>-endpoints-autoscale are touched. The
# switch (on | dry-run | off) and the admin ceiling (most endpoints it may keep,
# 0 = none) are SSM parameters, ignored by Terraform after creation.
terraform {
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 5.60" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }
}

variable "name" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" {
  type        = list(string)
  description = "Subnets that get the endpoint network interfaces (the first AZ only at the launch size: $0.01/h each)."
}
variable "security_group_id" {
  type        = string
  description = "Security group of the endpoints (HTTPS from the VPC)."
}
variable "nat_gateway_ids" { type = list(string) }
variable "services" {
  type        = list(string)
  default     = ["ecr.api", "ecr.dkr", "logs", "secretsmanager"]
  description = "Endpoint services the Lambda may create (not the ones Terraform already manages)."
}
variable "alerts_topic_arn" { type = string }
variable "kms_key_arn" {
  type    = string
  default = null
}
variable "controls_bucket" {
  type        = string
  default     = ""
  description = "Bucket with ops/scale-controls.json (the owner's admin control off / on / auto and the ceiling, copied by the economy job). Empty = the Lambda decides by traffic alone."
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
variable "ceiling" {
  type        = number
  default     = 4
  description = "Start value of the admin ceiling: most endpoints the Lambda may keep (0 = none). Changed later in SSM."
}
variable "tuning" {
  type        = map(number)
  default     = {}
  description = "Overrides of decision.Config, e.g. { up_gb_per_day = 30, down_days = 14 }."
}
variable "schedule" {
  type    = string
  default = "rate(1 hour)"
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
  prefix     = "/${var.name}/endpoints-autoscale"
  fn_name    = "${var.name}-endpoints-autoscale"
  managed_by = "${var.name}-endpoints-autoscale"
}

resource "aws_ssm_parameter" "mode" {
  name        = "${local.prefix}/mode"
  type        = "String"
  value       = var.mode
  description = "VPC endpoint autoscale switch: on | dry-run | off. Read on every run; changing it here after creation is ignored."
  tags        = var.tags
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "ceiling" {
  name        = "${local.prefix}/ceiling"
  type        = "String"
  value       = tostring(var.ceiling)
  description = "Admin ceiling: the most endpoints the Lambda may keep (0 = none). Changing it here after creation is ignored."
  tags        = var.tags
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "state" {
  name        = "${local.prefix}/state"
  type        = "String"
  value       = "{}"
  description = "When the Lambda last changed the endpoints (written by the Lambda)."
  tags        = var.tags
  lifecycle { ignore_changes = [value] }
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  excludes    = ["tests", "tests/test_decision.py", "tests/test_handler.py", "__pycache__"]
  output_path = "${path.module}/.endpoints-autoscale-${var.name}.zip"
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
    sid       = "ReadEndpointsAndMetrics"
    actions   = ["ec2:DescribeVpcEndpoints", "cloudwatch:GetMetricData"]
    resources = ["*"]
  }
  statement {
    sid       = "CreateEndpointsInThisVpc"
    actions   = ["ec2:CreateVpcEndpoint"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/ManagedBy"
      values   = [local.managed_by]
    }
  }
  statement {
    sid     = "CreateEndpointParts"
    actions = ["ec2:CreateVpcEndpoint", "ec2:CreateTags"]
    resources = [
      "arn:aws:ec2:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:vpc/${var.vpc_id}",
      "arn:aws:ec2:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:subnet/*",
      "arn:aws:ec2:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:security-group/${var.security_group_id}",
      "arn:aws:ec2:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:vpc-endpoint/*",
    ]
  }
  statement {
    sid       = "DeleteOnlyOwnEndpoints"
    actions   = ["ec2:DeleteVpcEndpoints"]
    resources = ["arn:aws:ec2:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:vpc-endpoint/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/ManagedBy"
      values   = [local.managed_by]
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
  dynamic "statement" {
    for_each = var.controls_bucket == "" ? [] : [1]
    content {
      sid       = "ReadOwnerControl"
      actions   = ["s3:GetObject"]
      resources = ["arn:aws:s3:::${var.controls_bucket}/${var.controls_key}"]
    }
  }
  statement {
    sid       = "SwitchCeilingAndState"
    actions   = ["ssm:GetParameter", "ssm:PutParameter"]
    resources = [aws_ssm_parameter.mode.arn, aws_ssm_parameter.ceiling.arn, aws_ssm_parameter.state.arn]
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
  description      = "VPC interface endpoints appear when NAT traffic is high and go after a quiet week"
  role             = aws_iam_role.lambda.arn
  runtime          = "python3.12"
  architectures    = ["arm64"]
  handler          = "handler.lambda_handler"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  timeout          = 120
  memory_size      = 256

  environment {
    variables = {
      NAME          = var.name
      VPC_ID        = var.vpc_id
      SUBNET_IDS    = join(",", var.subnet_ids)
      SG_ID         = var.security_group_id
      NAT_IDS       = join(",", var.nat_gateway_ids)
      SERVICES      = join(",", var.services)
      MANAGED_TAG   = local.managed_by
      TOPIC_ARN     = var.alerts_topic_arn
      STATE_PARAM   = aws_ssm_parameter.state.name
      MODE_PARAM    = aws_ssm_parameter.mode.name
      CEILING_PARAM = aws_ssm_parameter.ceiling.name
      TUNING        = jsonencode(var.tuning)
    }
  }
  tags       = var.tags
  depends_on = [aws_cloudwatch_log_group.lambda, aws_iam_role_policy.lambda]
}

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
  description         = "VPC endpoint autoscale: look at the NAT traffic"
  schedule_expression = var.schedule
  flexible_time_window { mode = "OFF" }
  target {
    arn      = aws_lambda_function.this.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ mode = "tick" })
    retry_policy {
      maximum_retry_attempts       = 0 # the next hour is the retry
      maximum_event_age_in_seconds = 300
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "errors" {
  alarm_name          = "${local.fn_name}-errors"
  alarm_description   = "LawBid: автоматика VPC-эндпоинтов дала сбой (несколько раз подряд). Эндпоинты остались как были, ничего не сломано. Что делать: напишите Claude «эндпоинты автомат». Инструкция: docs/runbooks/nat-endpoints.md (EN: endpoints-autoscale Lambda errors)."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 10800
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
output "ceiling_parameter" { value = aws_ssm_parameter.ceiling.name }
