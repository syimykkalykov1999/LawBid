# G1 (docs/dev/STAGE2_ARCH_PERF_2026-11-25.md): the ALB half of the API edge.
# terraform test with a mock provider: no AWS, no state.
#   terraform -chdir=infra/modules/alb init -backend=false
#   terraform -chdir=infra/modules/alb test

mock_provider "aws" {
  override_during = plan
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}", minified_json = "{}" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = {
      arn        = "arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/x/1"
      arn_suffix = "targetgroup/x/1"
    }
  }
  mock_resource "aws_wafv2_web_acl" {
    defaults = { arn = "arn:aws:wafv2:us-east-1:111111111111:global/webacl/x/1" }
  }
  mock_resource "aws_wafv2_ip_set" {
    defaults = { arn = "arn:aws:wafv2:us-east-1:111111111111:regional/ipset/x/1" }
  }
}

variables {
  name                = "lawbid-test"
  vpc_id              = "vpc-1"
  public_subnet_ids   = ["subnet-a", "subnet-b"]
  certificate_arn     = "arn:aws:acm:us-east-1:111111111111:certificate/c"
  api_host            = "api.example.test"
  admin_host          = "admin.example.test"
  admin_allowed_cidrs = ["203.0.113.0/24"]
}

run "off_is_todays_acl" {
  command = plan
  assert {
    condition     = keys(aws_wafv2_web_acl.this) == ["regional"] && aws_wafv2_web_acl.this["regional"].scope == "REGIONAL"
    error_message = "off: only the ALB's own ACL"
  }
  assert {
    condition     = [for r in aws_wafv2_web_acl.this["regional"].rule : r.priority if r.name == "admin-allow-list"] == [0]
    error_message = "off: the admin allow-list keeps priority 0"
  }
  assert {
    condition     = length([for r in aws_wafv2_web_acl.this["regional"].rule : r if r.name == "edge-verified"]) == 0
    error_message = "off: no edge rule"
  }
  assert {
    condition     = length(aws_lb_listener_rule.api_edge_only) == 0 && length(aws_lb_listener_rule.api[0].condition) == 1
    error_message = "off: the API rule answers every request for api_host"
  }
  assert {
    condition     = output.edge_waf_acl_arn == ""
    error_message = "off: no edge ACL"
  }
}

run "edge_on_copies_the_rules_to_cloudfront" {
  command = plan
  variables {
    edge_enabled             = true
    edge_waf_enabled         = true
    edge_origin_verify_value = "test-origin-verify-value-0123456789abcdef"
  }
  assert {
    condition     = aws_wafv2_web_acl.this["edge"].scope == "CLOUDFRONT" && aws_wafv2_web_acl.this["edge"].name == "lawbid-test-api-edge-waf"
    error_message = "the edge copy is a CLOUDFRONT ACL"
  }
  assert {
    # Same rules as the ALB's ACL minus the admin allow-list and the edge rule.
    condition = toset([for r in aws_wafv2_web_acl.this["edge"].rule : r.name]) == setsubtract(
      toset([for r in aws_wafv2_web_acl.this["regional"].rule : r.name]),
      toset(["admin-allow-list", "edge-verified"])
    )
    error_message = "the edge has the ALB's rules"
  }
  assert {
    condition     = contains([for r in aws_wafv2_web_acl.this["edge"].rule : r.name], "rate-per-ip") && contains([for r in aws_wafv2_web_acl.this["edge"].rule : r.name], "otp-rate-per-ip")
    error_message = "the per-IP rate rules run at the edge, where the address is the viewer's"
  }
  assert {
    condition     = [for r in aws_wafv2_web_acl.this["regional"].rule : r.priority if r.name == "edge-verified"] == [0]
    error_message = "edge-verified requests skip the ALB's per-IP rules (they would count CloudFront's address)"
  }
  assert {
    condition     = [for r in aws_wafv2_web_acl.this["regional"].rule : r.priority if r.name == "admin-allow-list"] == [15]
    error_message = "the admin allow-list still blocks, after the edge rule"
  }
  assert {
    condition     = length(aws_lb_listener_rule.api_edge_only) == 0
    error_message = "without the lock, direct requests still work (DNS not switched yet)"
  }
}

run "origin_lock_needs_the_secret_on_every_api_rule" {
  command = plan
  variables {
    edge_enabled             = true
    edge_waf_enabled         = true
    edge_origin_lock         = true
    ws_target_group_enabled  = true
    edge_origin_verify_value = "test-origin-verify-value-0123456789abcdef"
  }
  assert {
    condition     = length([for c in aws_lb_listener_rule.api[0].condition : c if length(c.http_header) > 0]) == 1
    error_message = "rule 10 needs x-origin-verify"
  }
  assert {
    condition     = length([for c in aws_lb_listener_rule.api_ws[0].condition : c if length(c.http_header) > 0]) == 1
    error_message = "the /socket.io rule needs x-origin-verify"
  }
  assert {
    condition     = length([for c in aws_lb_listener_rule.api_admin[0].condition : c if length(c.http_header) > 0]) == 1
    error_message = "the admin API rule needs x-origin-verify"
  }
  assert {
    condition     = aws_lb_listener_rule.api_edge_only[0].priority == 90 && aws_lb_listener_rule.api_edge_only[0].action[0].fixed_response[0].status_code == "403"
    error_message = "a request around the edge gets 403"
  }
}

run "lock_without_edge_is_refused" {
  command = plan
  variables {
    edge_origin_lock = true
  }
  expect_failures = [aws_lb_listener.https]
}

run "origin_lock_also_on_the_native_canary_rules" {
  command = plan
  variables {
    edge_enabled             = true
    edge_waf_enabled         = true
    edge_origin_lock         = true
    ws_target_group_enabled  = true
    api_native_deploy_stage  = "prepare"
    edge_origin_verify_value = "test-origin-verify-value-0123456789abcdef"
  }
  assert {
    condition     = length([for c in aws_lb_listener_rule.api_ws_weighted[0].condition : c if length(c.http_header) > 0]) == 1
    error_message = "the /socket.io canary rule (priority 7) needs x-origin-verify, or sockets go around the edge"
  }
}
