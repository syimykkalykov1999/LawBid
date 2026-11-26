# G1 (docs/dev/STAGE2_ARCH_PERF_2026-11-25.md): the API edge distribution.
# terraform test with a mock provider: no AWS, no state.
#   terraform -chdir=infra/modules/api-edge init -backend=false
#   terraform -chdir=infra/modules/api-edge test

mock_provider "aws" {
  override_during = plan
  mock_resource "aws_cloudfront_distribution" {
    defaults = {
      id             = "E1TEST"
      domain_name    = "d1test.cloudfront.net"
      hosted_zone_id = "Z2FDTNDATAQYW2"
    }
  }
}

variables {
  name                = "lawbid-test"
  api_host            = "api.example.test"
  alb_dns_name        = "lawbid-test-alb-1.us-east-1.elb.amazonaws.com"
  certificate_arn     = "arn:aws:acm:us-east-1:111111111111:certificate/c"
  origin_verify_value = "test-origin-verify-value-0123456789abcdef"
  web_acl_arn         = "arn:aws:wafv2:us-east-1:111111111111:global/webacl/lawbid-test-api-edge-waf/1"
  alerts_topic_arn    = "arn:aws:sns:us-east-1:111111111111:alerts"
}

run "http3_on_the_api_host" {
  command = plan
  assert {
    condition     = aws_cloudfront_distribution.api.http_version == "http2and3" && aws_cloudfront_distribution.api.is_ipv6_enabled
    error_message = "HTTP/3 (QUIC) and IPv6 at the edge, like the web distribution"
  }
  assert {
    condition     = aws_cloudfront_distribution.api.aliases == toset(["api.example.test"])
    error_message = "the distribution answers for api.<domain>"
  }
  assert {
    condition     = aws_cloudfront_distribution.api.web_acl_id == var.web_acl_arn
    error_message = "the CLOUDFRONT copy of the API WAF rules is attached"
  }
}

run "nothing_signed_in_is_ever_cached" {
  command = plan
  assert {
    condition     = aws_cloudfront_distribution.api.default_cache_behavior[0].cache_policy_id == "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    error_message = "Managed-CachingDisabled: no answer is kept at the edge"
  }
  assert {
    condition     = length(aws_cloudfront_distribution.api.ordered_cache_behavior) == 0
    error_message = "one behavior for the whole API (no cached path sneaks in)"
  }
}

run "viewer_request_reaches_the_alb_whole" {
  command = plan
  assert {
    # Host (the ALB routes on api.<domain>), Authorization, cookies (AWSALB for
    # Socket.IO polling), every query string.
    condition     = aws_cloudfront_distribution.api.default_cache_behavior[0].origin_request_policy_id == "216adef6-5c7f-47e4-b989-5492eafa07d3"
    error_message = "Managed-AllViewer, with the viewer's Host"
  }
  assert {
    condition     = toset(aws_cloudfront_distribution.api.default_cache_behavior[0].allowed_methods) == toset(["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"])
    error_message = "every API method passes"
  }
  assert {
    condition     = one([for o in aws_cloudfront_distribution.api.origin : o.domain_name]) == var.alb_dns_name
    error_message = "the origin is the ALB"
  }
  assert {
    condition     = one(flatten([for o in aws_cloudfront_distribution.api.origin : [for h in o.custom_header : h.name]])) == "X-Origin-Verify"
    error_message = "CloudFront sends the origin secret"
  }
  assert {
    condition     = one(flatten([for o in aws_cloudfront_distribution.api.origin : [for c in o.custom_origin_config : c.origin_protocol_policy]])) == "https-only"
    error_message = "edge to ALB over HTTPS only"
  }
}

run "alarms_on_errors_and_latency" {
  command = plan
  assert {
    condition     = aws_cloudwatch_metric_alarm.edge_5xx.metric_name == "5xxErrorRate" && aws_cloudwatch_metric_alarm.edge_5xx.dimensions["Region"] == "Global"
    error_message = "5xx alarm on the edge"
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.edge_origin_latency.metric_name == "OriginLatency" && contains(aws_cloudwatch_metric_alarm.edge_origin_latency.alarm_actions, var.alerts_topic_arn)
    error_message = "origin latency alarm to the alerts topic"
  }
}

run "certificate_must_be_us_east_1" {
  command = plan
  variables {
    certificate_arn = "arn:aws:acm:eu-west-1:111111111111:certificate/c"
  }
  expect_failures = [var.certificate_arn]
}

run "short_secret_is_refused" {
  command = plan
  variables {
    origin_verify_value = "short"
  }
  expect_failures = [var.origin_verify_value]
}
