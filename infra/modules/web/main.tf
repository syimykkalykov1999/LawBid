# The web version of the app (Flutter, `flutter build web --wasm`): a
# private S3 bucket behind CloudFront (origin access control). Every path
# that is not a file answers with index.html, so a link such as
# /lawyer/anna opens inside the app (the app routes it).
#
# Owner 2026-10-15. Not applied yet, like the rest of infra/.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.72" }
  }
}

variable "name" { type = string }
variable "force_destroy" {
  type        = bool
  default     = false
  description = "Let terraform destroy delete a bucket that still holds objects. Only for throw-away load-test stacks."
}
variable "tags" { type = map(string) }
variable "web_acl_arn" {
  type        = string
  default     = ""
  description = "CloudFront-scope WAF web ACL for the distribution (modules/cdn-waf); empty = none."
}

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
    "https://*.r2.cloudflarestorage.com", # R2: presigned PUT of public media
    "https://video.bunnycdn.com",         # video uploads (TUS)
    "https://*.b-cdn.net",                # video playback
    "https://fonts.gstatic.com",          # engine fallback fonts
    "https://api.stripe.com",             # card page (/pay.html)
    "https://*.stripe.com",
    "https://*.stripe.network",
    "https://maps.googleapis.com",
  ]
  description = "Hosts the app itself calls besides the API (storage, media, video, fonts, Stripe)."
}

# ASVS 5.0 V3.4.3 (STAGE2_SECURITY #3): the exact S3 bucket hosts the
# presigned uploads POST to and the signed links read from (both spellings
# the AWS SDK may produce), instead of `https://*.amazonaws.com`, which let a
# script injected into the page send data to ANY bucket. The media CDN host
# is in media_origins; `*.cloudfront.net` goes the same way.
variable "storage_connect_src" {
  type        = list(string)
  default     = []
  description = "Exact storage origins the web app calls (S3 bucket hosts, the documents CDN)."
}

# Until the exact list has run a week without reports, the old wide hosts
# stay in the ENFORCED policy and the exact one is sent as
# Content-Security-Policy-Report-Only (the usual CSP roll-out). true = the
# exact list is enforced and the wide hosts are gone.
variable "csp_exact_connect_enforced" {
  type        = bool
  default     = false
  description = "true: enforce the exact connect-src list (no *.amazonaws.com / *.cloudfront.net). false (first week): enforce the old list, report the exact one (Report-Only)."
}

variable "csp_wide_connect_src" {
  type        = list(string)
  default     = ["https://*.amazonaws.com", "https://*.cloudfront.net"]
  description = "The old wildcard storage hosts, kept in the enforced policy only while csp_exact_connect_enforced is false."
}

# ASVS 5.0 V3.4.7 (STAGE2_SECURITY #4): where browsers send CSP violation
# reports. Sentry's security endpoint (Project → Settings → Security Headers →
# «Report URI»): https://o<org>.ingest.sentry.io/api/<project>/security/?sentry_key=<public key>.
# Empty = no reporting (as before).
variable "csp_report_uri" {
  type        = string
  default     = ""
  description = "CSP report endpoint (Sentry security endpoint URL); empty = no report-uri / report-to."
  validation {
    condition     = var.csp_report_uri == "" || can(regex("^https://[a-z0-9.-]+/[^\\s;,\"']*$", var.csp_report_uri))
    error_message = "csp_report_uri must be an https URL without spaces, quotes, commas or semicolons."
  }
}

# Owner list B-c13 (I18N_GLYPHS 2026-11-02 §15): Flutter's web engine downloads
# the Noto fonts for scripts the app does not bundle (Chinese, Arabic, Hindi,
# Thai, ...) from fonts.gstatic.com, which is blocked in China and Iran, so
# those users saw squares. With this on, the distribution serves the same
# files from our own host under /s/* (the exact gstatic path, so the engine's
# `fontFallbackBaseUrl` is just "/s/"): CloudFront fetches each file once
# from fonts.gstatic.com (outside the block) and keeps it for a year (the
# files are versioned and immutable; Noto is SIL OFL 1.1, redistribution
# allowed). The web deploy switches the app to it only after the live host
# answers a font there (scripts/deploy/web-font-base.sh), so the order of
# terraform apply and deploy does not matter.
variable "font_fallback_proxy" {
  type        = bool
  default     = true
  description = "Serve the engine's fallback Noto fonts from this host under /s/* (proxied from fonts.gstatic.com and cached), for users who cannot reach gstatic."
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

# Owner 2026-10-25 (S17-1, web package). Instagram / WhatsApp Web call their
# own origin, so the browser never sends a CORS preflight. Ours calls
# api.<domain> from <domain>: the app's custom headers make every call
# "non-simple", and the preflight answer is cached per URL. With a value here
# the web distribution gets a `/api/*` behavior that forwards to the ALB
# (no cache, every header / cookie / query), so the web build can use
# API_BASE_URL=https://<web host>/api/v1 (repository secret WEB_API_BASE_URL)
# and every call is same-origin. Empty = off (nothing changes).
variable "api_proxy_host" {
  type        = string
  default     = ""
  description = "API host (e.g. api.<domain>) behind a same-origin /api/* behavior of the web distribution; empty = no such behavior (the web calls the API cross-origin, with preflights)."
}

variable "cross_origin_isolation" {
  type        = bool
  default     = false
  description = "Send COOP/COEP headers on the app pages (not on /pay.html, Stripe frames break under COEP) so the engine can render on a worker thread (faster, Chrome and Firefox). Keep it off: since row 173 (2026-11-14) the admin switch web.cross_origin_isolation does the same through the site's own service worker (apps/mobile/web/coi_sw.js) and can be turned off in seconds; with this variable on, the admin switch can no longer take the headers away. Results: docs/dev/COOP_COEP_TEST_2026-11-14.md."
}

# R2 row 171 (14.11): Origin Shield, one more cache layer in front of the
# bucket. Every CloudFront edge asks the shield, not S3, so a new release's
# engine and pages are read from S3 about once, the cache hit ratio goes
# up and a cold edge answers sooner. Empty = the bucket's own region (the
# AWS advice: the shield region closest to the origin); "off" = no shield.
variable "origin_shield_region" {
  type        = string
  default     = ""
  description = "Origin Shield region for the web bucket origin; empty = the bucket's region, \"off\" = no Origin Shield."
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
      condition     = data.aws_region.current.region == "us-east-1"
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
  bucket        = "${var.name}-web"
  force_destroy = var.force_destroy
  tags          = var.tags
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
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
  # Cleanup: web-deploy.yml deletes old releases/<sha>/ folders (the newest
  # 30 and everything younger than 3 days stay). A deleted file is not
  # restorable, so its old version goes after a day, not 14.
  rule {
    id     = "purged-releases"
    status = "Enabled"
    filter { prefix = "releases/" }
    noncurrent_version_expiration { noncurrent_days = 1 }
  }
  rule {
    id     = "orphan-delete-markers"
    status = "Enabled"
    filter {}
    expiration { expired_object_delete_marker = true }
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
  # Pack F (25.11, ROUND5 F2): `for-attorneys` is gone from the site (404);
  # its pages are /attorneys/ and /practice-areas/ now. Those two folders
  # also hold the SEO pages (/attorneys/<name>/, /practice-areas/<topic>/,
  # scripts/seo: no inline script), so only the site's own index page of
  # each gets the site policy, by exact path (`site_exact_paths`): a
  # behavior is picked by the address in the browser, so /attorneys/anna/
  # keeps the app's strict policy.
  site_paths = [
    "about", "clients", "features", "pricing", "faq", "contact",
    "download", "terms", "privacy", "delete-account", "client-agreement",
    "attorney-agreement", "eula", "refunds", "third-party-services", "cookies",
    "sms-consent", "dmca", "accessibility",
  ]
  site_exact_paths = ["/attorneys/", "/practice-areas/"]
  # Pack F (25.11, ROUND5 F1): firebase_core_web starts every Firebase JS
  # bundle with a small inline loader script (`window.ff_trigger_<service>`,
  # firebase_core_web/lib/src/firebase_core_web.dart injectSrcScript). The
  # app's policy has no 'unsafe-inline', so the browser refused it and
  # Firebase.initializeApp failed: no web push token, no App Check. The CSP
  # standard way for a known inline script is its sha256 in script-src
  # (CSP Level 3 "hash-source"); nothing else inline is allowed. Two forms
  # per service (the Trusted Types text in Chrome/Edge, the plain text in
  # Firefox/Safari), for core, app_check and messaging, at Firebase JS
  # 13.3.0 (firebase_core_web 4.2.0). They change with a FlutterFire bump:
  # scripts/ci/check-web-assets-lock.sh recomputes them from the pub cache
  # and fails Mobile CI until this list matches (then terraform apply).
  flutterfire_script_hashes = [
    "'sha256-k9B74s4HHrP7qsWLxbghlSaym+z4iZhIgo+kxF4g9d4='", # core, Trusted Types
    "'sha256-NxTQLoaIzltrNckVRJsmfpxE/TUIO8RMnsZx2d+BIwM='", # app_check, Trusted Types
    "'sha256-HxW0iiY91amVEZ+cwq4uVyxCGyvefKeEurad8XJWxcA='", # messaging, Trusted Types
    "'sha256-b9cYi649gu7hyz5JsxLwe4DAi5xoxETEPFyy+lQi2hU='", # core, plain
    "'sha256-T6OtB2ggo+mKjz+M4zqK8SLXl4zEISdkdjg2rQn+GTQ='", # app_check, plain
    "'sha256-OEazNVv8OiO22/de/9kyeqz26uGao9GhFfZyUD5g/5U='", # messaging, plain
  ]
  # App Check on the web is reCAPTCHA Enterprise (app_check.dart): Google's
  # documented CSP for reCAPTCHA (script + challenge frame) and the App Check
  # token exchange host.
  recaptcha_script_src = ["https://www.google.com/recaptcha/"]
  recaptcha_frame_src  = ["https://www.google.com/recaptcha/", "https://recaptcha.google.com/recaptcha/"]
  app_check_connect    = ["https://content-firebaseappcheck.googleapis.com"]
  csp_rest = [
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com https://www.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    # blob: is how the web app reads a picked file (image_picker returns a
    # blob: URL and cross_file loads it with XHR). Without it every photo pick
    # fails with «Не удалось открыть фото» (2026-11-04, KNOWN_ERRORS №58).
    "frame-src ${join(" ", concat(["'self'", local.turnstile_origin], var.stripe_frame_src, local.recaptcha_frame_src))}",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ]
  # The exact list (#3) and, while it is still being proven, the old wide one.
  connect_exact = concat(["'self'", "blob:", var.api_origin, "wss://${replace(var.api_origin, "https://", "")}", "https://*.ingest.sentry.io", "https://*.ingest.us.sentry.io"], var.extra_connect_src, local.app_check_connect, var.app_connect_src, var.storage_connect_src, var.media_origins)
  connect_wide  = concat(local.connect_exact, var.csp_wide_connect_src)
  # #4: report-uri (every browser) + report-to (the Reporting API name below).
  csp_report        = var.csp_report_uri == "" ? [] : ["report-uri ${var.csp_report_uri}", "report-to csp-endpoint"]
  csp_enforced_rest = concat(local.csp_rest, ["connect-src ${join(" ", var.csp_exact_connect_enforced ? local.connect_exact : local.connect_wide)}"], local.csp_report)
  csp_exact_rest    = concat(local.csp_rest, ["connect-src ${join(" ", local.connect_exact)}"], local.csp_report)
  # 2026-10-24 (batch D, item 4): Cloudflare Turnstile on the web sign-up
  # (script + challenge frame; its token goes to our own API only).
  turnstile_origin = "https://challenges.cloudflare.com"
  script_src       = concat(["'self'", "'wasm-unsafe-eval'", "https://www.gstatic.com", local.turnstile_origin], var.stripe_script_src, local.recaptcha_script_src)
  # The hashes go into the app's policy only: with a hash present a browser
  # ignores 'unsafe-inline' (CSP Level 2+), which the site's pages need.
  script_app  = "script-src ${join(" ", concat(local.script_src, local.flutterfire_script_hashes))}"
  script_site = "script-src ${join(" ", concat(local.script_src, ["'unsafe-inline'"]))}"
  csp = {
    app  = join("; ", concat(["default-src 'self'", local.script_app], local.csp_enforced_rest))
    site = join("; ", concat(["default-src 'self'", local.script_site], local.csp_enforced_rest))
  }
  # Report-Only twin with the exact connect-src (first week only).
  csp_report_only = var.csp_exact_connect_enforced ? {} : {
    app  = join("; ", concat(["default-src 'self'", local.script_app], local.csp_exact_rest))
    site = join("; ", concat(["default-src 'self'", local.script_site], local.csp_exact_rest))
    pay  = join("; ", concat(["default-src 'self'", local.script_app], local.csp_exact_rest))
  }
  # ASVS 5.0 V3.4.8 (#5): COOP on every document of the app and the site.
  # same-origin-allow-popups keeps the Google sign-in popup and Stripe 3-D
  # Secure working. The card page keeps none (like COEP, S17-5). With
  # cross_origin_isolation on, the app pages get same-origin + COEP instead.
  coop_value = {
    app  = var.cross_origin_isolation ? "same-origin" : "same-origin-allow-popups"
    site = "same-origin-allow-popups"
    pay  = ""
  }
  # S17-5: the card page (/pay.html + pay.js) embeds Stripe frames that do not
  # send COEP, so it keeps the app's CSP but never gets the isolation headers.
  csp_all = merge(local.csp, { pay = local.csp["app"] })
  # Files of the card page (top-level, no extension logic needed).
  pay_paths = ["/pay.html", "/pay.js"]
}

moved {
  from = aws_cloudfront_response_headers_policy.web
  to   = aws_cloudfront_response_headers_policy.web["app"]
}

resource "aws_cloudfront_response_headers_policy" "web" {
  for_each = local.csp_all
  name     = each.key == "app" ? "${var.name}-web-security" : "${var.name}-${each.key}-security"
  comment  = each.key == "app" ? "Security headers for the web app" : (each.key == "pay" ? "Security headers for the card page (no cross-origin isolation: Stripe frames)" : "Security headers for the company site pages")

  # Only the app pages are cross-origin isolated (S17-5): the company site
  # (Next.js, third-party embeds) and the card page are not.
  dynamic "custom_headers_config" {
    for_each = local.coop_value[each.key] != "" || var.csp_report_uri != "" || lookup(local.csp_report_only, each.key, "") != "" ? [1] : []
    content {
      dynamic "items" {
        for_each = local.coop_value[each.key] != "" ? [local.coop_value[each.key]] : []
        content {
          header   = "Cross-Origin-Opener-Policy"
          value    = items.value
          override = true
        }
      }
      dynamic "items" {
        for_each = var.cross_origin_isolation && each.key == "app" ? [1] : []
        content {
          header   = "Cross-Origin-Embedder-Policy"
          value    = "credentialless"
          override = true
        }
      }
      dynamic "items" {
        for_each = var.csp_report_uri != "" ? [var.csp_report_uri] : []
        content {
          header   = "Reporting-Endpoints"
          value    = "csp-endpoint=\"${items.value}\""
          override = true
        }
      }
      dynamic "items" {
        for_each = lookup(local.csp_report_only, each.key, "") != "" ? [local.csp_report_only[each.key]] : []
        content {
          header   = "Content-Security-Policy-Report-Only"
          value    = items.value
          override = true
        }
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

  # CloudFront takes at most 1783 characters for this header (quota
  # "Content-Security-Policy header value"); fail the plan, not the apply.
  lifecycle {
    precondition {
      condition     = length(each.value) <= 1783
      error_message = "The ${each.key} CSP is ${length(each.value)} characters; CloudFront allows 1783."
    }
    precondition {
      condition     = length(lookup(local.csp_report_only, each.key, "")) <= 1783
      error_message = "The ${each.key} Report-Only CSP is longer than CloudFront's 1783 characters."
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
# is read as <address>/index.html; without the trailing slash it answers
# 301 to <address>/ (R2 row 171: one address per page, as the canonical). Audit #14 (2026-10-22): when that file
# is missing S3 answers 403 and the visitor gets a REAL 404 (the app's
# page as the body, custom_error_response below) — a deleted /attorneys/x
# is no longer a "soft 404" for search engines. Every other address
# without an extension is an app screen and gets the app's page (200)
# straight away, without the error detour.
# www.<host> answers with a permanent redirect to <host> (one address for
# search engines).
resource "aws_cloudfront_function" "seo_index" {
  # 15.11 (KNOWN_ERRORS 159, 170): the infra-apply role may update our own
  # CloudFront Functions again (managed policy lawbid-prod-infra-apply-extra,
  # #1110/#1129), so the code is applied as written: the row 171 301 from
  # /clients to /clients/ reaches the edge. Never hide `code` from the apply
  # (scripts/seo/test/sitemap-canonical.test.mjs checks it).
  name                         = "${var.name}-seo-index"
  runtime                      = "cloudfront-js-2.0"
  comment                      = "www to bare host; public pages 301 to slash, end in index.html (real 404); app screens and files from the live release"
  publish                      = true
  key_value_store_associations = [aws_cloudfront_key_value_store.web.arn]
  code                         = <<-EOT
    import cf from 'cloudfront';
    var kvs = cf.kvs('${element(split("/", aws_cloudfront_key_value_store.web.arn), 1)}'); // the store ID (ARN tail); .id is the NAME and fails with KVSNamespaceNotFound
    var PUBLIC = /^\/(lawyers|attorneys|practice-areas|legal-questions|about|clients|for-attorneys|features|pricing|faq|contact|download|terms|privacy|delete-account|client-agreement|attorney-agreement|eula|refunds|third-party-services|cookies|sms-consent|dmca|accessibility)(\/|$)/;
    // Pack F (ROUND5 F3): the site's link-preview images (Next.js metadata
    // files, no extension) are files at the root, not app screens.
    var ROOT_FILES = ['/sitemap.xml', '/robots.txt', '/public-paths.txt', '/opengraph-image', '/twitter-image'];
    // Owner 2026-10-23 (web speed pass): the app and the engine have a
    // brotli twin (<file>.br, uploaded by scripts/deploy/web-gzip-big.sh)
    // about 27% smaller than the gzip the bucket object carries.
    var BR = /^\/v\/[^\/]+\/(main\.dart\.(js|wasm)|canvaskit\/([a-z_]+\/)?[a-z_]+\.(js|wasm))$/;
    // 2026-10-26 (smoothness P6a): the release's fonts and main.dart.mjs
    // have twins too, but only releases marked `br2_<sha>` carry them
    // (older releases' tabs must not be sent to a .br that does not exist).
    var BR2 = /^\/v\/[^\/]+\/(main\.dart\.mjs|assets\/[A-Za-z0-9_\/.-]+\.(ttf|otf))$/;
    var SHA = /^[0-9A-Za-z]{7,64}$/;
    async function get(key) {
      try { return await kvs.get(key); } catch (e) { return ''; }
    }
    function query(request) {
      var qs = [];
      for (var k in request.querystring) {
        var q = request.querystring[k];
        qs.push(q.value === '' ? k : k + '=' + q.value);
      }
      return qs.length ? '?' + qs.join('&') : '';
    }
    function moved(location) {
      return {
        statusCode: 301,
        statusDescription: 'Moved Permanently',
        headers: { location: { value: location } }
      };
    }
    async function handler(event) {
      var request = event.request;
      var host = request.headers.host ? request.headers.host.value : '';
      if (host.indexOf('www.') === 0) {
        return moved('https://' + host.substring(4) + request.uri + query(request));
      }
      var uri = request.uri;
      // /.well-known/ holds extension-less files (app links): served as is.
      if (uri.indexOf('/.well-known/') === 0 || ROOT_FILES.indexOf(uri) !== -1) return request;
      var hasExt = uri.indexOf('.', uri.lastIndexOf('/')) !== -1;
      if (uri !== '/' && PUBLIC.test(uri)) {
        if (!hasExt) {
          // R2 row 171 (14.11): one address per page. The canonical of every
          // public page ends in "/" (TRAILING_SLASH=1 export, SEO pages), so
          // /clients answers 301 to /clients/ (the AWS CloudFront Functions
          // redirect sample) instead of a second 200 copy of the page.
          if (uri.charAt(uri.length - 1) !== '/') return moved(uri + '/' + query(request));
          request.uri = uri + 'index.html';
        }
        return request;
      }
      // S17-9: /v/<sha>/... names its own release, so the live-release and
      // app-path lookups are not needed (2 of the 3 store reads per file;
      // ~30 files per cold page load). Only the brotli marker is read.
      if (uri.indexOf('/v/') === 0) {
        var vp = uri.split('/');
        if (SHA.test(vp[2] || '')) {
          request.uri = '/releases/' + vp[2] + uri;
          var vae = request.headers['accept-encoding'];
          if (vae && vae.value.indexOf('br') !== -1) {
            if (BR.test(uri) && (await get('br_' + vp[2])) === '1') {
              request.uri += '.br';
            } else if (BR2.test(uri) && (await get('br2_' + vp[2])) === '1') {
              request.uri += '.br';
            }
          }
          return request;
        }
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
        // /v/<sha>/...: the files of THAT release (the build puts the app,
        // the engine and the assets there, immutable). A tab left open
        // across a deploy still finds its own lazy parts, not the new
        // release's.
        var parts = uri.split('/');
        var rel = (first === 'v' && SHA.test(parts[2] || '')) ? parts[2] : release;
        request.uri = (first === 'v' ? '/releases/' + rel : base) + uri;
        var ae = request.headers['accept-encoding'];
        if (ae && ae.value.indexOf('br') !== -1) {
          if (BR.test(uri) && (await get('br_' + rel)) === '1') {
            request.uri += '.br';
          } else if (BR2.test(uri) && (await get('br2_' + rel)) === '1') {
            request.uri += '.br';
          }
        }
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
        /^\/(lawyers|attorneys|practice-areas|legal-questions|about|clients|for-attorneys|features|pricing|faq|contact|download|terms|privacy|delete-account|client-agreement|attorney-agreement|eula|refunds|third-party-services|cookies|sms-consent|dmca|accessibility)(\/|$)/.test(uri) ||
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
  # Security research #5 (2026-10-22), A3: rate limit + IP reputation.
  web_acl_id = var.web_acl_arn == "" ? null : var.web_acl_arn

  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = "web"
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id

    dynamic "origin_shield" {
      for_each = var.origin_shield_region == "off" ? [] : [var.origin_shield_region == "" ? aws_s3_bucket.web.bucket_region : var.origin_shield_region]
      content {
        enabled              = true
        origin_shield_region = origin_shield.value
      }
    }
  }

  # B-c13: the engine's fallback fonts from our host (see `font_fallback_proxy`).
  dynamic "origin" {
    for_each = var.font_fallback_proxy ? ["fonts.gstatic.com"] : []
    content {
      domain_name = origin.value
      origin_id   = "fonts"
      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  # S17-1: the API behind the same host (see `api_proxy_host`).
  dynamic "origin" {
    for_each = var.api_proxy_host == "" ? [] : [var.api_proxy_host]
    content {
      domain_name = origin.value
      origin_id   = "api"
      custom_origin_config {
        http_port                = 80
        https_port               = 443
        origin_protocol_policy   = "https-only"
        origin_ssl_protocols     = ["TLSv1.2"]
        origin_read_timeout      = 60 # CloudFront's default max; slow reports / uploads keep working
        origin_keepalive_timeout = 60
      }
    }
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

  # S17-1: /api/* goes to the ALB: never cached, every method, all viewer
  # headers (except Host: the origin's own host name routes on the ALB),
  # cookies (the refresh cookie lives on /api/v1/auth) and query strings.
  # No viewer functions (they are for files) and no response headers policy
  # (the API sets its own). CloudFront-Managed policies: CachingDisabled and
  # AllViewerExceptHostHeader.
  dynamic "ordered_cache_behavior" {
    for_each = var.api_proxy_host == "" ? [] : [1]
    content {
      path_pattern             = "/api/*"
      target_origin_id         = "api"
      viewer_protocol_policy   = "https-only"
      allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods           = ["GET", "HEAD"]
      compress                 = false
      cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
      origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
    }
  }

  # B-c13: /s/* is the gstatic path itself (the origin gets the same path).
  # CachingOptimized keeps each font for the year gstatic asks for and sends
  # no viewer headers or cookies to Google. No viewer functions: these are
  # plain files, never an app screen. Same-origin for the page, so the
  # engine's fetch needs no CORS and only connect-src 'self'.
  dynamic "ordered_cache_behavior" {
    for_each = var.font_fallback_proxy ? [1] : []
    content {
      path_pattern           = "/s/*"
      target_origin_id       = "fonts"
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["GET", "HEAD", "OPTIONS"]
      cached_methods         = ["GET", "HEAD"]
      compress               = true
      cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    }
  }

  # S17-5: the card page without the isolation headers.
  dynamic "ordered_cache_behavior" {
    for_each = local.pay_paths
    content {
      path_pattern               = ordered_cache_behavior.value
      target_origin_id           = "web"
      viewer_protocol_policy     = "redirect-to-https"
      allowed_methods            = ["GET", "HEAD", "OPTIONS"]
      cached_methods             = ["GET", "HEAD"]
      compress                   = true
      cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
      response_headers_policy_id = aws_cloudfront_response_headers_policy.web["pay"].id

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

  # Owner 2026-10-22: the company site's pages keep inline scripts
  # (Next.js), so they get the "site" policy; everything else is the app's.
  # Pack F: plus the exact index pages of /attorneys/ and /practice-areas/.
  dynamic "ordered_cache_behavior" {
    for_each = concat([for p in local.site_paths : "/${p}*"], local.site_exact_paths)
    content {
      path_pattern               = ordered_cache_behavior.value
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

  # CloudFront's default quota is 25 cache behaviors per distribution.
  lifecycle {
    precondition {
      condition     = (var.api_proxy_host == "" ? 0 : 1) + (var.font_fallback_proxy ? 1 : 0) + length(local.pay_paths) + length(local.site_paths) + length(local.site_exact_paths) <= 25
      error_message = "More than 25 cache behaviors (CloudFront's default quota per distribution)."
    }
  }
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
      "cloudfront-keyvaluestore:DeleteKey", # web-prune-releases.sh drops br_<sha> of removed releases
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

output "csp" {
  value       = local.csp_all
  description = "The enforced Content-Security-Policy per page kind (app, site, pay)."
}
output "csp_report_only" {
  value       = local.csp_report_only
  description = "The Report-Only policy per page kind while the exact connect-src is proven; empty once enforced."
}
output "coop" {
  value       = local.coop_value
  description = "Cross-Origin-Opener-Policy per page kind (empty = none)."
}
