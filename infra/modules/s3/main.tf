# docs/06 §6.1 / §6.4 — private documents bucket (versioned, SSE-KMS,
# replicated to a second region), private media bucket behind CloudFront
# (origin access control), lifecycle for export files and old versions.
terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.60"
      configuration_aliases = [aws.replica]
    }
  }
}

variable "name" { type = string }
variable "force_destroy" {
  type        = bool
  default     = false
  description = "Let terraform destroy delete a bucket that still holds objects. Only for throw-away load-test stacks."
}
variable "kms_key_arn" { type = string }
variable "media_web_acl_arn" {
  type        = string
  default     = ""
  description = "CloudFront-scope WAF web ACL for the media CDN (modules/cdn-waf); empty = none."
}
variable "replica_kms_key_arn" {
  type        = string
  description = "KMS key in the replica region for the documents copy."
}
variable "tags" {
  type    = map(string)
  default = {}
}
variable "access_log_bucket" {
  type        = string
  default     = ""
  description = "Security & legal pass 2026-10-24: bucket (modules/audit-logs) that receives the S3 server access log of the documents bucket: requester, object key, operation, time. Empty = no access log."
}
variable "documents_cdn_public_key_pem" {
  type        = string
  default     = ""
  description = "Owner 2026-10-22 (systems checklist §22): PEM public key of the CloudFront signing key pair for private media (chat photos/voice/files, case files, documents). Empty = no documents CloudFront; the API keeps presigned S3 GET links. The private key goes to Secrets Manager as CLOUDFRONT_PRIVATE_KEY_PEM (extra_secrets)."
}
variable "cors_allowed_origins" {
  type        = list(string)
  default     = ["https://syimykkalykov1999.github.io"]
  description = "Browser origins allowed to upload (presigned POST) and read (signed GET) directly. The mobile app needs none."
}

locals {
  documents     = "${var.name}-documents"
  media         = "${var.name}-media"
  documents_cdn = var.documents_cdn_public_key_pem != "" ? 1 : 0
}

# --- documents (verification files, exports; never public) -------------
resource "aws_s3_bucket" "documents" {
  bucket        = local.documents
  force_destroy = var.force_destroy
  tags          = var.tags
}

resource "aws_s3_bucket" "documents_replica" {
  provider      = aws.replica
  bucket        = "${local.documents}-replica"
  force_destroy = var.force_destroy
  tags          = var.tags
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id
  versioning_configuration { status = "Enabled" }
}

# Who touched which object: requester, key, operation, status (delivered
# within hours, free to switch on; the log bucket costs cents).
resource "aws_s3_bucket_logging" "documents" {
  count         = var.access_log_bucket == "" ? 0 : 1
  bucket        = aws_s3_bucket.documents.id
  target_bucket = var.access_log_bucket
  target_prefix = "s3-documents/"
}

resource "aws_s3_bucket_versioning" "documents_replica" {
  provider = aws.replica
  bucket   = aws_s3_bucket.documents_replica.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents_replica" {
  provider = aws.replica
  bucket   = aws_s3_bucket.documents_replica.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.replica_kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket                  = aws_s3_bucket.documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "documents_replica" {
  provider                = aws.replica
  bucket                  = aws_s3_bucket.documents_replica.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# docs/06 §5.2/§5.3: export objects are short-lived; old versions of
# documents are kept 90 days for recovery, then pruned.
resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    id     = "exports-expire"
    status = "Enabled"
    filter { prefix = "exports/" }
    expiration { days = 3 }
    noncurrent_version_expiration { noncurrent_days = 1 }
  }
  # Owner 2026-10-20: government-request archives (ZIP of chats and
  # profiles) live 30 days. The worker removes each one at its own
  # expires_at (legal.export_ttl_days, 30); this rule is the second net a
  # day later, so a stuck worker never leaves personal data lying around.
  rule {
    id     = "legal-exports-expire"
    status = "Enabled"
    filter { prefix = "legal-exports/" }
    expiration { days = 31 }
    noncurrent_version_expiration { noncurrent_days = 1 }
  }
  rule {
    id     = "old-versions"
    status = "Enabled"
    filter { prefix = "" }
    noncurrent_version_expiration { noncurrent_days = 90 }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
  # Cleanup: a delete marker whose old versions are all gone is just clutter.
  rule {
    id     = "orphan-delete-markers"
    status = "Enabled"
    filter { prefix = "" }
    expiration { expired_object_delete_marker = true }
  }
  # Owner 2026-10-05 (storage like Telegram): case files, chat documents
  # and voice notes are read in the first weeks and rarely after. Same as
  # media: Intelligent-Tiering moves each one to a cheaper tier after 30 /
  # 90 days without reads and back on the next read (no retrieval fee, no
  # minimum duration). Files under 128 KB stay in Standard.
  rule {
    id     = "intelligent-tiering"
    status = "Enabled"
    filter { object_size_greater_than = 131072 }
    transition {
      days          = 0
      storage_class = "INTELLIGENT_TIERING"
    }
  }
}

# Owner 2026-10-07 (browser beta): the web app on GitHub Pages uploads
# straight to S3 with the presigned POST policy of FilesService and reads
# private files over short signed GET links. Browsers need CORS for both;
# the native app does not. The replica is never read by clients.
resource "aws_s3_bucket_cors_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  cors_rule {
    allowed_origins = var.cors_allowed_origins
    allowed_methods = ["POST", "GET", "HEAD"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

data "aws_iam_policy_document" "replication_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["s3.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "replication" {
  name               = "${var.name}-s3-replication"
  assume_role_policy = data.aws_iam_policy_document.replication_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "replication" {
  statement {
    actions   = ["s3:GetReplicationConfiguration", "s3:ListBucket"]
    resources = [aws_s3_bucket.documents.arn]
  }
  statement {
    actions   = ["s3:GetObjectVersionForReplication", "s3:GetObjectVersionAcl", "s3:GetObjectVersionTagging"]
    resources = ["${aws_s3_bucket.documents.arn}/*"]
  }
  statement {
    actions   = ["s3:ReplicateObject", "s3:ReplicateDelete", "s3:ReplicateTags"]
    resources = ["${aws_s3_bucket.documents_replica.arn}/*"]
  }
  statement {
    actions   = ["kms:Decrypt"]
    resources = [var.kms_key_arn]
  }
  statement {
    actions   = ["kms:Encrypt", "kms:GenerateDataKey"]
    resources = [var.replica_kms_key_arn]
  }
}

resource "aws_iam_role_policy" "replication" {
  role   = aws_iam_role.replication.id
  policy = data.aws_iam_policy_document.replication.json
}

resource "aws_s3_bucket_replication_configuration" "documents" {
  depends_on = [aws_s3_bucket_versioning.documents, aws_s3_bucket_versioning.documents_replica]
  role       = aws_iam_role.replication.arn
  bucket     = aws_s3_bucket.documents.id
  rule {
    id     = "documents-to-replica"
    status = "Enabled"
    filter {}
    delete_marker_replication { status = "Enabled" }
    source_selection_criteria {
      sse_kms_encrypted_objects { status = "Enabled" }
    }
    destination {
      bucket        = aws_s3_bucket.documents_replica.arn
      storage_class = "STANDARD_IA"
      encryption_configuration { replica_kms_key_id = var.replica_kms_key_arn }
    }
  }
}

# --- media (post images, avatars) via CloudFront ------------------------
resource "aws_s3_bucket" "media" {
  bucket        = local.media
  force_destroy = var.force_destroy
  tags          = var.tags
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Owner 2026-10-20: the replica copy of a government-request archive goes
# with the original (delete markers are replicated, the old version is then
# pruned a day later).
resource "aws_s3_bucket_lifecycle_configuration" "documents_replica" {
  provider = aws.replica
  bucket   = aws_s3_bucket.documents_replica.id
  rule {
    id     = "legal-exports-expire"
    status = "Enabled"
    filter { prefix = "legal-exports/" }
    expiration { days = 31 }
    noncurrent_version_expiration { noncurrent_days = 1 }
  }
  # Cleanup: the replica mirrors every version of `documents`; same 90 days.
  rule {
    id     = "old-versions"
    status = "Enabled"
    filter { prefix = "" }
    noncurrent_version_expiration { noncurrent_days = 90 }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
  rule {
    id     = "orphan-delete-markers"
    status = "Enabled"
    filter { prefix = "" }
    expiration { expired_object_delete_marker = true }
  }
  # S9-8 (2026-10-25): the primary already tiers (intelligent-tiering rule
  # above); the replica is written as STANDARD_IA by the replication rule
  # (30-day minimum), and after those 30 days a copy nobody reads moves on to
  # Intelligent-Tiering like the primary. Small files stay where they are
  # (IA bills 128 KB minimum anyway).
  rule {
    id     = "intelligent-tiering-after-ia"
    status = "Enabled"
    filter { object_size_greater_than = 131072 }
    transition {
      days          = 30
      storage_class = "INTELLIGENT_TIERING"
    }
  }
  depends_on = [aws_s3_bucket_versioning.documents_replica]
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    id     = "old-versions"
    status = "Enabled"
    filter { prefix = "" }
    noncurrent_version_expiration { noncurrent_days = 30 }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
  # Cleanup: user media itself is NEVER expired (keys are <purpose>/<user>/<file>,
  # there is no temp prefix). Only a delete marker with no versions left goes.
  rule {
    id     = "orphan-delete-markers"
    status = "Enabled"
    filter { prefix = "" }
    expiration { expired_object_delete_marker = true }
  }
  # Old photos are rarely opened: Intelligent-Tiering moves each file to a
  # cheaper tier after 30 / 90 days without reads and back on the next read
  # (no retrieval fee, same URL). Files under 128 KB stay in Standard.
  rule {
    id     = "intelligent-tiering"
    status = "Enabled"
    filter { object_size_greater_than = 131072 }
    transition {
      days          = 0
      storage_class = "INTELLIGENT_TIERING"
    }
  }
}

# Same as documents: avatars, post photos, stickers are POSTed straight to
# the bucket; without MEDIA_CDN_BASE_URL they are also read by signed GET.
resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  cors_rule {
    allowed_origins = var.cors_allowed_origins
    allowed_methods = ["POST", "GET", "HEAD"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "${var.name}-media"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Flutter web (CanvasKit) loads every image with fetch(), so CDN answers
# must carry Access-Control-Allow-Origin for the web app. CloudFront adds
# the header itself for a matching Origin (after the cache, so one cached
# object serves every origin); the cache policy does not forward Origin
# to S3, so S3 never sends its own CORS headers here.
resource "aws_cloudfront_response_headers_policy" "media_cors" {
  name    = "${var.name}-media-cors"
  comment = "CORS for the web app (s3_cors_allowed_origins)"
  cors_config {
    access_control_allow_credentials = false
    access_control_allow_origins { items = var.cors_allowed_origins }
    access_control_allow_methods { items = ["GET", "HEAD", "OPTIONS"] }
    access_control_allow_headers { items = ["*"] }
    access_control_expose_headers { items = ["ETag"] }
    access_control_max_age_sec = 3000
    origin_override            = false
  }
}

resource "aws_cloudfront_distribution" "media" {
  enabled         = true
  comment         = "${var.name} media"
  price_class     = "PriceClass_100"
  is_ipv6_enabled = true
  # Security research #5 (2026-10-22), A3: a per-IP rate limit on the media
  # CDN (hotlinking / download loops cost egress).
  web_acl_id = var.media_web_acl_arn == "" ? null : var.media_web_acl_arn

  origin {
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_id                = "media"
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  default_cache_behavior {
    target_origin_id       = "media"
    viewer_protocol_policy = "https-only"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    # AWS managed CachingOptimized policy.
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.media_cors.id
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate { cloudfront_default_certificate = true }
  tags = var.tags
}

# Security & legal pass 2026-10-24: nothing is read or written over plain
# HTTP (ABA 477R: encryption in transit). Every legitimate caller (the API,
# CloudFront, replication, the AWS SDK) already uses TLS.
data "aws_iam_policy_document" "tls_only_media" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.media.arn, "${aws_s3_bucket.media.arn}/*"]
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

data "aws_iam_policy_document" "tls_only_documents" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.documents.arn, "${aws_s3_bucket.documents.arn}/*"]
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

data "aws_iam_policy_document" "media_cf" {
  source_policy_documents = [data.aws_iam_policy_document.tls_only_media.json]
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.media.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.media.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id
  policy = data.aws_iam_policy_document.media_cf.json
}

# --- documents behind CloudFront with signed URLs (owner 2026-10-22) ------
# Private media (chat photos/voice/files, case files, documents) is served
# through CloudFront with a trusted key group: the API signs each link with
# the private key (@aws-sdk/cloudfront-signer), CloudFront checks the
# signature and reads the bucket through OAC. Objects are immutable, so the
# edge may cache them for a day; the link itself lives as long as the API
# says (minutes). Nothing is created until the owner supplies the public key.
resource "aws_cloudfront_public_key" "documents" {
  count       = local.documents_cdn
  name        = "${var.name}-documents-signing"
  comment     = "${var.name}: public key of the private-media signing pair"
  encoded_key = var.documents_cdn_public_key_pem
  lifecycle { create_before_destroy = true }
}

resource "aws_cloudfront_key_group" "documents" {
  count   = local.documents_cdn
  name    = "${var.name}-documents-signers"
  comment = "${var.name}: trusted signers for private media"
  items   = [aws_cloudfront_public_key.documents[0].id]
}

resource "aws_cloudfront_origin_access_control" "documents" {
  count                             = local.documents_cdn
  name                              = "${var.name}-documents"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# The API asks S3 for a download name / Cache-Control through the
# response-* query parameters; they must reach the origin and be part of
# the cache key (S3 honours them only on signed requests — OAC signs).
resource "aws_cloudfront_cache_policy" "documents" {
  count       = local.documents_cdn
  name        = "${var.name}-documents-signed"
  comment     = "Immutable private media: cache a day, key on the response-* params"
  default_ttl = 86400
  max_ttl     = 86400
  min_ttl     = 0
  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
    cookies_config { cookie_behavior = "none" }
    headers_config { header_behavior = "none" }
    query_strings_config {
      query_string_behavior = "whitelist"
      query_strings { items = ["response-content-disposition", "response-cache-control", "response-content-type"] }
    }
  }
}

resource "aws_cloudfront_response_headers_policy" "documents_cors" {
  count   = local.documents_cdn
  name    = "${var.name}-documents-cors"
  comment = "CORS for the web app (s3_cors_allowed_origins), no sniffing"
  cors_config {
    access_control_allow_credentials = false
    access_control_allow_origins { items = var.cors_allowed_origins }
    access_control_allow_methods { items = ["GET", "HEAD", "OPTIONS"] }
    access_control_allow_headers { items = ["*"] }
    access_control_expose_headers { items = ["ETag", "Content-Disposition"] }
    access_control_max_age_sec = 3000
    origin_override            = false
  }
  security_headers_config {
    content_type_options { override = true }
  }
}

resource "aws_cloudfront_distribution" "documents" {
  count           = local.documents_cdn
  enabled         = true
  comment         = "${var.name} private media (signed URLs)"
  price_class     = "PriceClass_100"
  is_ipv6_enabled = true
  web_acl_id      = var.media_web_acl_arn == "" ? null : var.media_web_acl_arn

  origin {
    domain_name              = aws_s3_bucket.documents.bucket_regional_domain_name
    origin_id                = "documents"
    origin_access_control_id = aws_cloudfront_origin_access_control.documents[0].id
  }

  default_cache_behavior {
    target_origin_id           = "documents"
    viewer_protocol_policy     = "https-only"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = false
    cache_policy_id            = aws_cloudfront_cache_policy.documents[0].id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.documents_cors[0].id
    trusted_key_groups         = [aws_cloudfront_key_group.documents[0].id]
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate { cloudfront_default_certificate = true }
  tags = var.tags
}

data "aws_iam_policy_document" "documents_cf" {
  count = local.documents_cdn
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.documents.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.documents[0].arn]
    }
  }
}

# Always present now (it used to exist only with the private CDN): the
# TLS-only rule must hold even before the signing key is supplied.
data "aws_iam_policy_document" "documents_all" {
  source_policy_documents = concat(
    [data.aws_iam_policy_document.tls_only_documents.json],
    data.aws_iam_policy_document.documents_cf[*].json,
  )
}

moved {
  from = aws_s3_bucket_policy.documents[0]
  to   = aws_s3_bucket_policy.documents
}

resource "aws_s3_bucket_policy" "documents" {
  bucket = aws_s3_bucket.documents.id
  policy = data.aws_iam_policy_document.documents_all.json
}

output "documents_bucket" { value = aws_s3_bucket.documents.bucket }
output "documents_bucket_arn" { value = aws_s3_bucket.documents.arn }
output "media_bucket" { value = aws_s3_bucket.media.bucket }
output "media_bucket_arn" { value = aws_s3_bucket.media.arn }
output "media_cdn_domain" { value = aws_cloudfront_distribution.media.domain_name }
output "documents_cdn_domain" { value = one(aws_cloudfront_distribution.documents[*].domain_name) }
output "documents_cdn_key_pair_id" { value = one(aws_cloudfront_public_key.documents[*].id) }
