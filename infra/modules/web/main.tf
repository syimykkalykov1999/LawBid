# The web version of the app (Flutter, `flutter build web --wasm`): a
# private S3 bucket behind CloudFront (origin access control). Every path
# that is not a file answers with index.html, so a link such as
# /lawyer/anna opens inside the app (the app routes it).
#
# Owner 2026-10-15. Not applied yet, like the rest of infra/.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "name" { type = string }
variable "tags" { type = map(string) }

variable "web_host" {
  type        = string
  default     = ""
  description = "Host the web app answers on (e.g. app.example.com). Empty = the CloudFront address only."
}

variable "certificate_arn" {
  type        = string
  default     = ""
  description = "ACM certificate for web_host. CloudFront only takes one from us-east-1."
}

variable "hosted_zone_id" {
  type        = string
  default     = ""
  description = "Route 53 zone of web_host; empty = the DNS record is made by hand."
}

variable "api_origin" {
  type        = string
  default     = ""
  description = "https://api.<domain> — allowed in connect-src of the page's content security policy."
}

variable "extra_connect_src" {
  type = list(string)
  default = [
    # Push (Firebase Cloud Messaging for the web)
    "https://fcmregistrations.googleapis.com",
    "https://fcm.googleapis.com",
    "https://firebaseinstallations.googleapis.com",
    "https://www.googleapis.com",
  ]
  description = "More hosts the page may call (push, storage, video, socket)."
}

variable "cross_origin_isolation" {
  type        = bool
  default     = false
  description = "Send COOP/COEP headers so the engine can render on a worker thread (faster, Chrome and Firefox). Off by default: turn on after checking images and video still load."
}

locals {
  has_host = var.web_host != "" && var.certificate_arn != ""
}

resource "aws_s3_bucket" "web" {
  bucket = "${var.name}-web"
  tags   = var.tags
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

# The site is rebuilt from source: old files are not kept for long.
resource "aws_s3_bucket_lifecycle_configuration" "web" {
  bucket = aws_s3_bucket.web.id
  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 14 }
  }
}

resource "aws_s3_bucket_versioning" "web" {
  bucket = aws_s3_bucket.web.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${var.name}-web"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_response_headers_policy" "web" {
  name    = "${var.name}-web-security"
  comment = "Security headers for the web app"

  dynamic "custom_headers_config" {
    for_each = var.cross_origin_isolation ? [1] : []
    content {
      items {
        header   = "Cross-Origin-Opener-Policy"
        value    = "same-origin"
        override = true
      }
      items {
        header   = "Cross-Origin-Embedder-Policy"
        value    = "credentialless"
        override = true
      }
    }
  }

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
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    # The Flutter engine needs wasm and inline styles; images and media
    # come from the CDN and the video host.
    content_security_policy {
      content_security_policy = join("; ", [
        "default-src 'self'",
        "script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline' https://www.gstatic.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com https://www.gstatic.com",
        "img-src 'self' data: blob: https:",
        "media-src 'self' blob: https:",
        "worker-src 'self' blob:",
        "connect-src ${join(" ", concat(["'self'", var.api_origin, "wss://${replace(var.api_origin, "https://", "")}"], var.extra_connect_src))}",
        "frame-ancestors 'none'",
        "base-uri 'self'",
      ])
      override = true
    }
  }
}

# The public pages (scripts/seo) are plain files in the same bucket:
# /lawyers/california/divorce/ is served from .../index.html.
resource "aws_cloudfront_function" "seo_index" {
  name    = "${var.name}-seo-index"
  runtime = "cloudfront-js-2.0"
  comment = "Directory URLs of the public pages end in index.html"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      if (/^\/(lawyers|attorneys|practice-areas)(\/|$)/.test(uri)) {
        if (uri.charAt(uri.length - 1) === '/') {
          request.uri = uri + 'index.html';
        } else if (uri.indexOf('.', uri.lastIndexOf('/')) === -1) {
          request.uri = uri + '/index.html';
        }
      }
      return request;
    }
  EOT
}

# Only the home page and the public pages are for search engines; every
# other address is an app screen (the same index.html), so it is `noindex`.
resource "aws_cloudfront_function" "app_noindex" {
  name    = "${var.name}-app-noindex"
  runtime = "cloudfront-js-2.0"
  comment = "noindex for app screens, indexable home page and public pages"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var response = event.response;
      var uri = event.request.uri;
      var indexable =
        uri === '/' ||
        /^\/(lawyers|attorneys|practice-areas)(\/|$)/.test(uri) ||
        uri === '/sitemap.xml' || uri === '/robots.txt';
      var isFile = /\.[a-z0-9]{2,5}$/i.test(uri);
      if (!indexable && !isFile) {
        response.headers['x-robots-tag'] = { value: 'noindex' };
      }
      return response;
    }
  EOT
}

# The engine and the page: always asked again (they change on every
# release); the hashed assets, icons and CanvasKit are cached by the
# `Cache-Control` the deploy writes on each object.
resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  comment             = "${var.name} web app"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  aliases             = local.has_host ? [var.web_host] : []

  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = "web"
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  default_cache_behavior {
    target_origin_id       = "web"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    # AWS managed CachingOptimized: follows the object's Cache-Control.
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.web.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.seo_index.arn
    }
    function_association {
      event_type   = "viewer-response"
      function_arn = aws_cloudfront_function.app_noindex.arn
    }
  }

  # S3 answers 403 for a missing key (no ListBucket for the OAC): the app
  # shows its own page, the router decides what it is.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = local.has_host ? null : true
    acm_certificate_arn            = local.has_host ? var.certificate_arn : null
    ssl_support_method             = local.has_host ? "sni-only" : null
    minimum_protocol_version       = local.has_host ? "TLSv1.2_2021" : null
  }

  tags = var.tags
}

data "aws_iam_policy_document" "web_cf" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web_cf.json
}

resource "aws_route53_record" "web" {
  count   = local.has_host && var.hosted_zone_id != "" ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = var.web_host
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "web_v6" {
  count   = local.has_host && var.hosted_zone_id != "" ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = var.web_host
  type    = "AAAA"
  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}

# What the deploy workflow needs: the bucket to upload to and the
# distribution to invalidate (the role may only do these two things).
data "aws_iam_policy_document" "deploy" {
  statement {
    actions   = ["s3:PutObject", "s3:DeleteObject", "s3:GetObject", "s3:ListBucket"]
    resources = [aws_s3_bucket.web.arn, "${aws_s3_bucket.web.arn}/*"]
  }
  statement {
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [aws_cloudfront_distribution.web.arn]
  }
}

resource "aws_iam_policy" "deploy" {
  name   = "${var.name}-web-deploy"
  policy = data.aws_iam_policy_document.deploy.json
  tags   = var.tags
}

output "web_bucket" { value = aws_s3_bucket.web.bucket }
output "web_distribution_id" { value = aws_cloudfront_distribution.web.id }
output "web_cdn_domain" { value = aws_cloudfront_distribution.web.domain_name }
output "web_deploy_policy_arn" { value = aws_iam_policy.deploy.arn }
