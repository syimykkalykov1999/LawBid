# X1 (25.11): with the ECS built-in canary the live api traffic alternates
# between two target groups; the api alarms must read both. Off = one group,
# exactly as before. terraform test with mock providers: no AWS, no state.
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

run "one_group_is_unchanged" {
  command = plan
  assert {
    condition     = aws_cloudwatch_metric_alarm.api_p95.metric_name == "TargetResponseTime" && aws_cloudwatch_metric_alarm.api_p95.dimensions.TargetGroup == "targetgroup/api/1" && length(aws_cloudwatch_metric_alarm.api_p95.metric_query) == 0
    error_message = "off: p95 alarm stays a plain metric alarm on the api group"
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.unhealthy_hosts.metric_name == "UnHealthyHostCount" && length(aws_cloudwatch_metric_alarm.unhealthy_hosts.metric_query) == 0
    error_message = "off: unhealthy alarm unchanged"
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.service_running_tasks["api"].metric_name == "HealthyHostCount" && aws_cloudwatch_metric_alarm.service_running_tasks["worker"].metric_name == "HeapUsedMb"
    error_message = "off: no-running-tasks alarms unchanged"
  }
  assert {
    condition     = join(",", sort([for q in aws_cloudwatch_metric_alarm.alb_5xx_ratio.metric_query : q.id])) == "err,ratio,req"
    error_message = "off: 5xx ratio = err, req, ratio as before"
  }
}

run "two_groups_are_read_together" {
  command = plan
  variables {
    api_two_target_groups             = true
    api_green_target_group_arn_suffix = "targetgroup/api-green/2"
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.api_p95.metric_name == null && contains([for q in aws_cloudwatch_metric_alarm.api_p95.metric_query : q.expression], "MAX([FILL(pb, 0), FILL(pg, 0)])")
    error_message = "on: p95 = the slower group"
  }
  assert {
    condition     = toset(flatten([for q in aws_cloudwatch_metric_alarm.alb_5xx_ratio.metric_query : [for m in q.metric : m.dimensions.TargetGroup]])) == toset(["targetgroup/api/1", "targetgroup/api-green/2"])
    error_message = "on: 5xx ratio reads both groups"
  }
  assert {
    condition     = contains([for q in aws_cloudwatch_metric_alarm.service_running_tasks["api"].metric_query : q.expression], "FILL(hb, 0) + FILL(hg, 0)") && aws_cloudwatch_metric_alarm.service_running_tasks["worker"].metric_name == "HeapUsedMb"
    error_message = "on: api healthy tasks = sum of both groups; worker unchanged"
  }
  assert {
    condition     = contains([for q in aws_cloudwatch_metric_alarm.unhealthy_hosts.metric_query : q.expression], "MAX([FILL(ub, 0), FILL(ug, 0)])")
    error_message = "on: unhealthy = the worse group"
  }
}

# Б2 (25.11): canary vs control (SRE Workbook ch. 16) — the two groups side by
# side, and ECS rolls back on them.
run "canary_is_compared_with_the_control" {
  command = plan
  variables {
    api_two_target_groups             = true
    api_green_target_group_arn_suffix = "targetgroup/api-green/2"
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.api_canary_vs_control[0].alarm_name == "lawbid-test-api-canary-vs-control" && aws_cloudwatch_metric_alarm.api_canary_vs_control_p95[0].alarm_name == "lawbid-test-api-canary-vs-control-p95"
    error_message = "on: one 5xx and one p95 canary-vs-control alarm"
  }
  assert {
    condition     = contains([for q in aws_cloudwatch_metric_alarm.api_canary_vs_control[0].metric_query : q.expression], "both * MAX([sg - 2 * sb, sb - 2 * sg])") && aws_cloudwatch_metric_alarm.api_canary_vs_control[0].threshold == 0.005
    error_message = "on: canary 5xx share > 2 x control + 0.5 pp, either group can be the canary"
  }
  assert {
    condition     = contains([for q in aws_cloudwatch_metric_alarm.api_canary_vs_control[0].metric_query : q.expression], "IF(FILL(rb, 0) >= 50 AND FILL(rg, 0) >= 50, 1, 0)")
    error_message = "on: compared only while both groups carry traffic"
  }
  assert {
    condition     = toset(flatten([for q in aws_cloudwatch_metric_alarm.api_canary_vs_control_p95[0].metric_query : [for m in q.metric : m.dimensions.TargetGroup]])) == toset(["targetgroup/api/1", "targetgroup/api-green/2"])
    error_message = "on: p95 pair reads both groups"
  }
  assert {
    condition     = contains(output.api_deployment_alarm_names, "lawbid-test-api-canary-vs-control") && contains(output.api_deployment_alarm_names, "lawbid-test-api-canary-vs-control-p95")
    error_message = "on: ECS watches the canary-vs-control alarms during the deployment"
  }
}

run "business_fast_burns_join_the_ecs_judgement" {
  command = plan
  variables {
    deploy_rollback_on_slo = true
  }
  assert {
    condition     = alltrue([for f in ["login", "message", "pay", "otp", "call", "push"] : contains(output.api_deployment_alarm_names, "lawbid-test-slo-${f}-fast")])
    error_message = "login / message / pay fast burns are in the ECS deployment alarms"
  }
  assert {
    condition     = length(aws_cloudwatch_metric_alarm.api_canary_vs_control) == 0 && !contains(output.api_deployment_alarm_names, "lawbid-test-api-canary-vs-control")
    error_message = "one group: no canary-vs-control alarm"
  }
}
