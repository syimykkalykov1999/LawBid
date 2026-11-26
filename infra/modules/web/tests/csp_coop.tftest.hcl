# STAGE2_SECURITY #3, #4, #5 (25.11): exact connect-src, CSP reporting, COOP.
#   terraform -chdir=infra/modules/web init -backend=false
#   terraform -chdir=infra/modules/web test

mock_provider "aws" {}

variables {
  name       = "t"
  tags       = {}
  api_origin = "https://api.example.dev"
  storage_connect_src = [
    "https://t-media.s3.us-east-1.amazonaws.com",
    "https://t-media.s3.amazonaws.com",
  ]
  media_origins = ["https://d111.cloudfront.net"]
}

run "first_week_wide_enforced_exact_reported" {
  command = plan
  assert {
    condition     = strcontains(output.csp["app"], "https://*.amazonaws.com") && strcontains(output.csp["app"], "https://*.cloudfront.net")
    error_message = "While the exact list is proven, the enforced policy keeps the old wide hosts (nothing breaks)."
  }
  assert {
    condition     = !strcontains(output.csp_report_only["app"], "*.amazonaws.com") && !strcontains(output.csp_report_only["app"], "*.cloudfront.net")
    error_message = "The Report-Only policy has no wildcard storage host."
  }
  assert {
    condition     = strcontains(output.csp_report_only["app"], "https://t-media.s3.us-east-1.amazonaws.com") && strcontains(output.csp_report_only["app"], "https://d111.cloudfront.net")
    error_message = "The exact bucket and the media CDN host are named."
  }
  assert {
    condition     = !strcontains(output.csp["app"], "report-uri")
    error_message = "No report URI configured = no report directives."
  }
}

run "exact_enforced_with_reports" {
  command = plan
  variables {
    csp_exact_connect_enforced = true
    csp_report_uri             = "https://o1.ingest.us.sentry.io/api/2/security/?sentry_key=testpublickey"
  }
  assert {
    condition     = !strcontains(output.csp["app"], "*.amazonaws.com") && !strcontains(output.csp["site"], "*.cloudfront.net") && !strcontains(output.csp["pay"], "*.amazonaws.com")
    error_message = "Enforced: no wildcard storage host on any page kind."
  }
  assert {
    condition     = length(output.csp_report_only) == 0
    error_message = "No Report-Only twin once the exact list is enforced."
  }
  assert {
    condition     = strcontains(output.csp["app"], "report-uri https://o1.ingest.us.sentry.io/api/2/security/?sentry_key=testpublickey") && strcontains(output.csp["app"], "report-to csp-endpoint")
    error_message = "CSP reports go to the Sentry security endpoint (report-uri + report-to)."
  }
  assert {
    condition     = length([for i in aws_cloudfront_response_headers_policy.web["app"].custom_headers_config[0].items : i if i.header == "Reporting-Endpoints"]) == 1
    error_message = "The Reporting-Endpoints header names csp-endpoint."
  }
}

run "coop_on_documents" {
  command = plan
  assert {
    condition     = output.coop["app"] == "same-origin-allow-popups" && output.coop["site"] == "same-origin-allow-popups" && output.coop["pay"] == ""
    error_message = "COOP same-origin-allow-popups on the app and site (Google sign-in popup keeps working); none on the card page."
  }
  assert {
    condition     = length([for i in aws_cloudfront_response_headers_policy.web["app"].custom_headers_config[0].items : i if i.header == "Cross-Origin-Opener-Policy" && i.value == "same-origin-allow-popups"]) == 1
    error_message = "The app's response headers policy sends COOP."
  }
  assert {
    condition     = length([for i in aws_cloudfront_response_headers_policy.web["app"].custom_headers_config[0].items : i if i.header == "Cross-Origin-Embedder-Policy"]) == 0
    error_message = "No COEP unless cross_origin_isolation is on."
  }
}

run "isolation_switch_still_works" {
  command = plan
  variables {
    cross_origin_isolation = true
  }
  assert {
    condition     = output.coop["app"] == "same-origin" && length([for i in aws_cloudfront_response_headers_policy.web["app"].custom_headers_config[0].items : i if i.header == "Cross-Origin-Embedder-Policy" && i.value == "credentialless"]) == 1
    error_message = "cross_origin_isolation keeps COOP same-origin + COEP credentialless on the app pages."
  }
}

run "bad_report_uri_refused" {
  command = plan
  variables {
    csp_report_uri = "https://x.example/a; script-src *"
  }
  expect_failures = [var.csp_report_uri]
}

# H3 (THIRD_PASS_B 26.11): Permissions-Policy on every page kind, only what
# the web app uses (camera/microphone for calls and voice, geolocation for
# «send my location», fullscreen for video), everything else off.
run "permissions_policy_only_what_is_used" {
  command = plan
  assert {
    condition     = alltrue([for k in ["app", "site", "pay"] : length([for i in aws_cloudfront_response_headers_policy.web[k].custom_headers_config[0].items : i if i.header == "Permissions-Policy" && i.value == output.permissions_policy[k] && i.override]) == 1])
    error_message = "Every page kind sends its Permissions-Policy (override on)."
  }
  assert {
    condition     = alltrue([for f in ["camera=(self)", "microphone=(self)", "geolocation=(self)", "fullscreen=(self)", "payment=()", "usb=()", "display-capture=()", "browsing-topics=()"] : strcontains(output.permissions_policy["app"], f)])
    error_message = "App pages: camera, microphone, location and fullscreen for itself only; payment and the rest off."
  }
  assert {
    condition     = alltrue([for f in ["camera=()", "microphone=()", "geolocation=()"] : strcontains(output.permissions_policy["site"], f) && strcontains(output.permissions_policy["pay"], f)])
    error_message = "The company site and the card page get no camera, microphone or location."
  }
  assert {
    condition     = strcontains(output.permissions_policy["pay"], "payment=(self \"https://js.stripe.com\")") && !strcontains(output.permissions_policy["app"], "js.stripe.com")
    error_message = "Only the card page lets the Stripe frame use the Payment Request API."
  }
  assert {
    condition     = !strcontains(output.permissions_policy["app"], "*")
    error_message = "No wildcard allowlist anywhere."
  }
}
