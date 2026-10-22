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

  env = "prod"
  # Owner 2026-10-16: the launch database is RDS PostgreSQL in our AWS.
  create_database                = var.create_database
  database_instance_class        = var.database_instance_class
  database_backup_retention_days = var.database_backup_retention_days
  azs                            = var.azs
  vpc_cidr                       = var.vpc_cidr
  domain                         = var.domain
  api_host                       = var.api_host
  admin_host                     = var.admin_host
  app_link_base_url              = var.app_link_base_url
  certificate_arn                = var.certificate_arn
  web_host                       = var.web_host
  web_certificate_arn            = var.web_certificate_arn
  web_create_certificate         = var.web_create_certificate
  web_extra_hosts                = var.web_extra_hosts
  hosted_zone_id                 = var.hosted_zone_id
  dmarc_rua                      = var.dmarc_rua
  ses_from_address               = var.ses_from_address
  api_image                      = var.api_image
  admin_image                    = var.admin_image
  alert_emails                   = var.alert_emails
  slack_webhook_url              = var.slack_webhook_url
  stripe_price_id                = var.stripe_price_id
  extra_secrets                  = var.extra_secrets
  clamav_image                   = var.clamav_image
  fcm_project_id                 = var.fcm_project_id
  fcm_client_email               = var.fcm_client_email
  google_client_ids              = var.google_client_ids
  apple_bundle_ids               = var.apple_bundle_ids
  apple_team_id                  = var.apple_team_id
  redis_node_type                = var.redis_node_type
  redis_replicas                 = var.redis_replicas
  api_max_tasks                  = var.api_max_tasks
  worker_max_tasks               = var.worker_max_tasks
  min_tasks                      = var.min_tasks
  worker_spot                    = var.worker_spot
  api_spot                       = var.api_spot
  turn_enabled                   = var.turn_enabled
  admin_tasks                    = var.admin_tasks
  api_cpu                        = var.api_cpu
  api_memory                     = var.api_memory
  worker_cpu                     = var.worker_cpu
  worker_memory                  = var.worker_memory
  p95_target_ms                  = var.p95_target_ms
  nat_per_az                     = var.nat_per_az
  interface_endpoints            = var.interface_endpoints
  admin_allowed_cidrs            = var.admin_allowed_cidrs

  s3_cors_allowed_origins = var.s3_cors_allowed_origins

  monthly_budget_usd     = var.monthly_budget_usd
  create_anomaly_monitor = var.create_anomaly_monitor

  # Reliability (owner 2026-10-22): Multi-AZ, AWS Backup copies to the
  # replica region (+ optional backup account), worker scaling on queue
  # depth, cheaper endpoint placement, optional cache-only Redis.
  database_multi_az            = var.database_multi_az
  existing_database_identifier = var.existing_database_identifier
  backup_enabled               = var.backup_enabled
  backup_retention_days        = var.backup_retention_days
  backup_copy_account_id       = var.backup_copy_account_id
  backup_copy_vault_name       = var.backup_copy_vault_name
  backup_copy_region           = var.backup_copy_region
  interface_endpoint_azs       = var.interface_endpoint_azs
  redis_cache_node             = var.redis_cache_node
  redis_cache_node_type        = var.redis_cache_node_type
  worker_jobs_per_task         = var.worker_jobs_per_task
}

output "stack" { value = module.stack }
