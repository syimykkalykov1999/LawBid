# G3 + G2 (docs/dev/STAGE2_ARCH_PERF_2026-11-25.md): post-quantum TLS policy on
# the HTTPS listener and REST without stickiness once the websocket group is on.
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
  mock_resource "aws_lb_listener" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:111111111111:listener/app/lb/1/l" }
  }
}

variables {
  name              = "lawbid-test"
  vpc_id            = "vpc-1"
  public_subnet_ids = ["subnet-a", "subnet-b"]
  certificate_arn   = "arn:aws:acm:us-east-1:111111111111:certificate/c"
  api_host          = "api.example.test"
  admin_host        = "admin.example.test"
  waf_enabled       = false
}

run "https_listener_uses_the_post_quantum_policy" {
  command = plan
  assert {
    # AWS "Security policies for your Application Load Balancer" (25.11.2026):
    # hybrid ML-KEM on TLS 1.3, TLS 1.2 still accepted.
    condition     = aws_lb_listener.https.ssl_policy == "ELBSecurityPolicy-TLS13-1-2-Res-PQ-2025-09"
    error_message = "the HTTPS listener must use ELBSecurityPolicy-TLS13-1-2-Res-PQ-2025-09"
  }
}

run "websocket_group_on_rest_is_not_sticky_and_least_outstanding" {
  command = plan
  variables {
    ws_target_group_enabled  = true
    load_balancing_algorithm = "least_outstanding_requests"
  }
  assert {
    condition     = aws_lb_target_group.api.load_balancing_algorithm_type == "least_outstanding_requests"
    error_message = "REST balances by outstanding requests"
  }
  assert {
    condition     = aws_lb_target_group.api.stickiness[0].enabled == false
    error_message = "REST has no AWSALB stickiness"
  }
  assert {
    condition     = aws_lb_target_group.api.slow_start == 0
    error_message = "AWS: slow start is not combinable with least_outstanding_requests"
  }
  assert {
    condition     = length(aws_lb_target_group.api_ws) == 1 && aws_lb_target_group.api_ws[0].stickiness[0].enabled == true
    error_message = "only the /socket.io group stays sticky"
  }
  assert {
    condition     = aws_lb_listener_rule.api_ws[0].priority == 9 && contains(flatten([for c in aws_lb_listener_rule.api_ws[0].condition : [for p in c.path_pattern : p.values]]), "/socket.io/*")
    error_message = "the /socket.io rule answers before the API rule 10"
  }
}
