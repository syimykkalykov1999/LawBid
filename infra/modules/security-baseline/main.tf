# Security research #5 (2026-10-22), A6 — the account's journal and
# detector (AWS Startup Security Baseline). Until now the stack had alarms
# on the application (SLO, budgets, Sentry) but nothing watched the AWS
# account itself: a stolen deploy key creating an EC2 miner, a change to a
# security group, a role used from a strange country left no trace.
#
#   * CloudTrail — every API call in every region, log-file validation on,
#     in a private S3 bucket (versioned, SSE-KMS with the trail's own key,
#     kept `cloudtrail_retention_days`). The first management-event trail
#     of an account is free; the bucket costs cents.
#   * GuardDuty — the managed detector (CloudTrail, VPC flow, DNS) plus S3
#     data-event protection; EBS malware scanning and runtime monitoring
#     stay off (paid, little value for Fargate). ~$1–5 a month here.
#   * IAM Access Analyzer (account) — lists resources shared outside the
#     account (a bucket policy, a role trust) as findings. Free.
#   * IAM account password policy — for the console users that remain.
#   * EventBridge → SNS: a GuardDuty finding of severity ≥ `alert_severity`
#     (7 = HIGH) and every Access Analyzer finding go to the alerts topic
#     (the owner's e-mail, the same topic as the SLO alarms).
#   * Security Hub (optional, `security_hub_enabled`): the CIS / AWS
#     Foundational standards check the account every 12 h (~$0.001 per
#     check, a few dollars a month).
#
# Not here, by hand (docs/runbooks/DEPLOY_PROD.md): MFA on the root user,
# no root access keys, IAM Identity Center instead of IAM users.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "name" { type = string }
variable "alerts_topic_arn" {
  type        = string
  description = "SNS topic that receives GuardDuty / Access Analyzer findings (modules/monitoring)."
}
variable "cloudtrail_retention_days" {
  type    = number
  default = 365
}
variable "alert_severity" {
  type        = number
  default     = 7
  description = "Lowest GuardDuty severity that is sent to the alerts topic (7 = HIGH, 4 = MEDIUM)."
}
variable "security_hub_enabled" {
  type    = bool
  default = false
}
# --- Legal-grade additions (security & legal pass 2026-10-24) -------------
# Every switch below defaults to what is free or nearly free; the paid ones
# are off until the owner turns them on (docs/runbooks/SECURITY_LEGAL.md has
# the monthly estimate of each).
variable "securityhub_fsbp_enabled" {
  type        = bool
  default     = false
  description = "Also subscribe Security Hub to the AWS Foundational Security Best Practices standard (needs security_hub_enabled). Roughly $5-15 a month for this account (about $0.001 per check, approximate)."
}
variable "inspector_enabled" {
  type        = bool
  default     = false
  description = "Amazon Inspector for ECR images: every pushed image is scanned for known vulnerabilities and re-scanned when a new one is published. About $0.09 per image scan plus $0.01 per image re-scan a month, ~$1-6 a month (approximate)."
}
variable "unused_access_analyzer_enabled" {
  type        = bool
  default     = false
  description = "IAM Access Analyzer unused-access analyzer (roles, users, permissions not used for 90 days). About $0.20 per IAM role or user a month (approximate), usually under $3."
}
variable "s3_account_block_public_access" {
  type        = bool
  default     = true
  description = "Block Public Access for every bucket of the account (also the ones created later by mistake). Free. Turn off only if some bucket must be public."
}
variable "critical_api_alerts_enabled" {
  type        = bool
  default     = true
  description = "E-mail the alerts topic when someone schedules deletion of a key, stops CloudTrail, deletes a backup vault or a vault lock, removes a Block Public Access, or the root user is used. Free."
}
variable "documents_data_events" {
  type        = bool
  default     = false
  description = "CloudTrail data events for the documents bucket: who read or wrote which object. About $0.10 per 100 000 events (approximate); a busy bucket can reach tens of dollars, which is why it is off."
}
variable "documents_bucket_arn" {
  type        = string
  default     = ""
  description = "ARN of the documents bucket (for documents_data_events)."
}
variable "tags" {
  type    = map(string)
  default = {}
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_partition" "current" {}

locals {
  bucket = "${var.name}-cloudtrail-${data.aws_caller_identity.current.account_id}"
  trail  = "${var.name}-trail"
}

# --- CloudTrail: key, bucket, trail ---------------------------------------
data "aws_iam_policy_document" "trail_key" {
  statement {
    sid       = "AccountAdmin"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
  statement {
    sid       = "CloudTrailEncrypt"
    actions   = ["kms:GenerateDataKey*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "kms:EncryptionContext:aws:cloudtrail:arn"
      values   = ["arn:${data.aws_partition.current.partition}:cloudtrail:*:${data.aws_caller_identity.current.account_id}:trail/*"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = ["arn:${data.aws_partition.current.partition}:cloudtrail:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:trail/${local.trail}"]
    }
  }
  statement {
    sid       = "CloudTrailDescribe"
    actions   = ["kms:DescribeKey"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
  }
  # Reading the logs (the console, Athena, an admin) decrypts with the
  # account's own permissions.
  statement {
    sid       = "AccountDecrypt"
    actions   = ["kms:Decrypt", "kms:ReEncryptFrom"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    condition {
      test     = "StringEquals"
      variable = "kms:CallerAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
    condition {
      test     = "StringLike"
      variable = "kms:EncryptionContext:aws:cloudtrail:arn"
      values   = ["arn:${data.aws_partition.current.partition}:cloudtrail:*:${data.aws_caller_identity.current.account_id}:trail/*"]
    }
  }
}

resource "aws_kms_key" "trail" {
  description             = "${var.name} CloudTrail logs"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.trail_key.json
  tags                    = var.tags
}

resource "aws_kms_alias" "trail" {
  name          = "alias/${var.name}-cloudtrail"
  target_key_id = aws_kms_key.trail.key_id
}

resource "aws_s3_bucket" "trail" {
  bucket = local.bucket
  tags   = var.tags
}

resource "aws_s3_bucket_public_access_block" "trail" {
  bucket                  = aws_s3_bucket.trail.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "trail" {
  bucket = aws_s3_bucket.trail.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_versioning" "trail" {
  bucket = aws_s3_bucket.trail.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "trail" {
  bucket = aws_s3_bucket.trail.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.trail.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "trail" {
  bucket = aws_s3_bucket.trail.id
  rule {
    id     = "expire"
    status = "Enabled"
    filter {}
    expiration { days = var.cloudtrail_retention_days }
    noncurrent_version_expiration { noncurrent_days = 30 }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
}

data "aws_iam_policy_document" "trail_bucket" {
  statement {
    sid       = "AWSCloudTrailAclCheck"
    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.trail.arn]
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = ["arn:${data.aws_partition.current.partition}:cloudtrail:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:trail/${local.trail}"]
    }
  }
  statement {
    sid       = "AWSCloudTrailWrite"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.trail.arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = ["arn:${data.aws_partition.current.partition}:cloudtrail:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:trail/${local.trail}"]
    }
  }
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.trail.arn,
      "${aws_s3_bucket.trail.arn}/*",
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

resource "aws_s3_bucket_policy" "trail" {
  bucket = aws_s3_bucket.trail.id
  policy = data.aws_iam_policy_document.trail_bucket.json
  depends_on = [
    aws_s3_bucket_public_access_block.trail,
    aws_s3_bucket_ownership_controls.trail,
  ]
}

resource "aws_cloudtrail" "this" {
  name                          = local.trail
  s3_bucket_name                = aws_s3_bucket.trail.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  kms_key_id                    = aws_kms_key.trail.arn
  tags                          = var.tags
  depends_on                    = [aws_s3_bucket_policy.trail]

  # Who read or wrote which document. Advanced selectors replace the default
  # one, so the management-events selector is repeated here.
  dynamic "advanced_event_selector" {
    for_each = var.documents_data_events ? [1] : []
    content {
      name = "Management events"
      field_selector {
        field  = "eventCategory"
        equals = ["Management"]
      }
    }
  }
  dynamic "advanced_event_selector" {
    for_each = var.documents_data_events ? [1] : []
    content {
      name = "Documents bucket objects"
      field_selector {
        field  = "eventCategory"
        equals = ["Data"]
      }
      field_selector {
        field  = "resources.type"
        equals = ["AWS::S3::Object"]
      }
      field_selector {
        field       = "resources.ARN"
        starts_with = ["${var.documents_bucket_arn}/"]
      }
    }
  }
}

# --- GuardDuty --------------------------------------------------------------
resource "aws_guardduty_detector" "this" {
  enable                       = true
  finding_publishing_frequency = "SIX_HOURS"
  tags                         = var.tags
}

# The features one after another: GuardDuty refuses concurrent updates of
# one detector ("detector is being updated").
resource "aws_guardduty_detector_feature" "s3" {
  detector_id = aws_guardduty_detector.this.id
  name        = "S3_DATA_EVENTS"
  status      = "ENABLED"
}

resource "aws_guardduty_detector_feature" "rds_login" {
  detector_id = aws_guardduty_detector.this.id
  name        = "RDS_LOGIN_EVENTS"
  status      = "ENABLED"
  depends_on  = [aws_guardduty_detector_feature.s3]
}

resource "aws_guardduty_detector_feature" "malware" {
  detector_id = aws_guardduty_detector.this.id
  name        = "EBS_MALWARE_PROTECTION"
  status      = "DISABLED"
  depends_on  = [aws_guardduty_detector_feature.rds_login]
}

resource "aws_guardduty_detector_feature" "runtime" {
  detector_id = aws_guardduty_detector.this.id
  name        = "RUNTIME_MONITORING"
  status      = "DISABLED"
  depends_on  = [aws_guardduty_detector_feature.malware]
}

# --- IAM Access Analyzer, password policy ---------------------------------
resource "aws_accessanalyzer_analyzer" "account" {
  analyzer_name = "${var.name}-account"
  type          = "ACCOUNT"
  tags          = var.tags
}

# Roles, users and permissions nobody used for 90 days (least privilege over
# time). Findings are read in the console; no alarm, they are hygiene.
resource "aws_accessanalyzer_analyzer" "unused" {
  count         = var.unused_access_analyzer_enabled ? 1 : 0
  analyzer_name = "${var.name}-unused-access"
  type          = "ACCOUNT_UNUSED_ACCESS"
  configuration {
    unused_access {
      unused_access_age = 90
    }
  }
  tags = var.tags
}

# One switch for the whole account: no bucket, now or later, can be made
# public by a policy or an ACL. Free.
resource "aws_s3_account_public_access_block" "this" {
  count                   = var.s3_account_block_public_access ? 1 : 0
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_iam_account_password_policy" "this" {
  minimum_password_length        = 14
  require_lowercase_characters   = true
  require_uppercase_characters   = true
  require_numbers                = true
  require_symbols                = true
  allow_users_to_change_password = true
  password_reuse_prevention      = 24
  max_password_age               = 0
}

# --- Findings → the alerts topic ------------------------------------------
resource "aws_cloudwatch_event_rule" "guardduty" {
  name        = "${var.name}-guardduty-findings"
  description = "GuardDuty findings of severity >= ${var.alert_severity}"
  event_pattern = jsonencode({
    source      = ["aws.guardduty"]
    detail-type = ["GuardDuty Finding"]
    detail = {
      severity = [{ numeric = [">=", var.alert_severity] }]
    }
  })
  tags = var.tags
}

resource "aws_cloudwatch_event_target" "guardduty" {
  rule      = aws_cloudwatch_event_rule.guardduty.name
  target_id = "alerts"
  arn       = var.alerts_topic_arn
  input_transformer {
    input_paths = {
      type        = "$.detail.type"
      severity    = "$.detail.severity"
      title       = "$.detail.title"
      description = "$.detail.description"
      region      = "$.region"
      id          = "$.detail.id"
    }
    input_template = "\"GuardDuty <severity> <type> in <region>: <title>. <description> (finding <id>)\""
  }
}

resource "aws_cloudwatch_event_rule" "access_analyzer" {
  name        = "${var.name}-access-analyzer-findings"
  description = "IAM Access Analyzer: a resource became reachable from outside the account"
  event_pattern = jsonencode({
    source      = ["aws.access-analyzer"]
    detail-type = ["Access Analyzer Finding"]
    detail      = { status = ["ACTIVE"] }
  })
  tags = var.tags
}

resource "aws_cloudwatch_event_target" "access_analyzer" {
  rule      = aws_cloudwatch_event_rule.access_analyzer.name
  target_id = "alerts"
  arn       = var.alerts_topic_arn
  input_transformer {
    input_paths = {
      resource     = "$.detail.resource"
      resourceType = "$.detail.resourceType"
      isPublic     = "$.detail.isPublic"
    }
    input_template = "\"IAM Access Analyzer: <resourceType> <resource> is shared outside the account (public: <isPublic>)\""
  }
}

# --- Security Hub (optional) ----------------------------------------------
resource "aws_securityhub_account" "this" {
  count                    = var.security_hub_enabled ? 1 : 0
  enable_default_standards = false
  auto_enable_controls     = true
}

resource "aws_securityhub_standards_subscription" "cis" {
  count         = var.security_hub_enabled ? 1 : 0
  standards_arn = "arn:${data.aws_partition.current.partition}:securityhub:${data.aws_region.current.name}::standards/cis-aws-foundations-benchmark/v/1.4.0"
  depends_on    = [aws_securityhub_account.this]
}

resource "aws_securityhub_standards_subscription" "fsbp" {
  count         = var.security_hub_enabled && var.securityhub_fsbp_enabled ? 1 : 0
  standards_arn = "arn:${data.aws_partition.current.partition}:securityhub:${data.aws_region.current.name}::standards/aws-foundational-security-best-practices/v/1.0.0"
  depends_on    = [aws_securityhub_account.this]
}

# --- Inspector: vulnerabilities in the container images --------------------
resource "aws_inspector2_enabler" "ecr" {
  count          = var.inspector_enabled ? 1 : 0
  account_ids    = [data.aws_caller_identity.current.account_id]
  resource_types = ["ECR"]
}

resource "aws_cloudwatch_event_rule" "inspector" {
  count       = var.inspector_enabled ? 1 : 0
  name        = "${var.name}-inspector-findings"
  description = "Inspector: a CRITICAL or HIGH vulnerability in a container image"
  event_pattern = jsonencode({
    source      = ["aws.inspector2"]
    detail-type = ["Inspector2 Finding"]
    detail = {
      status   = ["ACTIVE"]
      severity = ["CRITICAL", "HIGH"]
    }
  })
  tags = var.tags
}

resource "aws_cloudwatch_event_target" "inspector" {
  count     = var.inspector_enabled ? 1 : 0
  rule      = aws_cloudwatch_event_rule.inspector[0].name
  target_id = "alerts"
  arn       = var.alerts_topic_arn
  input_transformer {
    input_paths = {
      title    = "$.detail.title"
      severity = "$.detail.severity"
      resource = "$.detail.resources[0].id"
    }
    input_template = "\"Inspector <severity>: <title> in <resource>\""
  }
}

# --- The sensitive API calls and the root user ------------------------------
# Someone scheduling the deletion of the key that protects every document,
# switching the trail off, deleting a backup vault (or its lock) or lifting
# Block Public Access is either an operator mistake or an attack: both need
# a person to look today. PutBucketPolicy is left out on purpose (every
# terraform apply fires it); Access Analyzer reports a policy that opens
# a bucket. Console and API events of global services (IAM, sign-in) appear
# in us-east-1 only; run the same module there if the stack lives elsewhere.
resource "aws_cloudwatch_event_rule" "critical_api" {
  count       = var.critical_api_alerts_enabled ? 1 : 0
  name        = "${var.name}-critical-api-calls"
  description = "Key deletion, CloudTrail off, backup vault / lock deleted, Block Public Access lifted"
  event_pattern = jsonencode({
    detail-type = ["AWS API Call via CloudTrail"]
    detail = {
      eventName = [
        "ScheduleKeyDeletion",
        "DisableKey",
        "StopLogging",
        "DeleteTrail",
        "UpdateTrail",
        "DeleteBackupVault",
        "DeleteBackupVaultLockConfiguration",
        "DeleteBackupPlan",
        "DeleteBucketPolicy",
        "DeletePublicAccessBlock",
        "PutBucketPublicAccessBlock",
        "PutAccountPublicAccessBlock",
        "DeleteAccountPublicAccessBlock",
        "DeleteBucketEncryption",
        "DeleteBucketReplication",
        "DeleteDetector",
        "DisableSecurityHub",
        "DeleteAnalyzer",
      ]
    }
  })
  tags = var.tags
}

resource "aws_cloudwatch_event_target" "critical_api" {
  count     = var.critical_api_alerts_enabled ? 1 : 0
  rule      = aws_cloudwatch_event_rule.critical_api[0].name
  target_id = "alerts"
  arn       = var.alerts_topic_arn
  input_transformer {
    input_paths = {
      action = "$.detail.eventName"
      who    = "$.detail.userIdentity.arn"
      ip     = "$.detail.sourceIPAddress"
      region = "$.region"
    }
    input_template = "\"Sensitive AWS action <action> by <who> from <ip> in <region>. If this was not planned, open CloudTrail now (docs/runbooks/SECURITY_LEGAL.md, incident checklist).\""
  }
}

resource "aws_cloudwatch_event_rule" "root_usage" {
  count       = var.critical_api_alerts_enabled ? 1 : 0
  name        = "${var.name}-root-user-activity"
  description = "The AWS root user did something"
  event_pattern = jsonencode({
    detail-type = ["AWS API Call via CloudTrail", "AWS Console Sign In via CloudTrail"]
    detail = {
      userIdentity = { type = ["Root"] }
    }
  })
  tags = var.tags
}

resource "aws_cloudwatch_event_target" "root_usage" {
  count     = var.critical_api_alerts_enabled ? 1 : 0
  rule      = aws_cloudwatch_event_rule.root_usage[0].name
  target_id = "alerts"
  arn       = var.alerts_topic_arn
  input_transformer {
    input_paths = {
      action = "$.detail.eventName"
      ip     = "$.detail.sourceIPAddress"
      region = "$.region"
    }
    input_template = "\"AWS ROOT user used: <action> from <ip> in <region>. Nobody should use root; treat as an incident unless you just did.\""
  }
}

output "cloudtrail_bucket" { value = aws_s3_bucket.trail.id }
output "guardduty_detector_id" { value = aws_guardduty_detector.this.id }
