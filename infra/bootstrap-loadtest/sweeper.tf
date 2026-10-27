# S9-12 (2026-10-25): the load-test safety net inside AWS. The GitHub watchdog
# (hourly cron) is GitHub's: scheduled workflows are switched off after 60 days
# without repository activity and it needs one secret. This is the same sweep
# (loadtest/scripts/sweep.sh) as an EventBridge Scheduler + a tiny Lambda, plus
# a $20 budget on everything tagged Project=lawbid-loadtest. COST GATE: it
# costs cents (one 256 MB run an hour, ~2 s); the switch (on | dry-run | off) is
# an SSM parameter; it deletes only what is tagged Project=lawbid-loadtest AND
# older than 4 hours, and the IAM policy denies everything tagged Project=lawbid.
variable "sweeper_alert_email" {
  type        = string
  default     = ""
  description = "Where the sweeper and the $20 budget write. Empty = no e-mail (the budget is then not created)."
}
variable "sweeper_mode" {
  type        = string
  default     = "on"
  description = "Start value of the switch: on | dry-run | off (later changes in SSM, ignored here after creation)."
  validation {
    condition     = contains(["on", "dry-run", "off"], var.sweeper_mode)
    error_message = "sweeper_mode: on, dry-run or off."
  }
}
variable "sweeper_max_age_hours" {
  type    = number
  default = 4
}
variable "loadtest_budget_usd" {
  type        = number
  default     = 20
  description = "Monthly budget of everything tagged Project=lawbid-loadtest (cost allocation tag must be active)."
}

locals {
  sweeper_fn = "${local.lt}-sweeper"
}

resource "aws_sns_topic" "sweeper" {
  count = var.sweeper_alert_email == "" ? 0 : 1
  name  = "${local.lt}-alerts"
}

resource "aws_sns_topic_subscription" "sweeper" {
  count     = var.sweeper_alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.sweeper[0].arn
  protocol  = "email"
  endpoint  = var.sweeper_alert_email
}

# AWS Budgets publishes to the topic: it needs this policy.
data "aws_iam_policy_document" "sweeper_topic" {
  count = var.sweeper_alert_email == "" ? 0 : 1
  statement {
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.sweeper[0].arn]
    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }
  }
}

resource "aws_sns_topic_policy" "sweeper" {
  count  = var.sweeper_alert_email == "" ? 0 : 1
  arn    = aws_sns_topic.sweeper[0].arn
  policy = data.aws_iam_policy_document.sweeper_topic[0].json
}

resource "aws_ssm_parameter" "sweeper_mode" {
  name        = "/${local.lt}/sweeper/mode"
  type        = "String"
  value       = var.sweeper_mode
  description = "Load-test sweeper switch: on | dry-run | off. Read on every run."
  lifecycle { ignore_changes = [value] }
}

data "archive_file" "sweeper" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  excludes    = ["tests", "tests/test_sweeper.py", "__pycache__"]
  output_path = "${path.module}/.sweeper.zip"
}

resource "aws_cloudwatch_log_group" "sweeper" {
  name              = "/aws/lambda/${local.sweeper_fn}"
  retention_in_days = 30
}

data "aws_iam_policy_document" "sweeper_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "sweeper" {
  name               = local.sweeper_fn
  assume_role_policy = data.aws_iam_policy_document.sweeper_assume.json
}

data "aws_iam_policy_document" "sweeper" {
  statement {
    sid       = "FindTagged"
    actions   = ["tag:GetResources"]
    resources = ["*"]
  }
  # Only what is tagged Project=lawbid-loadtest (tag conditions where the
  # service supports them); the DENY below wins over everything.
  statement {
    sid = "StopCostlyLoadTestResources"
    actions = [
      "ec2:TerminateInstances", "ec2:DeleteNatGateway", "ec2:ReleaseAddress",
      "ecs:UpdateService", "ecs:DeleteService",
      "rds:ModifyDBInstance", "rds:DeleteDBInstance",
      "elasticache:DeleteReplicationGroup",
      "elasticloadbalancing:DeleteLoadBalancer",
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Project"
      values   = ["lawbid-loadtest"]
    }
  }
  statement {
    sid       = "NeverProdOrStaging"
    effect    = "Deny"
    actions   = ["*"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Project"
      values   = ["lawbid"]
    }
  }
  statement {
    sid       = "SwitchAndMail"
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.sweeper_mode.arn]
  }
  dynamic "statement" {
    for_each = var.sweeper_alert_email == "" ? [] : [1]
    content {
      sid       = "Mail"
      actions   = ["sns:Publish"]
      resources = [aws_sns_topic.sweeper[0].arn]
    }
  }
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.sweeper.arn}:*"]
  }
}

resource "aws_iam_role_policy" "sweeper" {
  role   = aws_iam_role.sweeper.id
  policy = data.aws_iam_policy_document.sweeper.json
}

resource "aws_lambda_function" "sweeper" {
  function_name    = local.sweeper_fn
  description      = "Deletes forgotten load-test stacks older than ${var.sweeper_max_age_hours} h (S9-12)"
  role             = aws_iam_role.sweeper.arn
  runtime          = "python3.12"
  architectures    = ["arm64"]
  handler          = "sweeper.lambda_handler"
  filename         = data.archive_file.sweeper.output_path
  source_code_hash = data.archive_file.sweeper.output_base64sha256
  timeout          = 120
  memory_size      = 256
  environment {
    variables = {
      MODE_PARAM    = aws_ssm_parameter.sweeper_mode.name
      MAX_AGE_HOURS = tostring(var.sweeper_max_age_hours)
      TOPIC_ARN     = var.sweeper_alert_email == "" ? "" : aws_sns_topic.sweeper[0].arn
    }
  }
  depends_on = [aws_cloudwatch_log_group.sweeper, aws_iam_role_policy.sweeper]
}

data "aws_iam_policy_document" "sweeper_scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "sweeper_scheduler" {
  name               = "${local.sweeper_fn}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.sweeper_scheduler_assume.json
}

resource "aws_iam_role_policy" "sweeper_scheduler" {
  role = aws_iam_role.sweeper_scheduler.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "lambda:InvokeFunction", Resource = aws_lambda_function.sweeper.arn }]
  })
}

resource "aws_scheduler_schedule" "sweeper" {
  name                = "${local.sweeper_fn}-hourly"
  schedule_expression = "rate(1 hour)"
  flexible_time_window { mode = "OFF" }
  target {
    arn      = aws_lambda_function.sweeper.arn
    role_arn = aws_iam_role.sweeper_scheduler.arn
    retry_policy {
      maximum_retry_attempts       = 0
      maximum_event_age_in_seconds = 300
    }
  }
}

# $20 for everything a load test creates (needs the cost allocation tag
# Project activated in Billing; docs/runbooks/LOAD_TEST.md).
resource "aws_budgets_budget" "loadtest" {
  count        = var.sweeper_alert_email == "" ? 0 : 1
  name         = "${local.lt}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.loadtest_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Project$lawbid-loadtest"]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.sweeper_alert_email]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.sweeper_alert_email]
  }
}
