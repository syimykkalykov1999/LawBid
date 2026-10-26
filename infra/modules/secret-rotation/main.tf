# Owner 2026-10-25: automatic rotation of the secrets the app lives on, with
# an overlap so nothing stops (docs/runbooks/secrets-rotation.md). Everything
# is OFF by default (stack variable secret_rotation); a part that is off
# creates nothing.
#
#   database login  AWS-provided template "PostgreSQLMultiUser" (alternating
#                   users, hosted rotation function via CloudFormation) on a
#                   JSON secret; ops.py mirrors it into DATABASE_URL.
#   Redis token     rotator.py (AWS has no template for the AUTH token):
#                   ElastiCache ROTATE (both tokens valid) -> roll services
#                   -> ops.py SET after strict_hours (old token off).
#   app key lists   rotator.py appends a key; ops.py rolls the services, makes
#                   it active after grace_hours; old kids keep verifying.
#   follow-up       ops.py hourly: rolls ECS (secrets are read at task start),
#                   metrics + alarm for overdue / failed rotations.
#
# Cost: Lambda (a few hundred short runs a month, inside the free tier),
# CloudWatch metric + 2 alarms (~$0.20), SSM standard parameter (free).
# Secrets Manager charges $0.40 per secret per month (the new JSON secret,
# 3 active-kid secrets: ~$1.60) plus $0.05 per 10k API calls (cents).
terraform {
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 5.60" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }
}

variable "name" { type = string }
variable "cluster_name" { type = string }
variable "service_names" {
  type        = list(string)
  description = "ECS services rolled after a rotation (api, worker, pgbouncer when it exists)."
}
variable "alerts_topic_arn" { type = string }
variable "kms_key_arn" {
  type        = string
  description = "Key of the secrets, the alerts topic and the log groups."
}
variable "data_keys_kms_key_arn" {
  type        = string
  default     = ""
  description = "KMS key that wraps the message / admin key store data keys; the rotator may only Encrypt with it, with app=<kms_app>."
}
variable "kms_app" {
  type    = string
  default = ""
}

# --- database (empty db = off) ----------------------------------------------
variable "db" {
  type = object({
    json_secret_arn       = string # standard RDS JSON secret, rotated by the AWS template
    url_secret_arn        = string # DATABASE_URL the app and PgBouncer read
    master_secret_arn     = string # master user (JSON), created by the owner or by RDS (ManageMasterUserPassword)
    master_secret_kms_arn = string # "" = the default aws/secretsmanager key
    every_days            = number
    subnet_ids            = list(string)
    security_group_ids    = list(string)
  })
  default = null
}

# --- Redis tokens: short secret name => secret + replication group -----------
variable "redis" {
  type = map(object({
    secret_arn = string
    group_id   = string
    every_days = number
  }))
  default = {}
}

# --- app key lists: short secret name => list secret + ACTIVE_KID secret -----
variable "keys" {
  type = map(object({
    secret_arn        = string
    active_kid_secret = string
    every_days        = number
  }))
  default = {}
}

variable "grace_hours" {
  type        = number
  default     = 6
  description = "A new app key becomes the active one only after this many hours (every task has restarted and knows it)."
}
variable "strict_hours" {
  type        = number
  default     = 24
  description = "The old Redis token is switched off this many hours after the new one was added."
}
variable "jwt_retire_days" {
  type        = number
  default     = 2
  description = "A replaced JWT key is removed after this many days (must exceed the longest JWT lifetime: access / admin tokens are minutes to hours; refresh tokens are not JWTs)."
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
  fn_prefix    = "${var.name}-secret-rotation"
  need_rotator = length(var.redis) + length(var.keys) > 0
  db_on        = var.db != null
  partition    = "aws"
  acct         = data.aws_caller_identity.current.account_id
  region       = data.aws_region.current.name

  tracked = concat(
    local.db_on ? [{ name = "DB_APP_CREDENTIALS", arn = var.db.json_secret_arn, every_days = var.db.every_days }] : [],
    [for k, v in var.redis : { name = k, arn = v.secret_arn, every_days = v.every_days }],
    [for k, v in var.keys : { name = k, arn = v.secret_arn, every_days = v.every_days }],
  )

  ops_config = {
    cluster         = var.cluster_name
    services        = var.service_names
    grace_hours     = var.grace_hours
    strict_hours    = var.strict_hours
    jwt_retire_days = var.jwt_retire_days
    tracked         = local.tracked
    db = local.db_on ? {
      json_arn   = var.db.json_secret_arn
      url_arn    = var.db.url_secret_arn
      master_arn = var.db.master_secret_arn
    } : null
    redis = { for k, v in var.redis : k => { arn = v.secret_arn, group = v.group_id } }
    keys  = { for k, v in var.keys : k => { arn = v.secret_arn, active_arn = v.active_kid_secret } }
  }

  secret_arns_rw = concat(
    [for v in var.redis : v.secret_arn],
    [for v in var.keys : v.secret_arn],
    [for v in var.keys : v.active_kid_secret],
    local.db_on ? [var.db.json_secret_arn, var.db.url_secret_arn] : [],
  )
  group_arns = [for v in var.redis : "arn:aws:elasticache:${local.region}:${local.acct}:replicationgroup:${v.group_id}"]
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  excludes    = ["tests", "__pycache__"]
  output_path = "${path.module}/.secret-rotation-${var.name}.zip"
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

# --- state of the follow-up ----------------------------------------------------
resource "aws_ssm_parameter" "state" {
  name        = "/${var.name}/secret-rotation/state"
  type        = "String"
  value       = "{}"
  description = "Secret rotation follow-up memory (written by the ops Lambda; no secret values)."
  tags        = var.tags
  lifecycle { ignore_changes = [value] }
}

# =============================================================================
# 1. rotator (Redis token, app key lists)
# =============================================================================
resource "aws_cloudwatch_log_group" "rotator" {
  count             = local.need_rotator ? 1 : 0
  name              = "/aws/lambda/${local.fn_prefix}-rotator"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
  tags              = var.tags
}

resource "aws_iam_role" "rotator" {
  count              = local.need_rotator ? 1 : 0
  name               = "${local.fn_prefix}-rotator"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "rotator" {
  count = local.need_rotator ? 1 : 0
  statement {
    sid = "TheseSecretsOnly"
    actions = [
      "secretsmanager:DescribeSecret", "secretsmanager:GetSecretValue",
      "secretsmanager:PutSecretValue", "secretsmanager:UpdateSecretVersionStage",
    ]
    resources = concat([for v in var.redis : v.secret_arn], [for v in var.keys : v.secret_arn])
  }
  statement {
    sid       = "SecretsKey"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
    resources = [var.kms_key_arn]
  }
  dynamic "statement" {
    for_each = var.data_keys_kms_key_arn == "" ? [] : [1]
    content {
      sid       = "WrapNewDataKeysOnly"
      actions   = ["kms:Encrypt"]
      resources = [var.data_keys_kms_key_arn]
      dynamic "condition" {
        for_each = var.kms_app == "" ? [] : [1]
        content {
          test     = "StringEquals"
          variable = "kms:EncryptionContext:app"
          values   = [var.kms_app]
        }
      }
    }
  }
  dynamic "statement" {
    for_each = length(var.redis) == 0 ? [] : [1]
    content {
      sid       = "RedisTokenOfTheseGroups"
      actions   = ["elasticache:ModifyReplicationGroup"]
      resources = local.group_arns
    }
  }
  dynamic "statement" {
    for_each = length(var.redis) == 0 ? [] : [1]
    content {
      sid       = "RedisStatus"
      actions   = ["elasticache:DescribeReplicationGroups"]
      resources = ["*"]
    }
  }
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.rotator[0].arn}:*"]
  }
}

resource "aws_iam_role_policy" "rotator" {
  count  = local.need_rotator ? 1 : 0
  role   = aws_iam_role.rotator[0].id
  policy = data.aws_iam_policy_document.rotator[0].json
}

resource "aws_lambda_function" "rotator" {
  count            = local.need_rotator ? 1 : 0
  function_name    = "${local.fn_prefix}-rotator"
  description      = "Rotation steps for the Redis AUTH token and the app key lists (docs/runbooks/secrets-rotation.md)"
  role             = aws_iam_role.rotator[0].arn
  runtime          = "python3.12"
  architectures    = ["arm64"]
  handler          = "rotator.lambda_handler"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  timeout          = 900 # the Redis step waits for ElastiCache (about 5-10 min)
  memory_size      = 256
  environment {
    variables = {
      REDIS_GROUPS = jsonencode({ for k, v in var.redis : k => v.group_id })
      KEY_SECRETS  = jsonencode(keys(var.keys))
      KMS_KEY_ARN  = var.data_keys_kms_key_arn
      KMS_APP      = var.kms_app
    }
  }
  tags       = var.tags
  depends_on = [aws_cloudwatch_log_group.rotator, aws_iam_role_policy.rotator]
}

resource "aws_lambda_permission" "secretsmanager" {
  count          = local.need_rotator ? 1 : 0
  statement_id   = "SecretsManagerInvoke"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.rotator[0].function_name
  principal      = "secretsmanager.amazonaws.com"
  source_account = local.acct
}

# rotate_immediately = false: enabling never rotates at once; the first
# rotation happens on schedule (or on demand: runbook, «Проверка»).
resource "aws_secretsmanager_secret_rotation" "redis" {
  for_each            = var.redis
  secret_id           = each.value.secret_arn
  rotation_lambda_arn = aws_lambda_function.rotator[0].arn
  rotate_immediately  = false
  rotation_rules {
    automatically_after_days = each.value.every_days
  }
  depends_on = [aws_lambda_permission.secretsmanager]
}

resource "aws_secretsmanager_secret_rotation" "keys" {
  for_each            = var.keys
  secret_id           = each.value.secret_arn
  rotation_lambda_arn = aws_lambda_function.rotator[0].arn
  rotate_immediately  = false
  rotation_rules {
    automatically_after_days = each.value.every_days
  }
  depends_on = [aws_lambda_permission.secretsmanager]
}

# =============================================================================
# 2. database login: AWS-provided "PostgreSQLMultiUser" rotation function
# =============================================================================
# Hosted rotation = the AWS-maintained function (no code of ours, no driver
# to package), created through the documented CloudFormation transform
# AWS::SecretsManager-2020-07-23 (HostedRotationLambda).
resource "aws_cloudformation_stack" "db_rotation" {
  count        = local.db_on ? 1 : 0
  name         = "${local.fn_prefix}-db"
  capabilities = ["CAPABILITY_IAM", "CAPABILITY_AUTO_EXPAND"]
  template_body = jsonencode({
    Transform = "AWS::SecretsManager-2020-07-23"
    Resources = {
      DbRotation = {
        Type = "AWS::SecretsManager::RotationSchedule"
        Properties = merge({
          SecretId                  = var.db.json_secret_arn
          RotateImmediatelyOnUpdate = false
          RotationRules             = { AutomaticallyAfterDays = var.db.every_days }
          HostedRotationLambda = merge({
            RotationType        = "PostgreSQLMultiUser"
            RotationLambdaName  = "${local.fn_prefix}-db"
            MasterSecretArn     = var.db.master_secret_arn
            KmsKeyArn           = var.kms_key_arn
            VpcSecurityGroupIds = join(",", var.db.security_group_ids)
            VpcSubnetIds        = join(",", var.db.subnet_ids)
            ExcludeCharacters   = "/@\"'\\:%?#[]()&=+ ,;" # the password goes into a URL
            Runtime             = "python3.12"
          }, var.db.master_secret_kms_arn == "" ? {} : { MasterSecretKmsArn = var.db.master_secret_kms_arn })
        })
      }
    }
  })
  tags = var.tags
}

# =============================================================================
# 3. ops: follow-up (rolls ECS, promotes keys, drops the old Redis token,
#    reports overdue / failed rotations)
# =============================================================================
resource "aws_cloudwatch_log_group" "ops" {
  name              = "/aws/lambda/${local.fn_prefix}-ops"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
  tags              = var.tags
}

resource "aws_iam_role" "ops" {
  name               = "${local.fn_prefix}-ops"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "ops" {
  statement {
    sid       = "ReadWriteTrackedSecrets"
    actions   = ["secretsmanager:DescribeSecret", "secretsmanager:GetSecretValue", "secretsmanager:PutSecretValue"]
    resources = local.secret_arns_rw
  }
  statement {
    sid       = "SecretsKey"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
    resources = [var.kms_key_arn]
  }
  statement {
    sid       = "RollTheServices"
    actions   = ["ecs:UpdateService"]
    resources = [for s in var.service_names : "arn:aws:ecs:${local.region}:${local.acct}:service/${var.cluster_name}/${s}"]
  }
  dynamic "statement" {
    for_each = length(var.redis) == 0 ? [] : [1]
    content {
      sid       = "RedisOldTokenOff"
      actions   = ["elasticache:ModifyReplicationGroup"]
      resources = local.group_arns
    }
  }
  statement {
    sid       = "State"
    actions   = ["ssm:GetParameter", "ssm:PutParameter"]
    resources = [aws_ssm_parameter.state.arn]
  }
  statement {
    sid       = "Metric"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["LawBid/${var.name}/SecretRotation"]
    }
  }
  statement {
    sid       = "Mail"
    actions   = ["sns:Publish"]
    resources = [var.alerts_topic_arn]
  }
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.ops.arn}:*"]
  }
}

resource "aws_iam_role_policy" "ops" {
  role   = aws_iam_role.ops.id
  policy = data.aws_iam_policy_document.ops.json
}

resource "aws_lambda_function" "ops" {
  function_name    = "${local.fn_prefix}-ops"
  description      = "Follow-up of secret rotation: roll ECS, promote keys, status (docs/runbooks/secrets-rotation.md)"
  role             = aws_iam_role.ops.arn
  runtime          = "python3.12"
  architectures    = ["arm64"]
  handler          = "ops.lambda_handler"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  timeout          = 120
  memory_size      = 256
  environment {
    variables = {
      CONFIG           = jsonencode(local.ops_config)
      STATE_PARAM      = aws_ssm_parameter.state.name
      METRIC_NAMESPACE = "LawBid/${var.name}/SecretRotation"
      TOPIC_ARN        = var.alerts_topic_arn
    }
  }
  tags       = var.tags
  depends_on = [aws_cloudwatch_log_group.ops, aws_iam_role_policy.ops]
}

resource "aws_cloudwatch_event_rule" "ops" {
  name                = "${local.fn_prefix}-ops"
  description         = "Hourly follow-up of secret rotation"
  schedule_expression = "rate(1 hour)"
  tags                = var.tags
}

resource "aws_cloudwatch_event_target" "ops" {
  rule = aws_cloudwatch_event_rule.ops.name
  arn  = aws_lambda_function.ops.arn
}

resource "aws_lambda_permission" "events" {
  statement_id  = "EventsInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ops.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ops.arn
}

# --- alarms -> the alerts e-mail ---------------------------------------------
resource "aws_cloudwatch_metric_alarm" "problems" {
  alarm_name          = "${local.fn_prefix}-problems"
  alarm_description   = "LawBid: ротация секретов просрочена или сорвалась (пароль базы / токен Redis / ключи). Приложение продолжает работать на текущих секретах. Что делать: docs/runbooks/secrets-rotation.md, раздел «Сорвалась»."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  period              = 3600
  threshold           = 1
  statistic           = "Maximum"
  metric_name         = "Problems"
  namespace           = "LawBid/${var.name}/SecretRotation"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alerts_topic_arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "errors" {
  alarm_name          = "${local.fn_prefix}-ops-errors"
  alarm_description   = "LawBid: проверка ротации секретов не отработала 3 раза подряд. Секреты не пострадали. Инструкция: docs/runbooks/secrets-rotation.md."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 10800
  threshold           = 3
  statistic           = "Sum"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  dimensions          = { FunctionName = aws_lambda_function.ops.function_name }
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alerts_topic_arn]
  tags                = var.tags
}

output "ops_function_name" { value = aws_lambda_function.ops.function_name }
output "rotator_function_name" { value = local.need_rotator ? aws_lambda_function.rotator[0].function_name : "" }
