# The throw-away LOAD-TEST stack (docs/runbooks/LOAD_TEST.md).
#
# A second, complete copy of the platform in the same AWS account, sized like
# prod, created by .github/workflows/load-test.yml for one run and destroyed
# at the end of it (or by load-test-watchdog.yml after 4 hours at the latest).
#
#   * Never production: its own state (S3 key loadtest/<run_id>/...), its own
#     names (lawbid-loadtest-...), its own VPC; api_host must not be a prod host.
#   * Everything is tagged Project=lawbid-loadtest + CreatedAt + RunId: the IAM
#     role of the workflow can only touch resources with that tag, and the
#     watchdog finds leftovers by it.
#   * var.ephemeral = true (modules/stack): database without deletion
#     protection, buckets that can be emptied by destroy, secrets and keys
#     deleted at once, and none of the account-wide singletons (SES identity,
#     CloudTrail / GuardDuty baseline, account budget).
#   * Generators (modules/loadgen) are EC2 Spot boxes in the same VPC.
#
# State: terraform init -backend-config=backend.hcl.example values + key per run.
terraform {
  required_version = ">= 1.9"
  backend "s3" {}
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.60" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

locals {
  tags = {
    Project   = "lawbid-loadtest"
    Env       = "loadtest"
    ManagedBy = "terraform"
    CreatedAt = var.created_at
    RunId     = var.run_id
    Profile   = var.profile
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = local.tags
  }
}

provider "aws" {
  alias  = "replica"
  region = var.replica_region
  default_tags {
    tags = local.tags
  }
}

module "stack" {
  source    = "../../modules/stack"
  providers = { aws = aws, aws.replica = aws.replica }

  env         = "loadtest"
  ephemeral   = true
  project_tag = "lawbid-loadtest"
  extra_tags  = { CreatedAt = var.created_at, RunId = var.run_id, Profile = var.profile }

  azs                 = var.azs
  vpc_cidr            = var.vpc_cidr
  domain              = var.domain
  api_host            = var.api_host
  admin_host          = var.admin_host
  app_link_base_url   = "https://${var.domain}"
  certificate_arn     = var.certificate_arn
  web_host            = ""
  web_certificate_arn = ""
  hosted_zone_id      = null
  dmarc_rua           = "loadtest@${var.domain}"
  ses_from_address    = "no-reply@${var.domain}"
  api_image           = var.api_image
  admin_image         = var.admin_image
  clamav_image        = var.clamav_image
  db_pooler_enabled   = var.db_pooler_enabled
  pgbouncer_image     = var.pgbouncer_image
  alert_emails        = var.alert_emails
  stripe_price_id     = ""

  # --- sized like prod (envs/prod launch size), numbers per profile ---------
  create_database         = true
  database_instance_class = var.database_instance_class
  db_autoscale_enabled    = var.db_autoscale_enabled
  database_multi_az       = false # failover is not what this test measures; Multi-AZ doubles the price
  # RDS needs at least 7 days of automated backups to allow point-in-time
  # restore; the instance (and its backups) is deleted at the end.
  database_backup_retention_days = 7
  backup_enabled                 = false
  redis_node_type                = var.redis_node_type
  redis_replicas                 = 1
  api_max_tasks                  = var.api_max_tasks
  worker_max_tasks               = var.worker_max_tasks
  min_tasks                      = var.min_tasks
  admin_tasks                    = 1
  api_cpu                        = 512
  api_memory                     = 1024
  worker_cpu                     = 512
  worker_memory                  = 4096
  api_spot                       = true
  worker_spot                    = true
  night_scale_down               = false
  worker_jobs_per_task           = 50
  nat_per_az                     = false
  interface_endpoints            = ["ecr.api", "ecr.dkr", "logs", "secretsmanager"]
  interface_endpoint_azs         = 1
  cpu_architecture               = var.cpu_architecture
  p95_target_ms                  = 600

  # --- calls ---------------------------------------------------------------
  # Owner 2026-10-24: calls use Cloudflare TURN; our own coturn is removed.
  turn_enabled        = false
  turn_second_enabled = false
  livekit_enabled     = var.livekit_enabled

  # --- the test comes from a handful of addresses: the per-IP edge limits
  # (WAF) would block the test itself, not protect anything. The API's own
  # per-user limit (100 / minute) stays on and is part of what is tested.
  waf_rate_limit_per_5m     = 2000000000
  cdn_waf_rate_limit_per_5m = 2000000000

  # --- nothing that sends mail, pages or costs per month --------------------
  uptime_canary_enabled  = false
  security_hub_enabled   = false
  create_anomaly_monitor = false
  monthly_budget_usd     = 1
  slack_webhook_url      = null

  growth = var.growth
}

# --- generators ----------------------------------------------------------------
module "loadgen" {
  source                  = "../../modules/loadgen"
  name                    = module.stack.name
  vpc_id                  = module.stack.vpc_id
  subnet_ids              = module.stack.public_subnet_ids
  tasks_security_group_id = module.stack.task_security_group_id
  generator_count         = var.generator_count
  instance_type           = var.generator_instance_type
  artifacts_bucket_arn    = module.stack.documents_bucket_arn
  web_bucket_name         = module.stack.web_bucket
  kms_key_arn             = module.stack.kms_key_arn
  secret_arns = compact(concat(
    [module.stack.rds_endpoint_secret_arn, module.stack.redis_url_secret_arn],
    [for k, v in module.stack.secret_arns : v if startswith(k, "LIVEKIT_")],
  ))
  tags = local.tags
}

# The generators talk to LiveKit's plain signalling port (7880) inside the VPC
# (the public 443 needs a DNS name and a Let's Encrypt certificate, which a
# throw-away stack does not have). Media still goes to the public address.
resource "aws_vpc_security_group_ingress_rule" "livekit_signal" {
  count                        = var.livekit_enabled ? 1 : 0
  security_group_id            = module.stack.livekit_security_group_id
  referenced_security_group_id = module.loadgen.security_group_id
  from_port                    = 7880
  to_port                      = 7880
  ip_protocol                  = "tcp"
  description                  = "load generators (lk load-test)"
}

output "stack" { value = module.stack }
output "generator_instance_ids" { value = module.loadgen.instance_ids }
output "generator_public_ips" { value = module.loadgen.public_ips }
output "run_id" { value = var.run_id }
