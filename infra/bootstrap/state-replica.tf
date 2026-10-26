# S4-14 (audit 2026-10-25): the Terraform state is the map of the whole
# infrastructure; losing the bucket (or one bad delete) loses it. Opt-in copy of
# every state version to a second Region. Off by default.
#
# Replication of SSE-KMS objects needs a customer-managed key (the AWS-managed
# aws/s3 key cannot be used), so turning this on also creates one key in each
# Region and points the state bucket's default encryption at the main-Region
# key (new state versions only). The READ-ONLY plan role of terraform-drift.yml
# needs kms:Decrypt on `state_kms_key_arn` (output) before the next daily run.
variable "state_replica_enabled" {
  type        = bool
  default     = false
  description = "Replicate the tfstate bucket to state_replica_region (about $0.1/month; state files are small)."
}
variable "state_replica_region" {
  type    = string
  default = "us-west-2"
}

provider "aws" {
  alias  = "replica"
  region = var.state_replica_region
  default_tags {
    tags = { Project = "lawbid", Env = var.env, ManagedBy = "terraform-bootstrap" }
  }
}

resource "aws_kms_key" "state" {
  count                   = var.state_replica_enabled ? 1 : 0
  description             = "${local.name} terraform state"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}

resource "aws_kms_key" "state_replica" {
  provider                = aws.replica
  count                   = var.state_replica_enabled ? 1 : 0
  description             = "${local.name} terraform state replica"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}

resource "aws_s3_bucket" "tfstate_replica" {
  provider = aws.replica
  count    = var.state_replica_enabled ? 1 : 0
  bucket   = "${local.name}-tfstate-replica"
}

resource "aws_s3_bucket_versioning" "tfstate_replica" {
  provider = aws.replica
  count    = var.state_replica_enabled ? 1 : 0
  bucket   = aws_s3_bucket.tfstate_replica[0].id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate_replica" {
  provider = aws.replica
  count    = var.state_replica_enabled ? 1 : 0
  bucket   = aws_s3_bucket.tfstate_replica[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state_replica[0].arn
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate_replica" {
  provider                = aws.replica
  count                   = var.state_replica_enabled ? 1 : 0
  bucket                  = aws_s3_bucket.tfstate_replica[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "state_replication_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["s3.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "state_replication" {
  count              = var.state_replica_enabled ? 1 : 0
  name               = "${local.name}-tfstate-replication"
  assume_role_policy = data.aws_iam_policy_document.state_replication_assume.json
}

data "aws_iam_policy_document" "state_replication" {
  count = var.state_replica_enabled ? 1 : 0
  statement {
    actions   = ["s3:GetReplicationConfiguration", "s3:ListBucket"]
    resources = [aws_s3_bucket.tfstate.arn]
  }
  statement {
    actions   = ["s3:GetObjectVersionForReplication", "s3:GetObjectVersionAcl", "s3:GetObjectVersionTagging"]
    resources = ["${aws_s3_bucket.tfstate.arn}/*"]
  }
  statement {
    actions   = ["s3:ReplicateObject", "s3:ReplicateDelete", "s3:ReplicateTags"]
    resources = ["${aws_s3_bucket.tfstate_replica[0].arn}/*"]
  }
  statement {
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.state[0].arn]
  }
  statement {
    actions   = ["kms:Encrypt", "kms:GenerateDataKey"]
    resources = [aws_kms_key.state_replica[0].arn]
  }
}

resource "aws_iam_role_policy" "state_replication" {
  count  = var.state_replica_enabled ? 1 : 0
  role   = aws_iam_role.state_replication[0].id
  policy = data.aws_iam_policy_document.state_replication[0].json
}

resource "aws_s3_bucket_replication_configuration" "tfstate" {
  count      = var.state_replica_enabled ? 1 : 0
  depends_on = [aws_s3_bucket_versioning.tfstate, aws_s3_bucket_versioning.tfstate_replica]
  role       = aws_iam_role.state_replication[0].arn
  bucket     = aws_s3_bucket.tfstate.id
  rule {
    id     = "tfstate-to-replica"
    status = "Enabled"
    filter {}
    # A deleted state must stay restorable from the copy.
    delete_marker_replication { status = "Disabled" }
    source_selection_criteria {
      sse_kms_encrypted_objects { status = "Enabled" }
    }
    destination {
      bucket = aws_s3_bucket.tfstate_replica[0].arn
      encryption_configuration { replica_kms_key_id = aws_kms_key.state_replica[0].arn }
    }
  }
}

output "state_kms_key_arn" { value = var.state_replica_enabled ? aws_kms_key.state[0].arn : "" }
output "state_replica_bucket" { value = var.state_replica_enabled ? aws_s3_bucket.tfstate_replica[0].id : "" }
