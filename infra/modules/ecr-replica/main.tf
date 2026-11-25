# Stage 2 SRE (Б8, AWS Well-Architected REL13-BP02 «backup & restore»): the
# container images exist in the disaster-recovery region too, so after the loss of
# the main region envs/dr can start the same release without a rebuild.
#
# The ready AWS mechanism: ECR private registry replication
# (docs.aws.amazon.com/AmazonECR/latest/userguide/replication.html). Every image
# pushed to a matching repository after this is applied is copied by ECR itself;
# older images are not (docs/runbooks/region-dr.md copies the running tag once).
# Replication does NOT copy lifecycle policies, so the repositories in the DR
# region are created here with the same rules (otherwise they keep every image).
#
# Cost: storage only, ≈ $0.10 per GB-month, plus cross-region transfer of each new
# image. Used by infra/bootstrap (applied by the owner).
terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 6.72"
      configuration_aliases = [aws.dr]
    }
  }
}

variable "enabled" {
  type    = bool
  default = true
}
variable "account_id" {
  type        = string
  description = "This account (the registry replicates into itself, in dr_region)."
}
variable "main_region" { type = string }
variable "dr_region" {
  type    = string
  default = "us-west-2"
  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]$", var.dr_region))
    error_message = "dr_region must be an AWS region name like us-west-2."
  }
}
variable "prefix" {
  type        = string
  default     = "lawbid-"
  description = "Repositories whose name starts with this are replicated."
}
variable "repositories" {
  type        = map(string)
  description = "Repository name -> its lifecycle policy JSON (the same rules in the DR region)."
}

locals {
  on = var.enabled && var.dr_region != var.main_region
}

resource "aws_ecr_replication_configuration" "this" {
  count = local.on ? 1 : 0
  replication_configuration {
    rule {
      destination {
        region      = var.dr_region
        registry_id = var.account_id
      }
      repository_filter {
        filter      = var.prefix
        filter_type = "PREFIX_MATCH"
      }
    }
  }
}

resource "aws_ecr_repository" "dr" {
  provider             = aws.dr
  for_each             = local.on ? var.repositories : {}
  name                 = each.key
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecr_lifecycle_policy" "dr" {
  provider   = aws.dr
  for_each   = aws_ecr_repository.dr
  repository = each.value.name
  policy     = var.repositories[each.key]
}

output "registry" {
  value       = local.on ? "${var.account_id}.dkr.ecr.${var.dr_region}.amazonaws.com" : null
  description = "Image registry of envs/dr (api_image = <this>/lawbid-api:<tag>)."
}
