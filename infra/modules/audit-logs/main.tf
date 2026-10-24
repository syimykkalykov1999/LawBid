# Security & legal pass 2026-10-24 — one bucket for the access logs that
# prove who touched what, kept apart from the data they describe:
#   * ALB access log (every request to the API and the admin panel: time,
#     client address, path without the query values, status, bytes),
#   * S3 server access log of the documents bucket (requester, key, action),
#   * VPC flow logs (which address talked to which task or database).
# None of these carry message text or document contents. The bucket is
# versioned, public access is blocked, nobody (not even an administrator
# role) can delete or overwrite a log file through IAM — only the lifecycle
# rule removes them after `retention_days`. Object Lock is the strongest
# form; it is optional because AWS log delivery to a bucket with Object Lock
# default retention is not supported by every service (check the current AWS
# docs for ELB and S3 server access logs before turning it on), and because
# it can only be chosen when the bucket is created.
#
# Default off (`enabled = false`): nothing is created.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "name" { type = string }
variable "enabled" {
  type        = bool
  default     = false
  description = "Create the log bucket and the flow logs."
}
variable "retention_days" {
  type        = number
  default     = 400
  description = "How long a log file is kept (400 days covers an annual SOC 2 audit window). Then the lifecycle removes it."
}
variable "object_lock_enabled" {
  type        = bool
  default     = false
  description = "S3 Object Lock (governance mode, retention_days) on the bucket. Only effective when the bucket is created; see the note at the top about log delivery support."
}
variable "vpc_id" {
  type        = string
  default     = ""
  description = "VPC to record flow logs for; empty = no flow logs."
}
variable "flow_logs_traffic" {
  type        = string
  default     = "ALL"
  description = "ALL, ACCEPT or REJECT. REJECT is the cheap choice (only refused connections)."
}
variable "tags" {
  type    = map(string)
  default = {}
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_elb_service_account" "this" {}

locals {
  on     = var.enabled ? 1 : 0
  bucket = "${var.name}-audit-logs-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "logs" {
  count               = local.on
  bucket              = local.bucket
  object_lock_enabled = var.object_lock_enabled
  tags                = var.tags
}

resource "aws_s3_bucket_public_access_block" "logs" {
  count                   = local.on
  bucket                  = aws_s3_bucket.logs[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "logs" {
  count  = local.on
  bucket = aws_s3_bucket.logs[0].id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_versioning" "logs" {
  count  = local.on
  bucket = aws_s3_bucket.logs[0].id
  versioning_configuration { status = "Enabled" }
}

# ELB access logs and S3 server access logs can only be written to a bucket
# encrypted with SSE-S3 (AES256); a KMS key is not accepted by either.
resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  count  = local.on
  bucket = aws_s3_bucket.logs[0].id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_object_lock_configuration" "logs" {
  count  = var.enabled && var.object_lock_enabled ? 1 : 0
  bucket = aws_s3_bucket.logs[0].id
  rule {
    default_retention {
      mode = "GOVERNANCE"
      days = var.retention_days
    }
  }
  depends_on = [aws_s3_bucket_versioning.logs]
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  count  = local.on
  bucket = aws_s3_bucket.logs[0].id
  rule {
    id     = "keep-then-expire"
    status = "Enabled"
    filter { prefix = "" }
    transition {
      days          = 90
      storage_class = "GLACIER_IR"
    }
    expiration { days = var.retention_days + 1 }
    noncurrent_version_expiration { noncurrent_days = 7 }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
  depends_on = [aws_s3_bucket_versioning.logs]
}

data "aws_iam_policy_document" "logs" {
  count = local.on
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.logs[0].arn, "${aws_s3_bucket.logs[0].arn}/*"]
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
  # Nobody deletes or rewrites a log through IAM — not the deploy role, not
  # an administrator. The account root user can still do it (break glass,
  # and it raises the root-usage alarm).
  statement {
    sid       = "NoDeleteByAnyRole"
    effect    = "Deny"
    actions   = ["s3:DeleteObject", "s3:DeleteObjectVersion"]
    resources = [aws_s3_bucket.logs[0].arn, "${aws_s3_bucket.logs[0].arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "StringNotLike"
      variable = "aws:PrincipalArn"
      values   = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
  statement {
    sid       = "AlbWritesAccessLog"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.logs[0].arn}/alb/AWSLogs/${data.aws_caller_identity.current.account_id}/*"]
    principals {
      type        = "AWS"
      identifiers = [data.aws_elb_service_account.this.arn]
    }
  }
  statement {
    sid       = "S3ServerAccessLog"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.logs[0].arn}/s3-documents/*"]
    principals {
      type        = "Service"
      identifiers = ["logging.s3.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
  statement {
    sid       = "FlowLogsWrite"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.logs[0].arn}/vpc-flow/AWSLogs/${data.aws_caller_identity.current.account_id}/*"]
    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
  statement {
    sid       = "FlowLogsAcl"
    actions   = ["s3:GetBucketAcl", "s3:ListBucket"]
    resources = [aws_s3_bucket.logs[0].arn]
    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_s3_bucket_policy" "logs" {
  count  = local.on
  bucket = aws_s3_bucket.logs[0].id
  policy = data.aws_iam_policy_document.logs[0].json
  depends_on = [
    aws_s3_bucket_public_access_block.logs,
    aws_s3_bucket_ownership_controls.logs,
  ]
}

resource "aws_flow_log" "vpc" {
  count                    = var.enabled && var.vpc_id != "" ? 1 : 0
  vpc_id                   = var.vpc_id
  traffic_type             = var.flow_logs_traffic
  log_destination_type     = "s3"
  log_destination          = "${aws_s3_bucket.logs[0].arn}/vpc-flow/"
  max_aggregation_interval = 600
  tags                     = var.tags
  depends_on               = [aws_s3_bucket_policy.logs]
}

# Depends on the policy so a service never validates a bucket that cannot
# yet receive its logs.
output "bucket" {
  value      = one(aws_s3_bucket.logs[*].id)
  depends_on = [aws_s3_bucket_policy.logs]
}
output "bucket_arn" { value = one(aws_s3_bucket.logs[*].arn) }
