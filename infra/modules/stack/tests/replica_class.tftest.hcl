# Owner row 196 (16.11): «Авто» read copies of the database must be the SAME
# class as the primary. The primary's class moves by itself (db-autoscale
# Lambda) while database_instance_class in tfvars stays the old number, so a
# copy created from that number came up db.t4g.micro next to a db.t4g.medium
# primary. One source of truth now: the class the primary really runs (read
# from AWS on every plan). terraform test with mock providers: no AWS, no state.
#   terraform -chdir=infra/modules/stack init -backend=false
#   terraform -chdir=infra/modules/stack test -filter=tests/replica_class.tftest.hcl

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

# The primary really runs db.t4g.medium (db-autoscale grew it); tfvars still
# say db.t4g.micro.
override_data {
  target = data.aws_db_instances.primary[0]
  values = { instance_identifiers = ["lawbid-prod-postgres"] }
}
override_data {
  target = data.aws_db_instance.primary[0]
  values = { engine_version = "18.6", db_instance_class = "db.t4g.medium" }
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
  db_shards               = 1
  growth                  = { rds_read_replicas = 2 }
  # Only so the plan-time connection check (check "db_connection_budget")
  # passes with the mocked class; nothing here is about connections.
  database_max_connections = 5000
}

run "copies_take_the_class_the_primary_really_runs" {
  command = plan
  assert {
    condition     = length(module.growth.replica_instance_classes) == 2
    error_message = "Two read copies of the primary are planned."
  }
  assert {
    condition     = alltrue([for c in module.growth.replica_instance_classes : c == data.aws_db_instance.primary[0].db_instance_class])
    error_message = "Every read copy has exactly the primary's current class, never the stale tfvars class."
  }
  assert {
    condition     = alltrue([for c in module.growth.replica_instance_classes : c == "db.t4g.medium"])
    error_message = "Copy class == primary class == db.t4g.medium (tfvars say db.t4g.micro)."
  }
}

run "extra_server_and_its_copies_have_one_class" {
  command = plan
  assert {
    condition     = module.postgres_shard[0].instance_class == "db.t4g.medium"
    error_message = "A new extra server takes the primary's current class, not the tfvars number."
  }
  assert {
    condition     = length(module.growth_shard[0].replica_instance_classes) == 2 && alltrue([for c in module.growth_shard[0].replica_instance_classes : c == module.postgres_shard[0].instance_class])
    error_message = "The copies of an extra server have that server's class."
  }
}

run "fresh_stack_without_a_primary_uses_the_class_it_creates" {
  command = plan
  override_data {
    target = data.aws_db_instances.primary[0]
    values = { instance_identifiers = [] }
  }
  assert {
    condition     = alltrue([for c in module.growth.replica_instance_classes : c == module.postgres[0].instance_class])
    error_message = "On a fresh stack the copies take the class the primary is created with."
  }
}

run "a_separate_copy_size_is_refused" {
  command = plan
  variables {
    growth = { rds_read_replicas = 1, rds_replica_instance_class = "db.t4g.micro" }
  }
  expect_failures = [var.growth]
}
