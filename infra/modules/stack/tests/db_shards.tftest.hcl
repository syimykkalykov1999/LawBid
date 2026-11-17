# KNOWN_ERRORS 189 (16.11): the extra database servers («Авто», aws.db_shards)
# came up on PostgreSQL 16.13 next to a primary on 18.6, and a removed empty
# server left a final snapshot and retained automated backups that kept
# billing. terraform test with mock providers: no AWS, no state.
#   terraform -chdir=infra/modules/stack init -backend=false
#   terraform -chdir=infra/modules/stack test

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

# The primary really runs 18.6 (as prod after the Blue/Green switchover 15.11).
override_data {
  target = data.aws_db_instances.primary[0]
  values = { instance_identifiers = ["lawbid-prod-postgres"] }
}
override_data {
  target = data.aws_db_instance.primary[0]
  values = { engine_version = "18.6", db_instance_class = "db.t4g.small" }
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
  database_engine_version = "16"
  db_shards               = 2
  # Only so the plan-time connection check (check "db_connection_budget")
  # passes with the mocked class; nothing here is about connections.
  database_max_connections = 5000
}

run "extra_servers_follow_the_primary" {
  command = plan
  assert {
    condition     = module.postgres[0].engine_major == "18"
    error_message = "The primary runs 18."
  }
  assert {
    condition     = alltrue([for m in module.postgres_shard : m.engine_major == module.postgres[0].engine_major])
    error_message = "Every extra server has the primary's major version."
  }
  assert {
    condition     = alltrue([for m in module.postgres_shard : m.engine_version == "18.6"])
    error_message = "Every extra server has exactly the primary's running version 18.6, never the bare default (16 -> 16.13)."
  }
  assert {
    condition     = alltrue([for i, m in module.postgres_shard : m.parameter_group_name == "lawbid-prod-db${i + 1}-postgres18"])
    error_message = "Every extra server is on its postgres18 group, the primary's family."
  }
  assert {
    condition     = module.postgres[0].parameter_group_name == "lawbid-prod-postgres18"
    error_message = "The primary stays on its postgres18 group."
  }
  assert {
    condition     = alltrue([for m in module.postgres_shard : m.allow_major_version_upgrade])
    error_message = "An existing extra server may follow the primary to a new major version."
  }
  assert {
    condition     = !module.postgres[0].allow_major_version_upgrade
    error_message = "The primary never upgrades its major in place (Blue/Green only)."
  }
}

run "removed_empty_server_leaves_nothing" {
  command = plan
  assert {
    condition     = alltrue([for m in module.postgres_shard : m.skip_final_snapshot && m.delete_automated_backups && m.final_snapshot_identifier == null])
    error_message = "An extra server is removed without a final snapshot and without retained automated backups."
  }
  assert {
    condition     = !module.postgres[0].skip_final_snapshot && !module.postgres[0].delete_automated_backups && module.postgres[0].final_snapshot_identifier != null
    error_message = "The primary keeps its final snapshot and its automated backups."
  }
  assert {
    condition     = module.postgres[0].deletion_protection
    error_message = "The primary keeps deletion protection."
  }
}
