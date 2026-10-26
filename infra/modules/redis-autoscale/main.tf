# Owner 2026-10-24: Redis grows and shrinks by itself, like the database
# (modules/db-autoscale, same structure). Design, thresholds, prices and
# risks: docs/architecture/REDIS_AUTOSCALE.md; how to switch it off / force a
# size: docs/runbooks/redis-autoscale.md.
#
#   EventBridge Scheduler  every 5 min  {"mode":"tick"}  -> Lambda -> one step UP when loaded
#   EventBridge Scheduler  03:30 Chicago {"mode":"night"} -> Lambda -> one step DOWN after 3 quiet days
#
# The Lambda re-reads the facts on every run (node type, status, metrics of
# both nodes, ECS rollouts). A change is ModifyReplicationGroup(CacheNodeType,
# ApplyImmediately) and an e-mail through the existing alerts topic. State
# (last change times) lives in an SSM parameter; the on / dry-run / off switch
# in another one. modules/redis ignores node_type changes, so a later
# "terraform apply" never undoes a resize.
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
variable "replication_group_id" { type = string }
variable "replicas" {
  type        = number
  default     = 1
  description = "Replicas in the group: the price of a step is (1 + replicas) nodes."
}
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
    "cache.t4g.micro", "cache.t4g.small", "cache.t4g.medium",
    "cache.r7g.large", "cache.r7g.xlarge", "cache.r7g.2xlarge",
  ]
  description = "Sizes from small to large; one step at a time. Each must exist in local.node_specs."
  validation {
    condition     = length(var.ladder) >= 2 && length(distinct(var.ladder)) == length(var.ladder)
    error_message = "ladder: at least two different sizes."
  }
}
variable "min_node_type" {
  type    = string
  default = "cache.t4g.micro"
}
variable "max_node_type" {
  type        = string
  default     = "cache.r7g.large"
  description = "Ceiling for the bill (≈ $320/month with one replica). Above it the owner gets an e-mail and decides."
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
variable "require_failover" {
  type        = bool
  default     = true
  description = "Resize only a group with a replica and automatic failover (online, a few seconds of pause); a single node is replaced with minutes of downtime."
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
  description = "Overrides of decision.Config numbers, e.g. { up_cpu_pct = 75, down_window_h = 96 } (infra/modules/redis-autoscale/lambda/decision.py)."
}
variable "log_group_class" {
  type        = string
  default     = "INFREQUENT_ACCESS"
  description = "CloudWatch log class of the autoscale Lambda log (S20-11, cost registry row aws.cloudwatch_ia). INFREQUENT_ACCESS = half the ingest price; it has no metric filters / subscriptions, and nothing here uses them. STANDARD = old behaviour. Immutable in AWS: changing it replaces the group (its old lines are dropped)."
  validation {
    condition     = contains(["STANDARD", "INFREQUENT_ACCESS"], var.log_group_class)
    error_message = "log_group_class must be STANDARD or INFREQUENT_ACCESS."
  }
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
  # hourly = per node, on demand, us-east-1, Redis (AWS Price List API,
  # 2026-10-24); monthly = hourly x 730 x nodes. memory_gib = ElastiCache
  # node memory (maxmemory is a fixed share of it, so percent scales with GiB).
  # baseline = CPU % of one core a burstable node holds without spending
  # credits. speed = single-core speed of the Redis engine thread, t4g = 1.
  node_specs = {
    "cache.t4g.micro"   = { vcpu = 2, memory_gib = 0.5, hourly = 0.016, baseline = 10, speed = 1.0 }
    "cache.t4g.small"   = { vcpu = 2, memory_gib = 1.37, hourly = 0.032, baseline = 20, speed = 1.0 }
    "cache.t4g.medium"  = { vcpu = 2, memory_gib = 3.09, hourly = 0.065, baseline = 20, speed = 1.0 }
    "cache.r7g.large"   = { vcpu = 2, memory_gib = 13.07, hourly = 0.219, baseline = null, speed = 1.3 }
    "cache.r7g.xlarge"  = { vcpu = 4, memory_gib = 26.32, hourly = 0.437, baseline = null, speed = 1.3 }
    "cache.r7g.2xlarge" = { vcpu = 8, memory_gib = 52.82, hourly = 0.873, baseline = null, speed = 1.3 }
  }
  ladder_json = [for c in var.ladder : {
    name       = c
    vcpu       = local.node_specs[c].vcpu
    memory_gib = local.node_specs[c].memory_gib
    # ElastiCache maxclients is 65000 on every node type.
    max_connections = 65000
    monthly_usd     = floor(local.node_specs[c].hourly * 730 * (1 + var.replicas) * 100) / 100
    baseline_pct    = local.node_specs[c].baseline
    speed           = local.node_specs[c].speed
  }]
  prefix    = "/${var.name}/redis-autoscale"
  fn_name   = "${var.name}-redis-autoscale"
  rg_arn    = "arn:aws:elasticache:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:replicationgroup:${var.replication_group_id}"
  nodes_arn = "arn:aws:elasticache:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:cluster:${var.replication_group_id}-*"
  min_index = index(var.ladder, var.min_node_type)
  max_index = index(var.ladder, var.max_node_type)
}

resource "terraform_data" "check_ladder" {
  input = var.ladder
  lifecycle {
    precondition {
      condition     = alltrue([for c in var.ladder : contains(keys(local.node_specs), c)])
      error_message = "ladder has a size without a price / spec row (local.node_specs in modules/redis-autoscale/main.tf)."
    }
    precondition {
      condition     = contains(var.ladder, var.min_node_type) && contains(var.ladder, var.max_node_type) && local.min_index <= local.max_index
      error_message = "min_node_type and max_node_type must be in the ladder, min not above max."
    }
  }
}

resource "aws_ssm_parameter" "mode" {
  name        = "${local.prefix}/mode"
  type        = "String"
  value       = var.mode
  description = "Redis autoscale switch: on | dry-run | off (docs/runbooks/redis-autoscale.md). Read on every run; changing it here after creation is ignored."
  tags        = var.tags
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "state" {
  name        = "${local.prefix}/state"
  type        = "String"
  value       = "{}"
  description = "Redis autoscale memory: the size it last saw and when it last changed (written by the Lambda)."
  tags        = var.tags
  lifecycle { ignore_changes = [value] }
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  excludes    = ["tests", "tests/test_decision.py", "tests/test_handler.py", "__pycache__"]
  output_path = "${path.module}/.redis-autoscale-${var.name}.zip"
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.fn_name}"
  retention_in_days = min(var.log_retention_days, 14)
  log_group_class   = var.log_group_class
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
    sid = "RedisThisGroupOnly"
    actions = [
      "elasticache:DescribeReplicationGroups",
      "elasticache:ModifyReplicationGroup",
      "elasticache:ListAllowedNodeTypeModifications",
    ]
    resources = [local.rg_arn, local.nodes_arn]
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
  description      = "Redis size follows the load (docs/architecture/REDIS_AUTOSCALE.md)"
  role             = aws_iam_role.lambda.arn
  runtime          = "python3.12"
  architectures    = ["arm64"]
  handler          = "handler.lambda_handler"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  timeout          = 120
  memory_size      = 256
  # No reserved concurrency: this account's Lambda limit is 10, a reservation
  # is refused below that. Overlap is harmless: ElastiCache refuses a second
  # modify while the first runs, and the status / pending checks come first.

  environment {
    variables = {
      LADDER           = jsonencode(local.ladder_json)
      MIN_CLASS        = var.min_node_type
      MAX_CLASS        = var.max_node_type
      REQUIRE_FAILOVER = tostring(var.require_failover)
      TUNING           = jsonencode(var.tuning)
      GROUP_ID         = var.replication_group_id
      TOPIC_ARN        = var.alerts_topic_arn
      STATE_PARAM      = aws_ssm_parameter.state.name
      MODE_PARAM       = aws_ssm_parameter.mode.name
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
  description         = "Redis autoscale: look for a reason to grow"
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
  description                  = "Redis autoscale: night check for a reason to shrink (after 3 quiet days)"
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
  alarm_description   = "LawBid: автомасштабирование Redis дало сбой (несколько раз подряд). Redis остался как был, ничего не сломано. Что делать: напишите Claude «автомасштаб Redis». Инструкция: docs/runbooks/redis-autoscale.md (EN: redis-autoscale Lambda errors)."
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
output "monthly_usd" {
  description = "Approximate on-demand price per month of the whole group (primary + replicas), by node type."
  value       = { for s in local.ladder_json : s.name => s.monthly_usd }
}
