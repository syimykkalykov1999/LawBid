# Stage 2 SRE (Б4, SRE Workbook ch. 9): the status page reads a copy outside AWS (the
# public Cloudflare R2 bucket) when its own status.json does not answer. The address is
# written into the page by terraform and allowed in the page's CSP; nothing else is.
#   terraform -chdir=infra/modules/status-page init -backend=false
#   terraform -chdir=infra/modules/status-page test

mock_provider "aws" {
  override_during = plan
  mock_data "aws_region" {
    defaults = { region = "us-east-1", name = "us-east-1" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}", minified_json = "{}" }
  }
}

variables {
  name = "lawbid-test"
  tags = {}
}

run "no_backup_is_unchanged" {
  command = plan
  assert {
    condition     = strcontains(aws_cloudfront_response_headers_policy.status.security_headers_config[0].content_security_policy[0].content_security_policy, "connect-src 'self'; base-uri")
    error_message = "without a backup the page may only read its own host"
  }
  assert {
    condition     = strcontains(aws_s3_object.index.content, "<meta name=\"status-backup\" content=\"\">")
    error_message = "without a backup the address is empty (the page reads only its own file)"
  }
}

run "backup_url_is_in_the_page_and_allowed_by_csp" {
  command = plan
  variables {
    status_backup_url = "https://media.lawbid.dev/status/status.json"
  }
  assert {
    condition     = strcontains(aws_s3_object.index.content, "content=\"https://media.lawbid.dev/status/status.json\"")
    error_message = "the page carries the backup address"
  }
  assert {
    condition     = strcontains(aws_cloudfront_response_headers_policy.status.security_headers_config[0].content_security_policy[0].content_security_policy, "connect-src 'self' https://media.lawbid.dev; base-uri")
    error_message = "the CSP allows exactly the backup's origin"
  }
  assert {
    condition     = aws_s3_object.index.etag == md5(aws_s3_object.index.content)
    error_message = "a changed address re-uploads the page"
  }
}

run "not_https_is_refused" {
  command = plan
  variables {
    status_backup_url = "http://media.lawbid.dev/status/status.json"
  }
  expect_failures = [var.status_backup_url]
}
