# Public status page (status.<domain>): one static index.html plus status.json
# in a private S3 bucket behind CloudFront. Deliberately NOT on the API, the
# load balancer or ECS: it must stay up when they are down. The API worker
# writes status.json every minute (STATUS_PAGE_BUCKET; apps/api
# src/common/ops/status/public-status.service.ts); the page says "data may be
# outdated" itself when the file stops updating.
#
# Owner 2026-10-25. Not applied yet, like the rest of infra/. Cost: cents.
# DNS: docs/runbooks/STATUS_PAGE.md (Namecheap/Route 53 now, Cloudflare later).
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "name" { type = string }
variable "tags" { type = map(string) }
variable "force_destroy" {
  type    = bool
  default = false
}
variable "status_host" {
  type        = string
  default     = ""
  description = "Host of the page (e.g. status.lawbid.dev). Empty = the CloudFront address only."
}
variable "certificate_arn" {
  type        = string
  default     = ""
  description = "ACM certificate (us-east-1) for status_host."
}
variable "create_certificate" {
  type        = bool
  default     = false
  description = "Request the ACM certificate here (stack region must be us-east-1). Validated by a DNS record the owner adds by hand (output validation_records)."
}
variable "hosted_zone_id" {
  type        = string
  default     = ""
  description = "Route 53 zone of status_host; empty = the DNS record is made by hand (or in Cloudflare)."
}
variable "web_acl_arn" {
  type    = string
  default = ""
}

data "aws_region" "current" {}

resource "aws_acm_certificate" "status" {
  count             = var.create_certificate && var.certificate_arn == "" && var.status_host != "" ? 1 : 0
  domain_name       = var.status_host
  validation_method = "DNS"
  tags              = var.tags

  lifecycle {
    create_before_destroy = true
    precondition {
      condition     = data.aws_region.current.name == "us-east-1"
      error_message = "CloudFront only reads certificates from us-east-1."
    }
  }
}

resource "aws_acm_certificate_validation" "status" {
  count                   = length(aws_acm_certificate.status)
  certificate_arn         = aws_acm_certificate.status[0].arn
  validation_record_fqdns = [for o in aws_acm_certificate.status[0].domain_validation_options : o.resource_record_name]
  timeouts { create = "60m" }
}

locals {
  certificate_arn = var.certificate_arn != "" ? var.certificate_arn : (length(aws_acm_certificate_validation.status) > 0 ? aws_acm_certificate_validation.status[0].certificate_arn : "")
  has_host        = var.status_host != "" && local.certificate_arn != ""
}

resource "aws_s3_bucket" "status" {
  bucket        = "${var.name}-status-page"
  force_destroy = var.force_destroy
  tags          = var.tags
}

resource "aws_s3_bucket_public_access_block" "status" {
  bucket                  = aws_s3_bucket.status.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "status" {
  bucket = aws_s3_bucket.status.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_cloudfront_origin_access_control" "status" {
  name                              = "${var.name}-status-page"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# The page itself comes from the repo: apps/status-page/index.html. status.json
# is written by the worker and is NOT managed here.
resource "aws_s3_object" "index" {
  bucket        = aws_s3_bucket.status.id
  key           = "index.html"
  source        = "${path.module}/../../../apps/status-page/index.html"
  etag          = filemd5("${path.module}/../../../apps/status-page/index.html")
  content_type  = "text/html; charset=utf-8"
  cache_control = "public, max-age=300"
}

# status.json: follow the file's own Cache-Control (30 s), never longer than 60 s.
resource "aws_cloudfront_cache_policy" "status" {
  name        = "${var.name}-status-page"
  default_ttl = 30
  min_ttl     = 0
  max_ttl     = 60
  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config { cookie_behavior = "none" }
    headers_config { header_behavior = "none" }
    query_strings_config { query_string_behavior = "none" }
    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true
  }
}

resource "aws_cloudfront_response_headers_policy" "status" {
  name = "${var.name}-status-page-security"
  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = false
      override                   = true
    }
    content_type_options { override = true }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "no-referrer"
      override        = true
    }
    content_security_policy {
      content_security_policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
      override                = true
    }
  }
}

resource "aws_cloudfront_distribution" "status" {
  enabled             = true
  comment             = "${var.name} public status page"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  aliases             = local.has_host ? [var.status_host] : []
  web_acl_id          = var.web_acl_arn == "" ? null : var.web_acl_arn

  origin {
    domain_name              = aws_s3_bucket.status.bucket_regional_domain_name
    origin_id                = "status"
    origin_access_control_id = aws_cloudfront_origin_access_control.status.id
  }

  default_cache_behavior {
    target_origin_id           = "status"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.status.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.status.id
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = local.has_host ? null : true
    acm_certificate_arn            = local.has_host ? local.certificate_arn : null
    ssl_support_method             = local.has_host ? "sni-only" : null
    minimum_protocol_version       = local.has_host ? "TLSv1.2_2021" : null
  }

  tags = var.tags
}

data "aws_iam_policy_document" "bucket" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.status.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.status.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "status" {
  bucket = aws_s3_bucket.status.id
  policy = data.aws_iam_policy_document.bucket.json
}

# Route 53 (only when the zone is in AWS; with Namecheap or Cloudflare DNS the
# owner adds the CNAME by hand: output dns_target).
resource "aws_route53_record" "status" {
  count   = local.has_host && var.hosted_zone_id != "" ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = var.status_host
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.status.domain_name
    zone_id                = aws_cloudfront_distribution.status.hosted_zone_id
    evaluate_target_health = false
  }
}

output "bucket" { value = aws_s3_bucket.status.id }
output "bucket_arn" { value = aws_s3_bucket.status.arn }
output "distribution_id" { value = aws_cloudfront_distribution.status.id }
output "dns_target" {
  value       = aws_cloudfront_distribution.status.domain_name
  description = "CNAME target for status_host (Namecheap, Route 53 or Cloudflare with the cloud GREY / DNS only)."
}
output "validation_records" {
  description = "DNS records to add by hand so ACM can issue the certificate."
  value = [for o in(length(aws_acm_certificate.status) > 0 ? aws_acm_certificate.status[0].domain_validation_options : []) : {
    name  = o.resource_record_name
    type  = o.resource_record_type
    value = o.resource_record_value
  }]
}
