# Б9 (25.11, AWS Well-Architected SEC04-BP01/BP03, SEC06-BP01, SEC03-BP04):
# Security Hub with AWS Foundational Security Best Practices, Inspector for
# ECR, the IAM Access Analyzer unused-access analyzer and GuardDuty Runtime
# Monitoring (Fargate agent only). Prod turns all of them on by default
# (infra/envs/prod/variables.tf). Mock providers: no AWS.
#   terraform -chdir=infra/modules/security-baseline init -backend=false
#   terraform -chdir=infra/modules/security-baseline test

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
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/a" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::lawbid-prod-cloudtrail-111111111111" }
  }
}

variables {
  name             = "lawbid-prod"
  alerts_topic_arn = "arn:aws:sns:us-east-1:111111111111:alerts"
}

run "all_on" {
  command = plan
  variables {
    security_hub_enabled           = true
    securityhub_fsbp_enabled       = true
    inspector_enabled              = true
    unused_access_analyzer_enabled = true
    guardduty_runtime_monitoring   = true
  }
  assert {
    condition     = length(aws_securityhub_account.this) == 1 && length(aws_securityhub_standards_subscription.fsbp) == 1
    error_message = "Security Hub + the AWS Foundational Security Best Practices standard"
  }
  assert {
    condition     = endswith(aws_securityhub_standards_subscription.fsbp[0].standards_arn, "standards/aws-foundational-security-best-practices/v/1.0.0")
    error_message = "FSBP standard ARN"
  }
  assert {
    condition     = length(aws_inspector2_enabler.ecr) == 1 && length(aws_cloudwatch_event_rule.inspector) == 1
    error_message = "Inspector scans ECR and CRITICAL/HIGH findings reach the alerts topic"
  }
  assert {
    condition     = length(aws_accessanalyzer_analyzer.unused) == 1 && aws_accessanalyzer_analyzer.unused[0].type == "ACCOUNT_UNUSED_ACCESS"
    error_message = "unused-access analyzer"
  }
  assert {
    condition     = aws_guardduty_detector_feature.runtime.status == "ENABLED"
    error_message = "GuardDuty Runtime Monitoring on"
  }
  assert {
    condition = alltrue([
      for c in aws_guardduty_detector_feature.runtime.additional_configuration :
      c.status == (c.name == "ECS_FARGATE_AGENT_MANAGEMENT" ? "ENABLED" : "DISABLED")
    ])
    error_message = "only the Fargate agent is managed (no EKS / EC2 agents)"
  }
}

run "runtime_needs_the_detector" {
  command = plan
  variables {
    guardduty_enabled            = false
    guardduty_runtime_monitoring = true
  }
  assert {
    condition     = aws_guardduty_detector_feature.runtime.status == "DISABLED"
    error_message = "no detector = no runtime monitoring"
  }
}

run "fsbp_needs_security_hub" {
  command = plan
  variables {
    security_hub_enabled     = false
    securityhub_fsbp_enabled = true
  }
  assert {
    condition     = length(aws_securityhub_account.this) == 0 && length(aws_securityhub_standards_subscription.fsbp) == 0
    error_message = "the standard is not subscribed without Security Hub"
  }
}
