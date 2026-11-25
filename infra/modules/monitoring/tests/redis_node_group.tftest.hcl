# Item 29: after the old Valkey node group is removed (the app runs on
# ElastiCache Serverless) its node alarms go with it; by default nothing
# changes. terraform test with mock providers: no AWS, no state.
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
  redis_replication_group_id  = "lawbid-test-redis"
  redis_replicas              = 1
  redis_node_type             = "cache.t4g.micro"
  api_log_group               = "/ecs/lawbid-test/api"
  worker_log_group            = "/ecs/lawbid-test/worker"
  kms_key_arn                 = "arn:aws:kms:us-east-1:111111111111:key/k"
}

run "node_group_alarms_stay_by_default" {
  command = plan
  assert {
    condition     = length(aws_cloudwatch_metric_alarm.redis_cpu) == 1 && length(aws_cloudwatch_metric_alarm.redis_memory) == 1 && length(aws_cloudwatch_metric_alarm.redis_connections) == 1
    error_message = "default: the node-group alarms exist as before"
  }
  assert {
    condition     = length(aws_cloudwatch_metric_alarm.redis_cpu_credits) == 1 && length(aws_cloudwatch_metric_alarm.redis_replication_lag) == 1
    error_message = "default: burstable credits and replica lag alarms as before"
  }
}

run "node_group_removed_takes_its_alarms" {
  command = plan
  variables {
    redis_node_group = false
  }
  assert {
    condition = (
      length(aws_cloudwatch_metric_alarm.redis_cpu) + length(aws_cloudwatch_metric_alarm.redis_memory) +
      length(aws_cloudwatch_metric_alarm.redis_network_allowance) + length(aws_cloudwatch_metric_alarm.redis_traffic_management) +
      length(aws_cloudwatch_metric_alarm.redis_connections) + length(aws_cloudwatch_metric_alarm.redis_new_connections) +
      length(aws_cloudwatch_metric_alarm.redis_cpu_credits) + length(aws_cloudwatch_metric_alarm.redis_replication_lag)
    ) == 0
    error_message = "no alarm watches a node group that no longer exists"
  }
}
