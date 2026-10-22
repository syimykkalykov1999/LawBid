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

variable "create_certificate" {
  type        = bool
  default     = false
  description = "Request the ACM certificate here (needs the stack's main region to be us-east-1, where CloudFront reads it). Validated by DNS records the owner adds by hand (see web_certificate_validation). Ignored when certificate_arn is given."
}

variable "extra_hosts" {
  type        = list(string)
  default     = []
  description = "More hosts that open the same app and go on the certificate and the CloudFront aliases (e.g. www.lawbid.dev)."
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

# Owner 2026-10-18 (release check): on the live site the page could call only
# the API, so the browser blocked photo/file uploads (presigned S3 POST),
# video uploads (Bunny TUS), images and videos the engine reads through
# fetch, the engine's fallback fonts for Chinese/Arabic/Hindi/…
# (fonts.gstatic.com) and the card page's Stripe script and frames.
variable "media_origins" {
  type        = list(string)
  default     = []
  description = "Origins of the media CDN / custom media domain (https://<id>.cloudfront.net)."
}

variable "app_connect_src" {
  type = list(string)
  default = [
    "https://*.amazonaws.com",    # uploads (presigned POST) and signed links
    "https://*.cloudfront.net",   # media CDN
    "https://video.bunnycdn.com", # video uploads (TUS)
    "https://*.b-cdn.net",        # video playback
    "https://fonts.gstatic.com",  # engine fallback fonts
    "https://api.stripe.com",     # card page (/pay.html)
    "https://*.stripe.com",
    "https://*.stripe.network",
    "https://maps.googleapis.com",
  ]
  description = "Hosts the app itself calls besides the API (storage, media, video, fonts, Stripe)."
}

variable "stripe_script_src" {
  type        = list(string)
  default     = ["https://js.stripe.com", "https://*.js.stripe.com", "https://maps.googleapis.com"]
  description = "Stripe.js for the card page (/pay.html)."
}

variable "stripe_frame_src" {
  type        = list(string)
  default     = ["https://js.stripe.com", "https://*.js.stripe.com", "https://hooks.stripe.com"]
  description = "Stripe card fields and 3-D Secure frames on the card page."
}

variable "cross_origin_isolation" {
  type        = bool
  default     = false
  description = "Send COOP/COEP headers so the engine can render on a worker thread (faster, Chrome and Firefox). Off by default: turn on after checking images and video still load."
}

data "aws_region" "current" {}

resource "aws_acm_certificate" "web" {
  count                     = var.create_certificate && var.certificate_arn == "" && var.web_host != "" ? 1 : 0
  domain_name               = var.web_host
  subject_alternative_names = var.extra_hosts
  validation_method         = "DNS"
  tags                      = var.tags

  lifecycle {
    create_before_destroy = true
    precondition {
      condition     = data.aws_region.current.name == "us-east-1"
      error_message = "CloudFront only reads certificates from us-east-1."
    }
  }
}

# Waits until the owner's DNS records exist and ACM says "Issued". First run:
# `terraform apply -target=module.stack.module.web.aws_acm_certificate.web`,
# add the records from `web_certificate_validation`, then the full apply.
resource "aws_acm_certificate_validation" "web" {
  count                   = length(aws_acm_certificate.web)
  certificate_arn         = aws_acm_certificate.web[0].arn
  validation_record_fqdns = [for o in aws_acm_certificate.web[0].domain_validation_options : o.resource_record_name]
  timeouts { create = "60m" }
}

locals {
  certificate_arn = var.certificate_arn != "" ? var.certificate_arn : (length(aws_acm_certificate_validation.web) > 0 ? aws_acm_certificate_validation.web[0].certificate_arn : "")
  has_host        = var.web_host != "" && local.certificate_arn != ""
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

# Owner 2026-10-22 (audit #7): the app's pages run no inline script (the
# boot code is in boot_head.js / boot_end.js, the card page's in pay.js), so
# its policy has no 'unsafe-inline' for scripts: a script injected into the
# page can not run. The company site (LawBidSite, a Next.js static export)
# writes inline scripts into every page, so its paths get the same policy
# plus 'unsafe-inline' (see `site_paths` and the ordered behaviors below).
locals {
  site_paths = [
    "about", "clients", "for-attorneys", "features", "pricing", "faq", "contact",
    "download", "terms", "privacy", "delete-account", "client-agreement",
    "attorney-agreement", "eula", "refunds", "third-party-services", "cookies",
    "sms-consent", "dmca", "accessibility",
  ]
  csp_rest = [
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com https://www.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    "connect-src ${join(" ", concat(["'self'", var.api_origin, "wss://${replace(var.api_origin, "https://", "")}", "https://*.ingest.sentry.io", "https://*.ingest.us.sentry.io"], var.extra_connect_src, var.app_connect_src, var.media_origins))}",
    "frame-src ${join(" ", concat(["'self'"], var.stripe_frame_src))}",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ]
  script_src = concat(["'self'", "'wasm-unsafe-eval'", "https://www.gstatic.com"], var.stripe_script_src)
  csp = {
    app  = join("; ", concat(["default-src 'self'", "script-src ${join(" ", local.script_src)}"], local.csp_rest))
    site = join("; ", concat(["default-src 'self'", "script-src ${join(" ", concat(local.script_src, ["'unsafe-inline'"]))}"], local.csp_rest))
  }
}

moved {
  from = aws_cloudfront_response_headers_policy.web
  to   = aws_cloudfront_response_headers_policy.web["app"]
}

resource "aws_cloudfront_response_headers_policy" "web" {
  for_each = local.csp
  name     = each.key == "app" ? "${var.name}-web-security" : "${var.name}-site-security"
  comment  = each.key == "app" ? "Security headers for the web app" : "Security headers for the company site pages"

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
    # come from the CDN and the video host. No inline scripts (see locals).
    content_security_policy {
      content_security_policy = each.value
      override                = true
    }
  }
}

# Audit #10 (2026-10-22): which web release is live. The deploy uploads
# every build to releases/<sha>/ and then switches `web_release` here (one
# atomic write, seconds to propagate); a rollback switches it back. Until
# the first versioned deploy the store is empty and the old root layout
# is served. `web_app_paths` lists the build's top-level names (assets,
# canvaskit, main.dart.wasm, ...) — those URLs are read from the release.
resource "aws_cloudfront_key_value_store" "web" {
  name    = "${var.name}-web-release"
  comment = "Live web release (web-deploy.yml / rollback.yml)"
}

# The public pages are plain files in the same bucket: the SEO pages
# (scripts/seo: /lawyers, /attorneys/<name>, /practice-areas) and the
# company site (LawBidSite static export: /about, /pricing, the legal
# pages...). Owner 2026-10-16: the app is on the domain root, the site's
# landing moved to /about. A public-page address without a file extension
# is read as <address>/index.html. Audit #14 (2026-10-22): when that file
# is missing S3 answers 403 and the visitor gets a REAL 404 (the app's
# page as the body, custom_error_response below) — a deleted /attorneys/x
# is no longer a "soft 404" for search engines. Every other address
# without an extension is an app screen and gets the app's page (200)
# straight away, without the error detour.
# www.<host> answers with a permanent redirect to <host> (one address for
# search engines).
resource "aws_cloudfront_function" "seo_index" {
  name                         = "${var.name}-seo-index"
  runtime                      = "cloudfront-js-2.0"
  comment                      = "www to the bare host; public pages end in index.html (real 404); app screens and files from the live release"
  publish                      = true
  key_value_store_associations = [aws_cloudfront_key_value_store.web.arn]
  code                         = <<-EOT
    import cf from 'cloudfront';
    var kvs = cf.kvs('${aws_cloudfront_key_value_store.web.id}');
    var PUBLIC = /^\/(lawyers|attorneys|practice-areas|about|clients|for-attorneys|features|pricing|faq|contact|download|terms|privacy|delete-account|client-agreement|attorney-agreement|eula|refunds|third-party-services|cookies|sms-consent|dmca|accessibility)(\/|$)/;
    var ROOT_FILES = ['/sitemap.xml', '/robots.txt', '/public-paths.txt'];
    async function get(key) {
      try { return await kvs.get(key); } catch (e) { return ''; }
    }
    async function handler(event) {
      var request = event.request;
      var host = request.headers.host ? request.headers.host.value : '';
      if (host.indexOf('www.') === 0) {
        var qs = [];
        for (var k in request.querystring) {
          var q = request.querystring[k];
          qs.push(q.value === '' ? k : k + '=' + q.value);
        }
        return {
          statusCode: 301,
          statusDescription: 'Moved Permanently',
          headers: {
            location: {
              value: 'https://' + host.substring(4) + request.uri + (qs.length ? '?' + qs.join('&') : '')
            }
          }
        };
      }
      var uri = request.uri;
      // /.well-known/ holds extension-less files (app links): served as is.
      if (uri.indexOf('/.well-known/') === 0 || ROOT_FILES.indexOf(uri) !== -1) return request;
      var hasExt = uri.indexOf('.', uri.lastIndexOf('/')) !== -1;
      if (uri !== '/' && PUBLIC.test(uri)) {
        if (!hasExt) {
          request.uri = uri.charAt(uri.length - 1) === '/' ? uri + 'index.html' : uri + '/index.html';
        }
        return request;
      }
      var first = uri.split('/')[1] || '';
      var release = await get('web_release');
      if (!release) {
        // The old layout (before the first versioned deploy): app files
        // at the root, an app screen is the root index.html.
        if (uri !== '/' && !hasExt && ['assets', 'canvaskit', 'icons'].indexOf(first) === -1) {
          request.uri = '/index.html';
        }
        return request;
      }
      var base = '/releases/' + release;
      var app = (',' + (await get('web_app_paths')) + ',').indexOf(',' + first + ',') !== -1;
      if (uri === '/') {
        request.uri = base + '/index.html';
      } else if (app) {
        request.uri = base + uri;
      } else if (!hasExt) {
        // An app screen: the same page, under a name noindex can tell apart.
        request.uri = base + '/spa.html';
      }
      // Anything else (the company site's own files) stays at the root.
      return request;
    }
  EOT
}

# Only the home page and the public pages are for search engines; every
# other address is an app screen (the same index.html), so it is `noindex`.
# The list is the site's and the SEO pages' first path segments.
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
        uri === '/' || uri === '/index.html' ||
        /^\/releases\/[^/]+\/index\.html$/.test(uri) ||
        /^\/(lawyers|attorneys|practice-areas|about|clients|for-attorneys|features|pricing|faq|contact|download|terms|privacy|delete-account|client-agreement|attorney-agreement|eula|refunds|third-party-services|cookies|sms-consent|dmca|accessibility)(\/|$)/.test(uri) ||
        uri === '/sitemap.xml' || uri === '/robots.txt';
      var isFile = /\.[a-z0-9]{2,5}$/i.test(uri) && !/\/(index|spa)\.html$/.test(uri);
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
  # Apply returns as soon as AWS accepted it (CloudFront then rolls out for
  # 5-15 min on its own): a short AWS login can not lapse mid-apply.
  wait_for_deployment = false
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  aliases             = local.has_host ? concat([var.web_host], var.extra_hosts) : []

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
    response_headers_policy_id = aws_cloudfront_response_headers_policy.web["app"].id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.seo_index.arn
    }
    function_association {
      event_type   = "viewer-response"
      function_arn = aws_cloudfront_function.app_noindex.arn
    }
  }

  # Owner 2026-10-22: the company site's pages keep inline scripts
  # (Next.js), so they get the "site" policy; everything else is the app's.
  dynamic "ordered_cache_behavior" {
    for_each = local.site_paths
    content {
      path_pattern               = "/${ordered_cache_behavior.value}*"
      target_origin_id           = "web"
      viewer_protocol_policy     = "redirect-to-https"
      allowed_methods            = ["GET", "HEAD", "OPTIONS"]
      cached_methods             = ["GET", "HEAD"]
      compress                   = true
      cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
      response_headers_policy_id = aws_cloudfront_response_headers_policy.web["site"].id

      function_association {
        event_type   = "viewer-request"
        function_arn = aws_cloudfront_function.seo_index.arn
      }
      function_association {
        event_type   = "viewer-response"
        function_arn = aws_cloudfront_function.app_noindex.arn
      }
    }
  }

  # S3 answers 403 for a missing key (no ListBucket for the OAC). App
  # screens never get here (the viewer-request function sends them to the
  # app's page), so a miss is a real miss: a deleted public page or a gone
  # file. Audit #14: the status stays 404 (no soft 404s); the body is the
  # app's page, whose router shows "not found". The deploy keeps a copy of
  # the live index.html at the root for this.
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }
  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
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

# What the deploy workflow needs: the bucket to upload to, the distribution
# to invalidate, and the release switch (audit #10: web-deploy.yml finds the
# store through the distribution's viewer-request function; rollback.yml
# switches it back).
data "aws_iam_policy_document" "deploy" {
  statement {
    actions   = ["s3:PutObject", "s3:DeleteObject", "s3:GetObject", "s3:ListBucket"]
    resources = [aws_s3_bucket.web.arn, "${aws_s3_bucket.web.arn}/*"]
  }
  statement {
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetDistributionConfig"]
    resources = [aws_cloudfront_distribution.web.arn]
  }
  statement {
    actions   = ["cloudfront:DescribeFunction"]
    resources = [aws_cloudfront_function.seo_index.arn]
  }
  statement {
    actions = [
      "cloudfront-keyvaluestore:DescribeKeyValueStore",
      "cloudfront-keyvaluestore:GetKey",
      "cloudfront-keyvaluestore:PutKey",
    ]
    resources = [aws_cloudfront_key_value_store.web.arn]
  }
}

resource "aws_iam_policy" "deploy" {
  name   = "${var.name}-web-deploy"
  policy = data.aws_iam_policy_document.deploy.json
  tags   = var.tags
}

# DNS records to add at the registrar (Namecheap → Advanced DNS) so ACM
# can issue the certificate. Available right after the targeted apply.
output "web_certificate_validation" {
  value = length(aws_acm_certificate.web) == 0 ? [] : [
    for o in aws_acm_certificate.web[0].domain_validation_options : {
      host  = o.resource_record_name
      type  = o.resource_record_type
      value = o.resource_record_value
    }
  ]
}

output "web_bucket" { value = aws_s3_bucket.web.bucket }
output "web_distribution_id" { value = aws_cloudfront_distribution.web.id }
output "web_cdn_domain" { value = aws_cloudfront_distribution.web.domain_name }
output "web_deploy_policy_arn" { value = aws_iam_policy.deploy.arn }
output "web_release_store_arn" { value = aws_cloudfront_key_value_store.web.arn }
