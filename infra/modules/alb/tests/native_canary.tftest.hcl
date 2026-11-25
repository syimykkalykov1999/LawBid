# X1 (25.11): the ALB half of the ECS built-in canary / linear deployment.
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

run "off_is_todays_routing" {
  command = plan
  assert {
    condition     = length(aws_lb_listener_rule.api) == 1 && aws_lb_listener_rule.api[0].priority == 10
    error_message = "off: rule 10 stays"
  }
  assert {
    condition     = length(aws_lb_target_group.api_green) == 0 && length(aws_lb_listener_rule.api_weighted) == 0
    error_message = "off: nothing new"
  }
  assert {
    condition     = output.api_green_target_group_arn == "" && output.api_production_listener_rule_arn == ""
    error_message = "off: empty outputs"
  }
}

run "prepare_adds_green_behind_rule_10" {
  command = plan
  variables {
    api_native_deploy_stage = "prepare"
  }
  assert {
    condition     = length(aws_lb_listener_rule.api) == 1 && aws_lb_listener_rule.api[0].priority == 10
    error_message = "prepare: rule 10 still answers"
  }
  assert {
    condition     = aws_lb_target_group.api_green[0].name == "lawbid-test-api-green" && aws_lb_listener_rule.api_weighted[0].priority == 11
    error_message = "prepare: green group + weighted rule 11"
  }
  assert {
    condition     = [for t in aws_lb_listener_rule.api_weighted[0].action[0].forward[0].target_group : t.weight] == [100, 0] || [for t in aws_lb_listener_rule.api_weighted[0].action[0].forward[0].target_group : t.weight] == [0, 100]
    error_message = "the weighted rule starts with one group at 100 and the other at 0 (AWS: exactly one group serving)"
  }
}

run "on_removes_rule_10" {
  command = plan
  variables {
    api_native_deploy_stage = "on"
  }
  assert {
    condition     = length(aws_lb_listener_rule.api) == 0 && length(aws_lb_listener_rule.api_weighted) == 1
    error_message = "on: the weighted rule is the production rule"
  }
  assert {
    condition     = output.api_production_listener_rule_arn != ""
    error_message = "on: the rule ARN goes to the ECS service"
  }
}

run "bad_stage_is_refused" {
  command = plan
  variables {
    api_native_deploy_stage = "canary"
  }
  expect_failures = [var.api_native_deploy_stage]
}
