# X1 (25.11): the ECS built-in canary / linear deployment of the api.
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
  # The three api alarms (5xx ratio, p95, unhealthy hosts), short test names.
  api_deployment_alarm_names = ["alarm-5xx", "alarm-p95", "alarm-unhealthy"]
}

run "default_is_todays_rolling_service" {
  command = plan
  assert {
    condition     = length(aws_iam_role.ecs_lb_infra) == 0
    error_message = "no ECS infrastructure role while the built-in canary is off"
  }
  assert {
    condition     = alltrue([for lb in aws_ecs_service.api.load_balancer : length(lb.advanced_configuration) == 0])
    error_message = "off: the api load balancer has no advanced_configuration (today's service, no change)"
  }
  assert {
    condition     = aws_ecs_service.api.deployment_circuit_breaker[0].rollback && aws_ecs_service.api.alarms[0].rollback
    error_message = "the circuit breaker and the alarm rollback stay on"
  }
}

run "canary_uses_the_ecs_strategy_with_alarms_and_circuit_breaker" {
  command = plan
  variables {
    api_deployment_strategy          = "CANARY"
    api_alternate_target_group_arn   = "arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/api-green/2"
    api_production_listener_rule_arn = "arn:aws:elasticloadbalancing:us-east-1:111111111111:listener-rule/app/lb/1/l/2/r/3"
  }
  assert {
    condition     = aws_ecs_service.api.deployment_configuration[0].strategy == "CANARY"
    error_message = "strategy CANARY"
  }
  assert {
    condition     = aws_ecs_service.api.deployment_configuration[0].canary_configuration[0].canary_percent == 10 && tonumber(aws_ecs_service.api.deployment_configuration[0].canary_configuration[0].canary_bake_time_in_minutes) == 5
    error_message = "10 % for 5 minutes by default (the old script's bake time)"
  }
  assert {
    condition     = tonumber(aws_ecs_service.api.deployment_configuration[0].bake_time_in_minutes) == 10
    error_message = "the old release stays 10 minutes after 100 %"
  }
  assert {
    condition     = one([for lb in aws_ecs_service.api.load_balancer : lb.advanced_configuration[0].alternate_target_group_arn if length(lb.advanced_configuration) > 0]) == var.api_alternate_target_group_arn
    error_message = "the api load balancer names the green target group"
  }
  assert {
    condition     = aws_iam_role.ecs_lb_infra[0].name == "lawbid-test-ecs-lb-infra" && aws_iam_role_policy_attachment.ecs_lb_infra[0].policy_arn == "arn:aws:iam::aws:policy/AmazonECSInfrastructureRolePolicyForLoadBalancers"
    error_message = "the ECS infrastructure role for load balancers with the AWS managed policy"
  }
  assert {
    condition     = aws_ecs_service.api.deployment_circuit_breaker[0].rollback && aws_ecs_service.api.alarms[0].rollback && length(aws_ecs_service.api.alarms[0].alarm_names) == 3
    error_message = "the circuit breaker and the same api alarms still roll back"
  }
}

run "linear_steps" {
  command = plan
  variables {
    api_deployment_strategy          = "LINEAR"
    api_alternate_target_group_arn   = "arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/api-green/2"
    api_production_listener_rule_arn = "arn:aws:elasticloadbalancing:us-east-1:111111111111:listener-rule/app/lb/1/l/2/r/3"
  }
  assert {
    condition     = aws_ecs_service.api.deployment_configuration[0].strategy == "LINEAR" && aws_ecs_service.api.deployment_configuration[0].linear_configuration[0].step_percent == 25
    error_message = "LINEAR, 25 % per step"
  }
}

run "rolling_is_sent_on_the_way_back" {
  command = plan
  variables {
    api_deployment_strategy = "ROLLING"
  }
  assert {
    condition     = aws_ecs_service.api.deployment_configuration[0].strategy == "ROLLING" && length(aws_iam_role.ecs_lb_infra) == 0
    error_message = "prepare stage: ROLLING sent explicitly, no infrastructure role"
  }
}

run "canary_without_the_green_group_is_refused" {
  command = plan
  variables {
    api_deployment_strategy = "CANARY"
  }
  expect_failures = [aws_ecs_service.api]
}

run "canary_with_the_socket_group_shifts_both_groups" {
  command = plan
  variables {
    api_deployment_strategy             = "CANARY"
    api_alternate_target_group_arn      = "arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/api-green/2"
    api_production_listener_rule_arn    = "arn:aws:elasticloadbalancing:us-east-1:111111111111:listener-rule/app/lb/1/l/2/r/3"
    api_ws_target_group_arn             = "arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/api-ws/4"
    api_ws_alternate_target_group_arn   = "arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/api-ws-green/5"
    api_ws_production_listener_rule_arn = "arn:aws:elasticloadbalancing:us-east-1:111111111111:listener-rule/app/lb/1/l/2/r/6"
  }
  assert {
    condition     = length(aws_ecs_service.api.load_balancer) == 2 && alltrue([for lb in aws_ecs_service.api.load_balancer : length(lb.advanced_configuration) == 1])
    error_message = "every load balancer of a CANARY service has advanced_configuration (AWS requirement)"
  }
  assert {
    condition     = contains([for lb in aws_ecs_service.api.load_balancer : lb.advanced_configuration[0].alternate_target_group_arn], var.api_ws_alternate_target_group_arn)
    error_message = "the socket group shifts to its own green group"
  }
}

run "canary_with_the_socket_group_but_no_socket_pair_is_refused" {
  command = plan
  variables {
    api_deployment_strategy          = "CANARY"
    api_alternate_target_group_arn   = "arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/api-green/2"
    api_production_listener_rule_arn = "arn:aws:elasticloadbalancing:us-east-1:111111111111:listener-rule/app/lb/1/l/2/r/3"
    api_ws_target_group_arn          = "arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/api-ws/4"
  }
  expect_failures = [aws_ecs_service.api]
}
