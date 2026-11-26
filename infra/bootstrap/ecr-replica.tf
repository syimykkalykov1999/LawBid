# Stage 2 SRE (Б8): every new lawbid-* image is copied to the disaster-recovery
# region by ECR itself (modules/ecr-replica, ECR registry replication), and the
# repositories there keep the same rules. docs/runbooks/region-dr.md.
# ecr_replica_enabled = false removes it. Applied by the owner (bootstrap).
variable "ecr_replica_enabled" {
  type        = bool
  default     = true
  description = "Copy every new lawbid-* image to dr_region (ECR registry replication, storage ≈ $0.10/GB-month)."
}
variable "dr_region" {
  type        = string
  default     = "us-west-2"
  description = "Disaster-recovery region (backups.md: the database copies already go there)."
}

provider "aws" {
  alias  = "dr"
  region = var.dr_region
  default_tags {
    tags = { Project = "lawbid", Env = var.env, ManagedBy = "terraform-bootstrap" }
  }
}

module "ecr_replica" {
  source       = "../modules/ecr-replica"
  providers    = { aws = aws, aws.dr = aws.dr }
  enabled      = var.ecr_replica_enabled
  account_id   = data.aws_caller_identity.current.account_id
  main_region  = var.region
  dr_region    = var.dr_region
  repositories = { for k, p in aws_ecr_lifecycle_policy.app : k => p.policy }
}

output "dr_ecr_registry" {
  value       = module.ecr_replica.registry
  description = "Image registry of envs/dr (api_image = <this>/lawbid-api:<tag>)."
}
