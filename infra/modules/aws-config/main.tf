# AWS Config (2026-10-25): "is the account still configured the way we said?"
# A recorder keeps the configuration of a short list of security-relevant
# resource types, and AWS-managed rules (no code of ours) judge them. A rule
# turning NON_COMPLIANT sends one line to the alerts topic.
#
# Cost control (AWS Config pricing page, us-east-1: $0.003 per configuration
# item recorded continuously, $0.012 per item with daily recording,
# $0.001 per rule evaluation, no free tier; third-party summaries agree):
#   * only the resource types the rules below need are recorded, not "all";
#   * DAILY recording: at most one item per resource per day, only if it
#     changed (AWS docs, "Recording frequency"). Our types change rarely, so
#     the bill is a few items; the daily mode is a ceiling when something
#     churns (a deploy loop rewriting a role). Move a type to `continuous_types`
#     if you want every change seen at once ($0.003 per change);
#   * 11 managed rules, 5 of them periodic (24 h) = ~150 evaluations a month.
# Estimate for this account: about $1-4 a month (items + evaluations + a few
# cents of S3). Default OFF (`enabled = false`): nothing is created.
#
# Global IAM types are recorded in this region only; run this module in ONE
# region (us-east-1 for the stack), as AWS advises, to avoid duplicates.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "name" { type = string }
variable "enabled" {
  type        = bool
  default     = false
  description = "Create the recorder, the delivery bucket and the managed rules. About $1-4 a month (approximate)."
}
variable "alerts_topic_arn" {
  type        = string
  default     = ""
  description = "SNS topic that gets a line when a rule becomes NON_COMPLIANT (empty = no alert, results only in the Config console)."
}
variable "retention_days" {
  type        = number
  default     = 400
  description = "How long configuration snapshots and histories stay in the bucket."
}
variable "daily_types" {
  type = list(string)
  default = [
    "AWS::IAM::User",
    "AWS::IAM::Group",
    "AWS::IAM::Role",
    "AWS::IAM::Policy",
    "AWS::S3::Bucket",
    "AWS::RDS::DBInstance",
  ]
  description = "Resource types recorded once a day (only if changed). Only types the rules need."
}
variable "continuous_types" {
  type        = list(string)
  default     = []
  description = "Resource types recorded on every change ($0.003 per item). Must not repeat daily_types."
}
variable "tags" {
  type    = map(string)
  default = {}
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  on     = var.enabled ? 1 : 0
  bucket = "${var.name}-config-${data.aws_caller_identity.current.account_id}"
  acct   = data.aws_caller_identity.current.account_id

  # AWS managed rules (source identifiers from the AWS Config managed rule
  # list). periodic = true: runs every 24 h and needs no recorded type;
  # false: runs when the recorded resource changes.
  rules = {
    "root-account-mfa-enabled"          = { id = "ROOT_ACCOUNT_MFA_ENABLED", periodic = true }
    "iam-root-access-key-check"         = { id = "IAM_ROOT_ACCESS_KEY_CHECK", periodic = true }
    "s3-account-level-public-access"    = { id = "S3_ACCOUNT_LEVEL_PUBLIC_ACCESS_BLOCKS_PERIODIC", periodic = true }
    "cloud-trail-enabled"               = { id = "CLOUD_TRAIL_ENABLED", periodic = true }
    "guardduty-enabled"                 = { id = "GUARDDUTY_ENABLED_CENTRALIZED", periodic = true }
    "s3-bucket-public-read-prohibited"  = { id = "S3_BUCKET_PUBLIC_READ_PROHIBITED", periodic = false }
    "s3-bucket-public-write-prohibited" = { id = "S3_BUCKET_PUBLIC_WRITE_PROHIBITED", periodic = false }
    "s3-bucket-sse-enabled"             = { id = "S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED", periodic = false }
    "rds-storage-encrypted"             = { id = "RDS_STORAGE_ENCRYPTED", periodic = false }
    "iam-no-inline-policy"              = { id = "IAM_NO_INLINE_POLICY_CHECK", periodic = false }
    "iam-policy-no-admin-statements"    = { id = "IAM_POLICY_NO_STATEMENTS_WITH_ADMIN_ACCESS", periodic = false }
  }
}

# --- delivery bucket (same pattern as the CloudTrail / audit-logs buckets) --
resource "aws_s3_bucket" "config" {
  count  = local.on
  bucket = local.bucket
  tags   = var.tags
}

resource "aws_s3_bucket_public_access_block" "config" {
  count                   = local.on
  bucket                  = aws_s3_bucket.config[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "config" {
  count  = local.on
  bucket = aws_s3_bucket.config[0].id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_versioning" "config" {
  count  = local.on
  bucket = aws_s3_bucket.config[0].id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "config" {
  count  = local.on
  bucket = aws_s3_bucket.config[0].id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "config" {
  count  = local.on
  bucket = aws_s3_bucket.config[0].id
  rule {
    id     = "expire"
    status = "Enabled"
    filter {}
    expiration { days = var.retention_days }
    noncurrent_version_expiration { noncurrent_days = 30 }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
}

data "aws_iam_policy_document" "bucket" {
  count = local.on
  statement {
    sid       = "AWSConfigBucketPermissionsCheck"
    actions   = ["s3:GetBucketAcl", "s3:ListBucket"]
    resources = [aws_s3_bucket.config[0].arn]
    principals {
      type        = "Service"
      identifiers = ["config.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.acct]
    }
  }
  statement {
    sid       = "AWSConfigBucketDelivery"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.config[0].arn}/AWSLogs/${local.acct}/Config/*"]
    principals {
      type        = "Service"
      identifiers = ["config.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.acct]
    }
  }
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.config[0].arn,
      "${aws_s3_bucket.config[0].arn}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "config" {
  count  = local.on
  bucket = aws_s3_bucket.config[0].id
  policy = data.aws_iam_policy_document.bucket[0].json
  depends_on = [
    aws_s3_bucket_public_access_block.config,
    aws_s3_bucket_ownership_controls.config,
  ]
}

# --- recorder role ----------------------------------------------------------
data "aws_iam_policy_document" "assume" {
  count = local.on
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["config.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.acct]
    }
  }
}

resource "aws_iam_role" "config" {
  count              = local.on
  name               = "${var.name}-config-recorder"
  assume_role_policy = data.aws_iam_policy_document.assume[0].json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "config" {
  count      = local.on
  role       = aws_iam_role.config[0].name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AWS_ConfigRole"
}

resource "aws_iam_role_policy" "deliver" {
  count = local.on
  name  = "deliver-to-bucket"
  role  = aws_iam_role.config[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:PutObjectAcl", "s3:GetBucketAcl"]
      Resource = [aws_s3_bucket.config[0].arn, "${aws_s3_bucket.config[0].arn}/AWSLogs/${local.acct}/Config/*"]
    }]
  })
}

# --- recorder, delivery, rules ---------------------------------------------
resource "aws_config_configuration_recorder" "this" {
  count    = local.on
  name     = "${var.name}-config"
  role_arn = aws_iam_role.config[0].arn

  recording_group {
    all_supported                 = false
    include_global_resource_types = false
    resource_types                = concat(var.daily_types, var.continuous_types)
  }

  recording_mode {
    recording_frequency = "DAILY"
    dynamic "recording_mode_override" {
      for_each = length(var.continuous_types) > 0 ? [1] : []
      content {
        description         = "Recorded on every change"
        resource_types      = var.continuous_types
        recording_frequency = "CONTINUOUS"
      }
    }
  }
  depends_on = [aws_iam_role_policy_attachment.config]
}

resource "aws_config_delivery_channel" "this" {
  count          = local.on
  name           = "${var.name}-config"
  s3_bucket_name = aws_s3_bucket.config[0].id
  snapshot_delivery_properties {
    delivery_frequency = "TwentyFour_Hours"
  }
  depends_on = [aws_config_configuration_recorder.this, aws_s3_bucket_policy.config, aws_iam_role_policy.deliver]
}

resource "aws_config_configuration_recorder_status" "this" {
  count      = local.on
  name       = aws_config_configuration_recorder.this[0].name
  is_enabled = true
  depends_on = [aws_config_delivery_channel.this]
}

resource "aws_config_config_rule" "managed" {
  for_each = var.enabled ? local.rules : {}
  name     = "${var.name}-${each.key}"

  source {
    owner             = "AWS"
    source_identifier = each.value.id
  }
  maximum_execution_frequency = each.value.periodic ? "TwentyFour_Hours" : null
  tags                        = var.tags
  depends_on                  = [aws_config_configuration_recorder_status.this]
}

# --- NON_COMPLIANT -> alerts topic ------------------------------------------
resource "aws_cloudwatch_event_rule" "noncompliant" {
  count       = var.enabled && var.alerts_topic_arn != "" ? 1 : 0
  name        = "${var.name}-config-noncompliant"
  description = "An AWS Config rule of ${var.name} turned NON_COMPLIANT"
  event_pattern = jsonencode({
    source      = ["aws.config"]
    detail-type = ["Config Rules Compliance Change"]
    detail = {
      configRuleName = [{ prefix = "${var.name}-" }]
      newEvaluationResult = {
        complianceType = ["NON_COMPLIANT"]
      }
    }
  })
  tags = var.tags
}

resource "aws_cloudwatch_event_target" "noncompliant" {
  count     = var.enabled && var.alerts_topic_arn != "" ? 1 : 0
  rule      = aws_cloudwatch_event_rule.noncompliant[0].name
  target_id = "alerts"
  arn       = var.alerts_topic_arn
  input_transformer {
    input_paths = {
      rule     = "$.detail.configRuleName"
      resource = "$.detail.resourceId"
      type     = "$.detail.resourceType"
    }
    input_template = "\"AWS Config: rule <rule> is NON_COMPLIANT for <type> <resource>. Open AWS Config > Rules in the console; fix or document the exception.\""
  }
}

output "bucket" { value = one(aws_s3_bucket.config[*].id) }
output "rule_names" { value = [for r in aws_config_config_rule.managed : r.name] }
