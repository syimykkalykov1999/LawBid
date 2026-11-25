# G1 (docs/dev/STAGE2_ARCH_PERF_2026-11-25.md): the API edge switches of the
# stack. terraform test with mock providers: no AWS, no state.
#   terraform -chdir=infra/modules/stack init -backend=false
#   terraform -chdir=infra/modules/stack test -filter=tests/api_edge.tftest.hcl

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
  db_shards               = 1
  # Only so the plan-time connection check (check "db_connection_budget")
  # passes with the mocked class; nothing here is about connections.
  database_max_connections = 5000
}

run "off_by_default" {
  command = plan
  assert {
    condition     = length(module.api_edge) == 0 && length(random_password.api_edge_origin) == 0
    error_message = "no edge unless the owner turns it on"
  }
  assert {
    condition     = local.api_env.TRUST_PROXY_HOPS == "1"
    error_message = "one proxy hop (the ALB) as today"
  }
}

run "edge_on_lock_off_keeps_one_hop" {
  command = plan
  variables {
    api_edge_enabled = true
  }
  assert {
    condition     = length(module.api_edge) == 1 && length(random_password.api_edge_origin) == 1
    error_message = "the edge and its origin secret are planned"
  }
  assert {
    condition     = local.api_env.TRUST_PROXY_HOPS == "1"
    error_message = "before the lock a direct request has one hop: 2 would let a client pick its address"
  }
}

run "lock_trusts_cloudfront_and_the_alb" {
  command = plan
  variables {
    api_edge_enabled     = true
    api_edge_origin_lock = true
  }
  assert {
    condition     = local.api_env.TRUST_PROXY_HOPS == "2"
    error_message = "with the lock every request passes CloudFront + ALB"
  }
}

run "lock_without_edge_is_refused" {
  command = plan
  variables {
    api_edge_origin_lock = true
  }
  expect_failures = [var.api_edge_origin_lock]
}

run "lock_with_the_web_api_proxy_is_refused" {
  command = plan
  variables {
    api_edge_enabled     = true
    api_edge_origin_lock = true
    web_api_proxy        = true
  }
  expect_failures = [var.api_edge_origin_lock]
}
