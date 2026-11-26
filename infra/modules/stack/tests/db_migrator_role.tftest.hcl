# D8 (26.11, docs/runbooks/db-migrator-role.md): the login secret of
# lawbid_migrator always exists (so the admin switch's Выкл never destroys a
# secret, which the infra-apply plan guard refuses); the switch only plans.
# terraform test with mock providers: no AWS, no state.
#   terraform -chdir=infra/modules/stack init -backend=false
#   terraform -chdir=infra/modules/stack test -filter=tests/db_migrator_role.tftest.hcl

# override_during = plan: mock values exist already at plan time (counts that
# read another resource's attributes, e.g. a target group's arn_suffix).
mock_provider "aws" {
  override_during = plan
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}", minified_json = "{}" }
  }
  mock_data "aws_region" {
    defaults = { region = "us-east-1", name = "us-east-1" }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:us-east-1:111111111111:alerts" }
  }
  mock_resource "aws_cloudfront_distribution" {
    defaults = { id = "E1TEST", arn = "arn:aws:cloudfront::111111111111:distribution/E1TEST", domain_name = "d1.cloudfront.net" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/t/1", arn_suffix = "targetgroup/t/1" }
  }
}
mock_provider "aws" {
  alias           = "replica"
  override_during = plan
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}", minified_json = "{}" }
  }
  mock_data "aws_region" {
    defaults = { region = "us-east-1", name = "us-east-1" }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:us-east-1:111111111111:alerts" }
  }
  mock_resource "aws_cloudfront_distribution" {
    defaults = { id = "E1TEST", arn = "arn:aws:cloudfront::111111111111:distribution/E1TEST", domain_name = "d1.cloudfront.net" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/t/1", arn_suffix = "targetgroup/t/1" }
  }
}
mock_provider "random" {
  override_during = plan
}
mock_provider "tls" {
  override_during = plan
}
mock_provider "archive" {
  override_during = plan
}

override_data {
  target = data.aws_db_instances.primary[0]
  values = { instance_identifiers = [] }
}

variables {
  env                     = "prod"
  azs                     = ["us-east-1a", "us-east-1b"]
  domain                  = "example.test"
  api_host                = "api.example.test"
  admin_host              = "admin.example.test"
  app_link_base_url       = "https://example.test"
  certificate_arn         = "arn:aws:acm:us-east-1:111111111111:certificate/1"
  dmarc_rua               = "mailto:dmarc@example.test"
  ses_from_address        = "no-reply@example.test"
  api_image               = "111111111111.dkr.ecr.us-east-1.amazonaws.com/lawbid-api:t"
  admin_image             = "111111111111.dkr.ecr.us-east-1.amazonaws.com/lawbid-admin:t"
  alert_emails            = ["ops@example.test"]
  create_database         = true
  database_major_version  = "18"
  database_instance_class = "db.t4g.micro"
  # Only so the plan-time connection check (check "db_connection_budget")
  # passes with the mocked class; nothing here is about connections.
  database_max_connections = 5000
}

run "secret_exists_with_the_switch_off" {
  command = plan
  assert {
    condition     = aws_secretsmanager_secret.migrator_role_password.name == "lawbid-prod/MIGRATOR_ROLE_PASSWORD"
    error_message = "the migrator login secret must exist even with db_migrator_role_enabled = false"
  }
  assert {
    condition     = random_password.migrator.length == 40 && random_password.migrator.special == false
    error_message = "40 letters and digits, like PARTITION_DB_PASSWORD (URL-safe)"
  }
}

run "switch_on_plans" {
  command = plan
  variables {
    db_migrator_role_enabled = true
  }
  assert {
    condition     = aws_secretsmanager_secret.migrator_role_password.name == "lawbid-prod/MIGRATOR_ROLE_PASSWORD"
    error_message = "same secret with the switch on"
  }
}
