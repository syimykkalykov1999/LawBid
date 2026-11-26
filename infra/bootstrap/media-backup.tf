# D10 (SECOND_PASS_2026-11-26, AWS WA REL09-BP01 "Identify and back up all
# data", SRE book ch. 26 "replication is not backup"): an independent copy of
# the public media that lives in Cloudflare R2 (avatars, post / review photos,
# stickers). R2 has no object versioning, and a bucket lock would refuse the
# deletes the app must do when a person removes a photo. So the copy is made
# outside R2: the nightly workflow .github/workflows/media-backup.yml runs
# rclone (MIT) "sync" from R2 into THIS bucket. The bucket is versioned: a file
# deleted or overwritten in R2 stays here as an old version for
# media_backup_noncurrent_days (30 = the same as the S3 media bucket), then it
# is gone, so a removed photo does not live on forever.
#
# On (owner 26.11 «Хорошо, включить сейчас»): the next bootstrap apply creates
# the bucket, its key and the role. The copy itself runs only once the read-only
# R2 key is saved in the admin (provider r2_backup; the workflow gets it from the
# API). Owner: docs/runbooks/backups.md, section "Публичные фото (R2) и видео (Bunny)".

variable "media_backup_enabled" {
  type        = bool
  default     = true
  description = "Bucket + OIDC role for the nightly R2 -> S3 copy of public media (media-backup.yml)."
}
variable "media_backup_noncurrent_days" {
  type        = number
  default     = 30
  description = "Days a file deleted or replaced in R2 stays recoverable in the backup bucket."
}

locals {
  media_backup_on = var.media_backup_enabled ? 1 : 0
}

resource "aws_kms_key" "media_backup" {
  count                   = local.media_backup_on
  description             = "${local.name} media backup (copy of the public R2 media)"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}

resource "aws_s3_bucket" "media_backup" {
  count  = local.media_backup_on
  bucket = "${local.name}-media-backup-${local.account}"
}

resource "aws_s3_bucket_versioning" "media_backup" {
  count  = local.media_backup_on
  bucket = aws_s3_bucket.media_backup[0].id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media_backup" {
  count  = local.media_backup_on
  bucket = aws_s3_bucket.media_backup[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.media_backup[0].arn
    }
    # One KMS call per bucket key instead of per object (S3 Bucket Keys).
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "media_backup" {
  count                   = local.media_backup_on
  bucket                  = aws_s3_bucket.media_backup[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "media_backup" {
  count  = local.media_backup_on
  bucket = aws_s3_bucket.media_backup[0].id
  rule {
    id     = "old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = var.media_backup_noncurrent_days }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
  rule {
    id     = "orphan-delete-markers"
    status = "Enabled"
    filter {}
    expiration { expired_object_delete_marker = true }
  }
  # Same as the S3 media bucket: files over 128 KB move to cheaper tiers when
  # nobody reads them (a backup is almost never read), no retrieval fee.
  rule {
    id     = "intelligent-tiering"
    status = "Enabled"
    filter { object_size_greater_than = 131072 }
    transition {
      days          = 0
      storage_class = "INTELLIGENT_TIERING"
    }
  }
  depends_on = [aws_s3_bucket_versioning.media_backup]
}

data "aws_iam_policy_document" "media_backup_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Only jobs in the GitHub environment media-backup (media-backup.yml).
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repo}:environment:media-backup",
        "repo:${var.github_repo_immutable}:environment:media-backup",
      ]
    }
  }
}

resource "aws_iam_role" "media_backup" {
  count              = local.media_backup_on
  name               = "${local.name}-github-media-backup"
  assume_role_policy = data.aws_iam_policy_document.media_backup_trust.json
  # The first full copy may run for hours (media-backup.yml role-duration-seconds).
  max_session_duration = 21600
}

# Only this bucket and its key: list, read, write and delete (rclone sync
# deletes what R2 no longer has; versioning keeps the old copy).
data "aws_iam_policy_document" "media_backup" {
  count = local.media_backup_on
  statement {
    sid       = "ListBackupBucket"
    actions   = ["s3:ListBucket", "s3:GetBucketLocation", "s3:ListBucketMultipartUploads"]
    resources = [aws_s3_bucket.media_backup[0].arn]
  }
  statement {
    sid = "ObjectsInBackupBucket"
    actions = [
      "s3:GetObject", "s3:PutObject", "s3:DeleteObject",
      "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts",
    ]
    resources = ["${aws_s3_bucket.media_backup[0].arn}/*"]
  }
  statement {
    sid       = "BackupKey"
    actions   = ["kms:GenerateDataKey", "kms:Decrypt", "kms:Encrypt"]
    resources = [aws_kms_key.media_backup[0].arn]
  }
}

resource "aws_iam_role_policy" "media_backup" {
  count  = local.media_backup_on
  role   = aws_iam_role.media_backup[0].name
  policy = data.aws_iam_policy_document.media_backup[0].json
}

output "media_backup_role_arn" {
  description = "GitHub environment media-backup secret AWS_MEDIA_BACKUP_ROLE (media-backup.yml)."
  value       = one(aws_iam_role.media_backup[*].arn)
}
output "media_backup_bucket" {
  description = "GitHub variable MEDIA_BACKUP_BUCKET (media-backup.yml)."
  value       = one(aws_s3_bucket.media_backup[*].bucket)
}
