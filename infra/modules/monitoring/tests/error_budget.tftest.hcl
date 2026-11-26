# Б1 (25.11): 28-day error budget per SLO + the alarms the release gate
# (scripts/deploy/budget-gate.sh) reads. Mock providers, no AWS:
#   terraform -chdir=infra/modules/monitoring init -backend=false
#   terraform -chdir=infra/modules/monitoring test

mock_provider "aws" {
  override_during = plan
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111111111111" }
  }
  mock_data "aws_region" {
    defaults = { region = "us-east-1", name = "us-east-1" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}", minified_json = "{}" }
  }
}
mock_provider "archive" {}

variables {
  name                        = "lawbid-test"
  alert_emails                = []
  alb_arn_suffix              = "app/lb/1"
  api_target_group_arn_suffix = "targetgroup/api/1"
  cluster_name                = "lawbid-test"
  api_service_name            = "api"
  worker_service_name         = "worker"
  redis_replication_group_id  = "lawbid-test"
  api_log_group               = "/ecs/lawbid-test/api"
  worker_log_group            = "/ecs/lawbid-test/worker"
  kms_key_arn                 = "arn:aws:kms:us-east-1:111111111111:key/k"
}

run "every_slo_has_a_budget_alarm" {
  command = plan
  assert {
    condition = toset([for a in aws_cloudwatch_metric_alarm.budget_exhausted : a.alarm_name]) == toset([
      for f in ["otp", "call", "push", "login", "message", "feed", "pay", "availability"] : "lawbid-test-slo-${f}-budget-exhausted"
    ])
    error_message = "one <env>-slo-<flow>-budget-exhausted alarm per SLO (7 business + availability)"
  }
  assert {
    condition     = alltrue([for a in aws_cloudwatch_metric_alarm.budget_exhausted : a.metric_name == "SloBudgetRemaining" && a.threshold == 0 && a.comparison_operator == "LessThanOrEqualToThreshold" && a.dimensions.Slo != ""])
    error_message = "alarm = remaining budget <= 0"
  }
  assert {
    condition     = alltrue([for a in aws_cloudwatch_metric_alarm.budget_exhausted : length(a.alarm_actions) == 1])
    error_message = "mail only: the alerts topic, never the critical (phone) topic"
  }
  assert {
    condition     = jsondecode(aws_lambda_function.error_budget[0].environment[0].variables.SLOS).availability.target == 0.999 && length(jsondecode(aws_lambda_function.error_budget[0].environment[0].variables.SLOS).availability.bad) == 1
    error_message = "the function reads the availability SLO from the one api target group"
  }
  assert {
    condition     = aws_lambda_function.error_budget[0].environment[0].variables.WINDOW_DAYS == "28" && aws_scheduler_schedule.error_budget[0].schedule_expression == "rate(1 hour)"
    error_message = "28-day window, measured every hour"
  }
  assert {
    condition     = length(output.error_budget_alarm_names) == 8
    error_message = "the gate's alarm list is an output"
  }
}

run "two_api_groups_count_both_in_the_budget" {
  command = plan
  variables {
    api_two_target_groups             = true
    api_green_target_group_arn_suffix = "targetgroup/api-green/2"
  }
  assert {
    condition     = toset([for m in jsondecode(aws_lambda_function.error_budget[0].environment[0].variables.SLOS).availability.total : m.dims.TargetGroup]) == toset(["targetgroup/api/1", "targetgroup/api-green/2"])
    error_message = "during an ECS canary both api groups count"
  }
}

run "off_means_nothing" {
  command = plan
  variables {
    error_budget_enabled = false
  }
  assert {
    condition     = length(aws_cloudwatch_metric_alarm.budget_exhausted) == 0 && length(aws_lambda_function.error_budget) == 0
    error_message = "error_budget_enabled = false: no function, no alarms"
  }
}
