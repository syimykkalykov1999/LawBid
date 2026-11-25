# Stage 2 SRE (Б8): disaster recovery after the loss of the main region (us-east-1).
# Strategy «backup & restore» (AWS Well-Architected REL13-BP02, the cheapest of the
# four: nothing runs here until the day it is needed, so it costs $0 at rest):
#   - the database copies already go to the backup vault lawbid-prod-db-dr in
#     us-west-2 every night (modules/backup, docs/runbooks/backups.md: RPO ≤ 24 h);
#   - the images are copied there by ECR replication (infra/bootstrap, ecr-replica);
#   - the secrets are replicated there by Secrets Manager (secrets_replica_enabled);
#   - this root builds the SAME stack (modules/stack) in us-west-2, on the database
#     restored from the vault (create_database = false + its identifier).
# Steps, RTO / RPO, DNS and the yearly drill: docs/runbooks/region-dr.md.
# Applied by the owner only, on that day or in the drill; never by CI.
terraform {
  required_version = ">= 1.9"
  # State in a bucket of the DR region (backend.hcl.example): the main region's
  # state bucket may be the thing that is gone.
  backend "s3" {}
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.72" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
    tls    = { source = "hashicorp/tls", version = "~> 4.0" }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "lawbid", Env = "dr", ManagedBy = "terraform" }
  }
}

# The stack keeps a copy of the documents and a backup key in a second region.
# During a region loss that cannot be the lost region, hence a third one.
provider "aws" {
  alias  = "replica"
  region = var.replica_region
  default_tags {
    tags = { Project = "lawbid", Env = "dr", ManagedBy = "terraform" }
  }
}

data "aws_caller_identity" "current" {}

locals {
  # Images replicated by ECR (infra/bootstrap output dr_ecr_registry).
  ecr_registry = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.region}.amazonaws.com"
  api_image    = "${local.ecr_registry}/lawbid-api:${var.image_tag}"
  admin_image  = "${local.ecr_registry}/lawbid-admin:${var.image_tag}"
}

check "dr_region_is_not_the_main_one" {
  assert {
    condition     = var.region != "us-east-1" && var.replica_region != "us-east-1" && var.region != var.replica_region
    error_message = "envs/dr must run outside the main region us-east-1 (and its replica region must be a third one)."
  }
}

module "stack" {
  source    = "../../modules/stack"
  providers = { aws = aws, aws.replica = aws.replica }

  env      = "dr"
  azs      = var.azs
  vpc_cidr = var.vpc_cidr

  # The database restored from the vault lawbid-prod-db-dr (runbook step 2).
  create_database              = false
  existing_database_identifier = var.restored_database_identifier

  domain              = var.domain
  api_host            = var.api_host
  admin_host          = var.admin_host
  app_link_base_url   = var.app_link_base_url
  certificate_arn     = var.certificate_arn
  web_host            = var.web_host
  web_certificate_arn = var.web_certificate_arn
  dmarc_rua           = var.dmarc_rua
  ses_from_address    = var.ses_from_address
  api_image           = local.api_image
  admin_image         = local.admin_image
  alert_emails        = var.alert_emails

  # Tasks: 0 in a drill that only proves the plan and the start; the prod
  # floor on the real day (runbook).
  min_tasks   = var.min_tasks
  admin_tasks = var.admin_tasks

  growth = var.growth
}

output "stack" { value = module.stack }
