# 25.11 (owner decision «Авто», items 19 + 27): the api request scaling and the
# predictive policy read BOTH api target groups once the built-in canary has
# a green group, and stay ALBRequestCountPerTarget otherwise.
# terraform test with a mock provider: no AWS, no state.
#   terraform -chdir=infra/modules/ecs init -backend=false
#   terraform -chdir=infra/modules/ecs test

mock_provider "aws" {
  override_during = plan
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}", minified_json = "{}" }
  }
  mock_data "aws_region" {
    defaults = { region = "us-east-1", name = "us-east-1" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111111111111:role/lawbid-test-ecs-lb-infra" }
  }
}

variables {
  name                             = "lawbid-test"
  private_subnet_ids               = ["subnet-a", "subnet-b"]
  tasks_security_group_id          = "sg-1"
  api_target_group_arn             = "arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/api/1"
  admin_target_group_arn           = "arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/admin/1"
  api_image                        = "1.dkr.ecr.us-east-1.amazonaws.com/lawbid-api:abc"
  admin_image                      = "1.dkr.ecr.us-east-1.amazonaws.com/lawbid-admin:abc"
  kms_key_arn                      = "arn:aws:kms:us-east-1:111111111111:key/k"
  migrator_database_url_secret_arn = "arn:aws:secretsmanager:us-east-1:111111111111:secret:m"
  api_env                          = { FOO = "bar" }
  secret_arns                      = { JWT = "arn:aws:secretsmanager:us-east-1:111111111111:secret:j" }
  alb_resource_label               = "app/lb/1/targetgroup/api/1"
}

run "one_group_keeps_alb_request_count_per_target" {
  command = plan
  assert {
    condition     = aws_appautoscaling_policy.api_requests.target_tracking_scaling_policy_configuration[0].predefined_metric_specification[0].predefined_metric_type == "ALBRequestCountPerTarget"
    error_message = "off: today's ALBRequestCountPerTarget policy"
  }
  assert {
    condition     = aws_appautoscaling_policy.api_requests.target_tracking_scaling_policy_configuration[0].predefined_metric_specification[0].resource_label == "app/lb/1/targetgroup/api/1"
    error_message = "off: the same resource label as before"
  }
  assert {
    condition     = length(aws_appautoscaling_policy.api_requests.target_tracking_scaling_policy_configuration[0].customized_metric_specification) == 0
    error_message = "off: no metric math"
  }
}

run "two_groups_sum_requests_and_healthy_targets" {
  command = plan
  variables {
    api_two_target_groups             = true
    api_green_target_group_arn_suffix = "targetgroup/api-green/2"
  }
  assert {
    condition     = length(aws_appautoscaling_policy.api_requests.target_tracking_scaling_policy_configuration[0].predefined_metric_specification) == 0
    error_message = "two groups: no single-group predefined metric"
  }
  assert {
    condition = one([
      for m in aws_appautoscaling_policy.api_requests.target_tracking_scaling_policy_configuration[0].customized_metric_specification[0].metrics :
      m.expression if m.return_data
    ]) == "(FILL(rb, 0) + FILL(rg, 0)) / (FILL(hb, 0) + FILL(hg, 0))"
    error_message = "requests of blue + green per healthy target of blue + green"
  }
  assert {
    condition = toset(flatten([
      for m in aws_appautoscaling_policy.api_requests.target_tracking_scaling_policy_configuration[0].customized_metric_specification[0].metrics : [
        for s in m.metric_stat : [for d in s.metric[0].dimensions : d.value if d.name == "TargetGroup"]
      ]
    ])) == toset(["targetgroup/api/1", "targetgroup/api-green/2"])
    error_message = "both target groups are read"
  }
  assert {
    condition = alltrue(flatten([
      for m in aws_appautoscaling_policy.api_requests.target_tracking_scaling_policy_configuration[0].customized_metric_specification[0].metrics : [
        for s in m.metric_stat : [for d in s.metric[0].dimensions : d.value == "app/lb/1" if d.name == "LoadBalancer"]
      ]
    ]))
    error_message = "the LoadBalancer dimension is the first half of alb_resource_label"
  }
}

run "predictive_starts_forecast_only_and_honours_the_ceiling" {
  command = plan
  assert {
    condition     = aws_appautoscaling_policy.api_predictive[0].policy_type == "PredictiveScaling"
    error_message = "a predictive policy"
  }
  assert {
    condition     = aws_appautoscaling_policy.api_predictive[0].predictive_scaling_policy_configuration[0].mode == "ForecastOnly"
    error_message = "created in forecast only (AWS: evaluate before it scales)"
  }
  assert {
    condition     = aws_appautoscaling_policy.api_predictive[0].predictive_scaling_policy_configuration[0].max_capacity_breach_behavior == "HonorMaxCapacity"
    error_message = "the owner's ceiling is never passed"
  }
  assert {
    condition     = tonumber(aws_appautoscaling_policy.api_predictive[0].predictive_scaling_policy_configuration[0].metric_specification[0].target_value) == 3000
    error_message = "same target as the request policy (api_requests_per_task)"
  }
  assert {
    condition = one([
      for q in aws_appautoscaling_policy.api_predictive[0].predictive_scaling_policy_configuration[0].metric_specification[0].customized_load_metric_specification[0].metric_data_query :
      q.expression if q.return_data
    ]) == "FILL(rb, 0)"
    error_message = "one group: the load is the requests of that group"
  }
  assert {
    condition     = output.predictive_policies.api.name == "lawbid-test-api-predictive"
    error_message = "the API learns the policy name"
  }
  # Target tracking stays (AWS: predictive never scales in).
  assert {
    condition     = aws_appautoscaling_policy.cpu["api"].policy_type == "TargetTrackingScaling" && aws_appautoscaling_policy.api_requests.policy_type == "TargetTrackingScaling"
    error_message = "the reactive policies stay"
  }
}

run "predictive_reads_both_groups_with_canary" {
  command = plan
  variables {
    api_two_target_groups             = true
    api_green_target_group_arn_suffix = "targetgroup/api-green/2"
  }
  assert {
    condition = one([
      for q in aws_appautoscaling_policy.api_predictive[0].predictive_scaling_policy_configuration[0].metric_specification[0].customized_load_metric_specification[0].metric_data_query :
      q.expression if q.return_data
    ]) == "FILL(rb, 0) + FILL(rg, 0)"
    error_message = "two groups: load = blue + green requests"
  }
  assert {
    condition = one([
      for q in aws_appautoscaling_policy.api_predictive[0].predictive_scaling_policy_configuration[0].metric_specification[0].customized_scaling_metric_specification[0].metric_data_query :
      q.expression if q.return_data
    ]) == "(FILL(rb, 0) + FILL(rg, 0)) / (FILL(hb, 0) + FILL(hg, 0))"
    error_message = "two groups: the scaling metric is the request policy's metric"
  }
}

run "predictive_off_creates_nothing" {
  command = plan
  variables {
    predictive_scaling_enabled = false
  }
  assert {
    condition     = length(aws_appautoscaling_policy.api_predictive) == 0 && length(output.predictive_policies) == 0
    error_message = "false = no policy, no entry for the API"
  }
}
