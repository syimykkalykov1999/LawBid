# Stage 2 SRE (Б4): the 11.11 failure mode pages. A rule removed from the database or
# pooler security group (RevokeSecurityGroupIngress by the deploy role on 11.11) goes to
# the paging topic at once; no groups = no rule, as before.
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

run "no_groups_no_rule" {
  command = plan
  assert {
    condition     = length(aws_cloudwatch_event_rule.db_access_removed) == 0 && length(aws_cloudwatch_event_target.db_access_removed) == 0
    error_message = "without db_security_group_ids nothing is created"
  }
}

run "a_removed_rule_on_the_db_or_pooler_group_pages" {
  command = plan
  variables {
    db_security_group_ids = ["sg-db", "sg-pooler"]
  }
  assert {
    condition     = length(aws_cloudwatch_event_rule.db_access_removed) == 1
    error_message = "the rule exists"
  }
  assert {
    condition     = contains(jsondecode(aws_cloudwatch_event_rule.db_access_removed[0].event_pattern).detail["$or"][0].eventName, "RevokeSecurityGroupIngress")
    error_message = "RevokeSecurityGroupIngress (the 11.11 call) is watched"
  }
  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.db_access_removed[0].event_pattern).detail["$or"][0].requestParameters.groupId == ["sg-db", "sg-pooler"]
    error_message = "only the database and pooler groups"
  }
  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.db_access_removed[0].event_pattern).detail["$or"][1].requestParameters.ModifySecurityGroupRulesRequest.GroupId == ["sg-db", "sg-pooler"]
    error_message = "a rewritten rule (ModifySecurityGroupRules) on those groups too"
  }
  assert {
    condition     = !contains(jsondecode(aws_cloudwatch_event_rule.db_access_removed[0].event_pattern).detail["$or"][0].eventName, "AuthorizeSecurityGroupIngress")
    error_message = "an added rule never pages"
  }
  assert {
    condition     = aws_cloudwatch_event_target.db_access_removed[0].target_id == "page" && aws_cloudwatch_event_target.db_access_removed_mail[0].target_id == "alerts"
    error_message = "it pages and mails (ARNs are known only after apply; db-access-alarm.tf wires page = critical topic, alerts = alerts topic)"
  }
  assert {
    condition     = strcontains(aws_cloudwatch_event_target.db_access_removed[0].input_transformer[0].input_template, "/docs/postmortems/2026-11-11-db-sg-pooler.md")
    error_message = "the page links the 11.11 postmortem"
  }
}
