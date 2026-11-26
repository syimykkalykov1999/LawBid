# Owner 26.11 («автоматизируй их не мучая меня»): the «Авто» rows
# aws.alb_balancing (ws_target_group_enabled + least_outstanding_requests) and
# aws.api_canary_prepare (api_native_deploy_stage = prepare) are applied
# without the owner only because their switch-on ADDS: no serving rule or
# group goes (apps/api/src/modules/admin-launch/infra/infra-auto-growth.logic.ts
# GROWTH_AUTO_SCOPE + NEVER_AUTO_DESTROY). These runs pin that, in the order
# «Авто» goes (EDGE_LADDER): balancing first, then the preparation. The
# canary step (`on`) removes rule 10 and 9 and stays the owner's 2FA.
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
  mock_resource "aws_lb_listener_rule" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:111111111111:listener-rule/app/lb/1/l/2/r/3" }
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

run "balancing_on_only_adds_the_socket_pair" {
  command = plan
  variables {
    ws_target_group_enabled  = true
    load_balancing_algorithm = "least_outstanding_requests"
  }
  assert {
    condition     = length(aws_lb_listener_rule.api) == 1 && aws_lb_listener_rule.api[0].priority == 10
    error_message = "Rule 10 (the api rule) stays: the switch-on removes no serving rule."
  }
  assert {
    condition     = aws_lb_target_group.api.name == "lawbid-test-api" && aws_lb_target_group.api.load_balancing_algorithm_type == "least_outstanding_requests"
    error_message = "The api group stays (same name = updated in place), now least outstanding."
  }
  assert {
    condition     = length(aws_lb_target_group.api_ws) == 1 && length(aws_lb_listener_rule.api_ws) == 1 && aws_lb_listener_rule.api_ws[0].priority == 9
    error_message = "The socket group and its rule 9 are added."
  }
  assert {
    condition     = length(aws_lb_target_group.api_green) == 0 && length(aws_lb_listener_rule.api_weighted) == 0
    error_message = "Nothing of the canary before its own row."
  }
}

run "canary_prepare_after_balancing_keeps_rules_10_and_9" {
  command = plan
  variables {
    ws_target_group_enabled  = true
    load_balancing_algorithm = "least_outstanding_requests"
    api_native_deploy_stage  = "prepare"
  }
  assert {
    condition     = length(aws_lb_listener_rule.api) == 1 && length(aws_lb_listener_rule.api_ws) == 1
    error_message = "prepare keeps rule 10 and rule 9: no request meets a missing rule."
  }
  assert {
    condition     = length(aws_lb_target_group.api_green) == 1 && length(aws_lb_listener_rule.api_weighted) == 1 && length(aws_lb_target_group.api_ws_green) == 1 && length(aws_lb_listener_rule.api_ws_weighted) == 1
    error_message = "prepare adds the two green groups and their weighted rules."
  }
  assert {
    condition     = aws_lb_target_group.api.name == "lawbid-test-api" && length(aws_lb_target_group.api_ws) == 1
    error_message = "The live groups stay."
  }
}

run "canary_step_removes_rules_so_it_is_the_owners" {
  command = plan
  variables {
    ws_target_group_enabled  = true
    load_balancing_algorithm = "least_outstanding_requests"
    api_native_deploy_stage  = "on"
  }
  assert {
    condition     = length(aws_lb_listener_rule.api) == 0 && length(aws_lb_listener_rule.api_ws) == 0
    error_message = "The canary step deletes rules 10 and 9 (why aws.api_canary is not automatic)."
  }
}
