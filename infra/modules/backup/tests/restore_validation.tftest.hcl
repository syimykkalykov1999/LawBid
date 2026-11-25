# Item 20 (D7, 25.11): the monthly AWS Backup restore test gets a validation
# query (EventBridge COMPLETED -> Lambda -> migrate task -> PutRestoreValidationResult).
# Mock providers: no AWS.
#   terraform -chdir=infra/modules/backup init -backend=false
#   terraform -chdir=infra/modules/backup test

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
  mock_resource "aws_backup_restore_testing_plan" {
    defaults = { arn = "arn:aws:backup:us-east-1:111111111111:restore-testing-plan:lawbid_staging_db_monthly-1" }
  }
}
mock_provider "aws" {
  alias           = "replica"
  override_during = plan
}
mock_provider "archive" {
  override_during = plan
}

variables {
  name                = "lawbid-staging"
  resource_arns       = ["arn:aws:rds:us-east-1:111111111111:db:lawbid-staging-postgres"]
  kms_key_arn         = "arn:aws:kms:us-east-1:111111111111:key/a"
  replica_kms_key_arn = "arn:aws:kms:us-west-2:111111111111:key/b"
  alerts_topic_arn    = "arn:aws:sns:us-east-1:111111111111:alerts"
  critical_topic_arn  = "arn:aws:sns:us-east-1:111111111111:critical"

  restore_validation_cluster_name       = "lawbid-staging"
  restore_validation_task_family        = "lawbid-staging-migrate"
  restore_validation_task_role_arns     = ["arn:aws:iam::111111111111:role/lawbid-staging-ecs-execution", "arn:aws:iam::111111111111:role/lawbid-staging-ecs-task-minimal"]
  restore_validation_subnet_ids         = ["subnet-a", "subnet-b"]
  restore_validation_security_group_ids = ["sg-tasks"]
  restore_validation_min_users          = 0
}

run "restore_test_with_validation_query" {
  command = plan
  variables {
    restore_test_enabled = true
  }
  assert {
    condition     = length(aws_backup_restore_testing_plan.db) == 1 && length(aws_lambda_function.restore_validate) == 1
    error_message = "monthly restore test + its validation function"
  }
  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.restore_test_completed[0].event_pattern).detail.status == ["COMPLETED"] && jsondecode(aws_cloudwatch_event_rule.restore_test_completed[0].event_pattern)["detail-type"] == ["Restore Job State Change"]
    error_message = "AWS's pattern: the COMPLETED restore job of our plan starts the validation"
  }
  assert {
    condition     = aws_lambda_function.restore_validate[0].environment[0].variables.TASK_FAMILY == "lawbid-staging-migrate" && aws_lambda_function.restore_validate[0].environment[0].variables.MIN_USERS == "0"
    error_message = "the check runs the migrate task family (latest image) with the configured minimum"
  }
  assert {
    condition     = aws_lambda_function_event_invoke_config.restore_validate[0].maximum_retry_attempts == 0
    error_message = "one attempt: a validation status cannot be changed once set"
  }
  assert {
    condition     = aws_lambda_function.restore_validate[0].timeout == 900
    error_message = "the function waits for the task (up to 12 min)"
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.restore_validation_failed[0].alarm_actions == toset(["arn:aws:sns:us-east-1:111111111111:critical"])
    error_message = "a failed validation rings the critical topic"
  }
  assert {
    condition     = aws_backup_restore_testing_selection.db[0].validation_window_hours == 1
    error_message = "AWS Backup deletes the copy after the window (cleanup)"
  }
}

run "no_restore_test_no_validation" {
  command = plan
  variables {
    restore_test_enabled = false
  }
  assert {
    condition     = length(aws_lambda_function.restore_validate) == 0 && length(aws_cloudwatch_event_rule.restore_test_completed) == 0
    error_message = "nothing without the restore test"
  }
}

run "no_cluster_no_validation" {
  command = plan
  variables {
    restore_test_enabled            = true
    restore_validation_cluster_name = ""
  }
  assert {
    condition     = length(aws_backup_restore_testing_plan.db) == 1 && length(aws_lambda_function.restore_validate) == 0
    error_message = "restore test still runs; no validation without the cluster inputs"
  }
}
