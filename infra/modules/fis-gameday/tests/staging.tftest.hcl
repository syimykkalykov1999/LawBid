# Item 20 (X3, 25.11): FIS GameDay templates. The load-test stack keeps its
# three templates; staging adds API latency and the AZ power interruption
# from the FIS scenario library; prod is refused. Mock provider: no AWS.
#   terraform -chdir=infra/modules/fis-gameday init -backend=false
#   terraform -chdir=infra/modules/fis-gameday test

mock_provider "aws" {
  override_during = plan
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}", minified_json = "{}" }
  }
  mock_data "aws_region" {
    defaults = { region = "us-east-1", name = "us-east-1" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111111111111" }
  }
  mock_data "aws_subnets" {
    defaults = { ids = ["subnet-pub-a", "subnet-priv-a"] }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:111111111111:log-group:/aws/fis/x" }
  }
}

# Stop conditions are a set: the two own alarms need distinct ARNs.
override_resource {
  target          = aws_cloudwatch_metric_alarm.api_down
  override_during = plan
  values          = { arn = "arn:aws:cloudwatch:us-east-1:111111111111:alarm:own-api-down" }
}
override_resource {
  target          = aws_cloudwatch_metric_alarm.errors_storm
  override_during = plan
  values          = { arn = "arn:aws:cloudwatch:us-east-1:111111111111:alarm:own-5xx-storm" }
}

variables {
  name                        = "lawbid-staging"
  cluster_name                = "lawbid-staging"
  api_service_name            = "lawbid-staging-api"
  db_instance_id              = "lawbid-staging-postgres"
  redis_replication_group_id  = "lawbid-staging-redis"
  alb_arn_suffix              = "app/lb/1"
  api_target_group_arn_suffix = "targetgroup/api/1"
}

run "loadtest_is_unchanged" {
  command = plan
  variables {
    name = "lawbid-loadtest-r1"
  }
  assert {
    condition     = length(aws_fis_experiment_template.rds_failover) == 1 && length(aws_fis_experiment_template.api_latency) == 0 && length(aws_fis_experiment_template.az_power) == 0
    error_message = "load test: the same three templates, nothing new"
  }
  assert {
    condition     = length(aws_fis_experiment_template.api_stop_tasks.stop_condition) == 2
    error_message = "load test keeps its two own stop conditions"
  }
}

run "staging_has_all_drills_with_existing_alarm_as_stop" {
  command = plan
  variables {
    extra_stop_alarm_arns = ["arn:aws:cloudwatch:us-east-1:111111111111:alarm:lawbid-staging-api-5xx-ratio"]
    rds_failover_enabled  = true
    api_latency_enabled   = true
    az_impairment_enabled = true
    vpc_id                = "vpc-1"
    impaired_az           = "us-east-1a"
  }
  assert {
    condition     = length(aws_fis_experiment_template.api_latency) == 1 && length(aws_fis_experiment_template.az_power) == 1
    error_message = "staging: API latency and AZ power templates exist"
  }
  assert {
    condition     = alltrue([for t in concat([aws_fis_experiment_template.api_stop_tasks, aws_fis_experiment_template.redis_failover], aws_fis_experiment_template.rds_failover, aws_fis_experiment_template.api_latency, aws_fis_experiment_template.az_power) : length(t.stop_condition) == 3])
    error_message = "every template stops on the two own alarms + the existing 5xx alarm"
  }
  assert {
    condition     = contains([for s in aws_fis_experiment_template.az_power[0].stop_condition : s.value], "arn:aws:cloudwatch:us-east-1:111111111111:alarm:lawbid-staging-api-5xx-ratio")
    error_message = "the existing api-5xx-ratio alarm is a stop condition"
  }
  assert {
    condition     = toset([for a in aws_fis_experiment_template.az_power[0].action : a.action_id]) == toset(["aws:network:disrupt-connectivity", "aws:elasticache:replicationgroup-interrupt-az-power", "aws:rds:reboot-db-instances"])
    error_message = "AZ template: the scenario-library actions that apply to our stack"
  }
  assert {
    condition     = one([for t in aws_fis_experiment_template.az_power[0].target : t.resource_arns if t.name == "Subnet"]) == toset(["arn:aws:ec2:us-east-1:111111111111:subnet/subnet-pub-a", "arn:aws:ec2:us-east-1:111111111111:subnet/subnet-priv-a"])
    error_message = "AZ template cuts exactly the subnets of the impaired zone"
  }
  assert {
    condition     = one(aws_fis_experiment_template.az_power[0].experiment_options).empty_target_resolution_mode == "skip"
    error_message = "scenario option: actions without targets are skipped"
  }
  assert {
    condition     = contains([for p in one(aws_fis_experiment_template.api_latency[0].action).parameter : "${p.key}=${p.value}"], "useEcsFaultInjectionEndpoints=true")
    error_message = "Fargate network faults need useEcsFaultInjectionEndpoints=true"
  }
}

run "single_az_database_has_no_failover" {
  command = plan
  variables {
    rds_failover_enabled  = false
    az_impairment_enabled = true
    vpc_id                = "vpc-1"
    impaired_az           = "us-east-1a"
  }
  assert {
    condition     = length(aws_fis_experiment_template.rds_failover) == 0 && length(aws_fis_experiment_template.az_power[0].action) == 2
    error_message = "no forceFailover against a single-AZ database"
  }
}

run "az_needs_vpc_and_zone" {
  command = plan
  variables {
    az_impairment_enabled = true
  }
  expect_failures = [aws_fis_experiment_template.az_power]
}

run "prod_is_refused" {
  command = plan
  variables {
    name = "lawbid-prod"
  }
  expect_failures = [var.name]
}

run "too_many_stop_conditions_refused" {
  command = plan
  variables {
    extra_stop_alarm_arns = ["a", "b", "c", "d"]
  }
  expect_failures = [var.extra_stop_alarm_arns]
}
