# Security & legal pass 2026-10-24 — Amazon Macie on the documents bucket:
# a scheduled job reads a sample of the stored files and reports which ones
# hold what looks like a social security number, a card number, a passport,
# medical or tax data. For a law-firm product that answers two questions
# honestly: "where could regulated data be sitting?" (HIPAA-like clients)
# and "did something end up in a place it should not be?". Findings go to
# the alerts topic. Macie never changes or deletes a file.
#
# Cost control: Macie bills per gigabyte it inspects (about $1 per GB,
# approximate; the first 30 days are free) plus about $0.10 per bucket a
# month. `sampling_percentage` caps the work: at 10 % a 200 GB bucket costs
# about $20 for a monthly pass. The job runs monthly, never continuously.
#
# Macie reads SSE-KMS objects only if the bucket's key allows its
# service-linked role; modules/kms does that when `allow_macie = true`.
#
# Default off: the stack creates this module only when macie_enabled.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "name" { type = string }
variable "bucket_names" {
  type        = list(string)
  description = "Buckets the job inspects (the documents bucket)."
}
variable "sampling_percentage" {
  type        = number
  default     = 10
  description = "Share of the objects inspected on each run (1-100). The cost cap: cost is proportional."
}
variable "alerts_topic_arn" { type = string }
variable "tags" {
  type    = map(string)
  default = {}
}

data "aws_caller_identity" "current" {}

resource "aws_macie2_account" "this" {
  finding_publishing_frequency = "SIX_HOURS"
  status                       = "ENABLED"
}

resource "aws_macie2_classification_job" "documents" {
  name                = "${var.name}-documents-monthly"
  job_type            = "SCHEDULED"
  sampling_percentage = var.sampling_percentage
  schedule_frequency {
    monthly_schedule = 1 # day of the month
  }
  s3_job_definition {
    bucket_definitions {
      account_id = data.aws_caller_identity.current.account_id
      buckets    = var.bucket_names
    }
  }
  tags       = var.tags
  depends_on = [aws_macie2_account.this]
}

resource "aws_cloudwatch_event_rule" "macie" {
  name        = "${var.name}-macie-findings"
  description = "Macie: sensitive data found in a stored file (medium and above)"
  event_pattern = jsonencode({
    source      = ["aws.macie"]
    detail-type = ["Macie Finding"]
    detail = {
      severity = { description = ["High", "Medium"] }
    }
  })
  tags = var.tags
}

resource "aws_cloudwatch_event_target" "macie" {
  rule      = aws_cloudwatch_event_rule.macie.name
  target_id = "alerts"
  arn       = var.alerts_topic_arn
  input_transformer {
    input_paths = {
      type     = "$.detail.type"
      severity = "$.detail.severity.description"
      bucket   = "$.detail.resourcesAffected.s3Bucket.name"
    }
    input_template = "\"Macie <severity>: <type> in bucket <bucket>. Open Macie in the AWS console for the list of files (no file contents are in this message).\""
  }
}
