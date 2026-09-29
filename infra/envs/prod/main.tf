# docs/06 §6.2 — prod. State in S3 with locking (backend.hcl, see README);
# providers for the main region and the documents replica region.
terraform {
  required_version = ">= 1.9"
  backend "s3" {}
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.60" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "lawbid", Env = "prod", ManagedBy = "terraform" }
  }
}

provider "aws" {
  alias  = "replica"
  region = var.replica_region
  default_tags {
    tags = { Project = "lawbid", Env = "prod", ManagedBy = "terraform" }
  }
}

module "stack" {
  source    = "../../modules/stack"
  providers = { aws = aws, aws.replica = aws.replica }

  env                 = "prod"
  azs                 = var.azs
  vpc_cidr            = var.vpc_cidr
  domain              = var.domain
  api_host            = var.api_host
  admin_host          = var.admin_host
  app_link_base_url   = var.app_link_base_url
  certificate_arn     = var.certificate_arn
  hosted_zone_id      = var.hosted_zone_id
  dmarc_rua           = var.dmarc_rua
  ses_from_address    = var.ses_from_address
  api_image           = var.api_image
  admin_image         = var.admin_image
  alert_emails        = var.alert_emails
  slack_webhook_url   = var.slack_webhook_url
  stripe_price_id     = var.stripe_price_id
  fcm_project_id      = var.fcm_project_id
  fcm_client_email    = var.fcm_client_email
  google_client_ids   = var.google_client_ids
  apple_bundle_ids    = var.apple_bundle_ids
  apple_team_id       = var.apple_team_id
  redis_node_type     = var.redis_node_type
  redis_replicas      = var.redis_replicas
  api_max_tasks       = var.api_max_tasks
  worker_max_tasks    = var.worker_max_tasks
  p95_target_ms       = var.p95_target_ms
  nat_per_az          = var.nat_per_az
  interface_endpoints = var.interface_endpoints
  admin_allowed_cidrs = var.admin_allowed_cidrs
}

output "stack" { value = module.stack }
