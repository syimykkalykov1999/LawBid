# One-time prerequisites of infra/envs/prod (infra/README.md «Prerequisites»),
# run once from the owner's Mac before the first prod apply:
#   - S3 bucket + DynamoDB table for the prod Terraform state and lock
#   - ECR repositories lawbid-api / lawbid-admin / lawbid-clamav (a copy of
#     the official ClamAV image: Fargate never pulls from Docker Hub, whose
#     anonymous pull limit would stall a scale-out)
#   - ACM certificate for api.<domain> and admin.<domain> (DNS validation:
#     add `terraform output acm_dns_records` at the registrar)
#   - GitHub OIDC provider + the deploy role used by deploy.yml / rollback.yml
# The state of THIS folder is local (terraform.tfstate next to this file,
# gitignored); it holds no secrets. Keep a copy, or re-import if lost.
terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "region" {
  type    = string
  default = "us-east-1"
}
variable "domain" {
  type    = string
  default = "lawbid.dev"
}
variable "github_repo" {
  type        = string
  default     = "syimykkalykov1999/LawBid"
  description = "owner/name of the repository whose Actions may deploy."
}
variable "env" {
  type    = string
  default = "prod"
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "lawbid", Env = var.env, ManagedBy = "terraform-bootstrap" }
  }
}

data "aws_caller_identity" "current" {}

locals {
  name    = "lawbid-${var.env}"
  account = data.aws_caller_identity.current.account_id
}

# --- Terraform state ---------------------------------------------------------
resource "aws_s3_bucket" "tfstate" {
  bucket = "${local.name}-tfstate"
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration { status = "Enabled" }
}

# Cleanup: every `terraform apply` writes a new state version; keep the old
# ones 90 days (enough to undo a bad apply), then drop them.
resource "aws_s3_bucket_lifecycle_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    id     = "old-state-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 90 }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
  depends_on = [aws_s3_bucket_versioning.tfstate]
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "aws:kms" }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "tflock" {
  name         = "${local.name}-tflock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"
  attribute {
    name = "LockID"
    type = "S"
  }
}

# --- Container images ----------------------------------------------------------
resource "aws_ecr_repository" "app" {
  for_each             = toset(["lawbid-api", "lawbid-admin", "lawbid-clamav"])
  name                 = each.key
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

# Cleanup (AWS cleanup audit 2026-10-23). Every merge to main pushes one tag
# (the commit SHA) to lawbid-api and lawbid-admin; rollback.yml needs older
# tags. Rule 1: images without a tag (leftovers of a half-finished push or an
# overwritten tag) go after 2 days; images that a tagged multi-arch manifest
# points to are never touched by this rule (ECR protects them). Rule 2: keep the
# newest 60 images of api / admin (≈ a week of heavy merging, about $2/month),
# 5 of ClamAV (one fixed tag, `1.4`). ≈ $0.10/GB-month.
locals {
  ecr_keep = { "lawbid-api" = 60, "lawbid-admin" = 60, "lawbid-clamav" = 5 }
}

resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = aws_ecr_repository.app
  repository = each.value.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "untagged images expire after 2 days"
        selection    = { tagStatus = "untagged", countType = "sinceImagePushed", countUnit = "days", countNumber = 2 }
        action       = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "keep the newest ${local.ecr_keep[each.key]} images"
        selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = local.ecr_keep[each.key] }
        action       = { type = "expire" }
      },
    ]
  })
}

# --- TLS certificate -------------------------------------------------------------
resource "aws_acm_certificate" "app" {
  domain_name               = "api.${var.domain}"
  subject_alternative_names = ["admin.${var.domain}"]
  validation_method         = "DNS"
  lifecycle { create_before_destroy = true }
}

# --- GitHub Actions deploy role (OIDC, no stored AWS keys) ---------------------
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_policy_document" "deploy_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # main-branch builds and the `production` environment jobs only.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repo}:ref:refs/heads/main",
        "repo:${var.github_repo}:environment:production",
        "repo:${lower(var.github_repo)}:ref:refs/heads/main",
        "repo:${lower(var.github_repo)}:environment:production",
      ]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "${local.name}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.deploy_trust.json
}

data "aws_iam_policy_document" "deploy" {
  statement {
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    actions = [
      "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:CompleteLayerUpload",
      "ecr:DescribeImages", "ecr:GetDownloadUrlForLayer", "ecr:InitiateLayerUpload",
      "ecr:PutImage", "ecr:UploadLayerPart",
    ]
    resources = [for r in aws_ecr_repository.app : r.arn]
  }
  statement {
    actions = [
      "ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition",
      "ecs:DescribeServices", "ecs:UpdateService",
      "ecs:RunTask", "ecs:DescribeTasks",
      "ec2:DescribeSubnets", "ec2:DescribeSecurityGroups",
    ]
    resources = ["*"]
  }
  statement {
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${local.account}:role/${local.name}-*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
  statement {
    actions   = ["logs:FilterLogEvents", "logs:GetLogEvents", "logs:DescribeLogStreams", "logs:DescribeLogGroups", "logs:StartLiveTail"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  role   = aws_iam_role.deploy.name
  policy = data.aws_iam_policy_document.deploy.json
}

# --- outputs -------------------------------------------------------------------
output "acm_certificate_arn" { value = aws_acm_certificate.app.arn }
output "acm_dns_records" {
  description = "Add each as a CNAME at the registrar (Namecheap: Host = name without the domain)."
  value = [for o in aws_acm_certificate.app.domain_validation_options : {
    type  = o.resource_record_type
    name  = o.resource_record_name
    value = o.resource_record_value
  }]
}
output "ecr_registry" { value = "${local.account}.dkr.ecr.${var.region}.amazonaws.com" }
output "deploy_role_arn" { value = aws_iam_role.deploy.arn }

# Owner 2026-10-16: the `sub` values the deploy role trusts, to compare with the
# real one printed by the "Show the OIDC claims" step of the Deploy workflow.
output "deploy_trust_sub" {
  value = [
    "repo:${var.github_repo}:ref:refs/heads/main",
    "repo:${var.github_repo}:environment:production",
  ]
}

# --- AWS inventory / cleanup roles (AWS cleanup audit 2026-10-23) --------------
# The deploy role above can not read the whole account, and must not be able to
# delete things. Two more roles, both without stored keys:
#  * inventory: read-only (AWS ReadOnlyAccess + cost data). Used by the manual
#    workflow "AWS inventory"; trusted from the main branch.
#  * cleanup: may delete ONLY the always-safe categories of the manual workflow
#    "AWS cleanup" (unattached EBS volumes, unassociated Elastic IPs, snapshots
#    / images, untagged ECR images, instances tagged lawbid-loadtest). Trusted
#    only for the GitHub environment `aws-cleanup` (needs a reviewer's click).
#    No RDS, no S3, no ElastiCache, no ECS permissions at all.
data "aws_iam_policy_document" "inventory_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repo}:ref:refs/heads/main",
        "repo:${lower(var.github_repo)}:ref:refs/heads/main",
      ]
    }
  }
}

resource "aws_iam_role" "inventory" {
  name               = "${local.name}-github-inventory"
  assume_role_policy = data.aws_iam_policy_document.inventory_trust.json
}

resource "aws_iam_role_policy_attachment" "inventory_readonly" {
  role       = aws_iam_role.inventory.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# ReadOnlyAccess has no Cost Explorer.
resource "aws_iam_role_policy" "inventory_cost" {
  role = aws_iam_role.inventory.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ce:GetCostAndUsage", "ce:GetCostForecast"]
      Resource = "*"
    }]
  })
}

data "aws_iam_policy_document" "cleanup_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repo}:environment:aws-cleanup",
        "repo:${lower(var.github_repo)}:environment:aws-cleanup",
      ]
    }
  }
}

resource "aws_iam_role" "cleanup" {
  name               = "${local.name}-github-cleanup"
  assume_role_policy = data.aws_iam_policy_document.cleanup_trust.json
}

data "aws_iam_policy_document" "cleanup" {
  statement {
    sid = "Look"
    actions = [
      "ec2:DescribeVolumes", "ec2:DescribeAddresses", "ec2:DescribeSnapshots",
      "ec2:DescribeImages", "ec2:DescribeInstances", "ec2:DescribeLaunchTemplateVersions",
      "ec2:DescribeLaunchTemplates", "ec2:DescribeTags", "ec2:DescribeRegions",
      "ecr:DescribeRepositories", "ecr:DescribeImages", "ecr:ListImages", "ecr:BatchGetImage",
      "tag:GetResources",
    ]
    resources = ["*"]
  }
  # Anything tagged Protect=true can never be deleted, whatever the script says.
  statement {
    sid       = "DeleteVolumesAddressesSnapshots"
    actions   = ["ec2:DeleteVolume", "ec2:ReleaseAddress", "ec2:DeleteSnapshot", "ec2:DeregisterImage"]
    resources = ["*"]
    condition {
      test     = "StringNotEquals"
      variable = "aws:ResourceTag/Protect"
      values   = ["true"]
    }
  }
  statement {
    sid       = "DeleteUntaggedEcrImages"
    actions   = ["ecr:BatchDeleteImage"]
    resources = [for r in aws_ecr_repository.app : r.arn]
  }
  statement {
    sid       = "TerminateLoadTestInstances"
    actions   = ["ec2:TerminateInstances"]
    resources = ["arn:aws:ec2:*:${local.account}:instance/*"]
    condition {
      test     = "StringLike"
      variable = "aws:ResourceTag/lawbid-loadtest"
      values   = ["*"]
    }
  }
}

resource "aws_iam_role_policy" "cleanup" {
  role   = aws_iam_role.cleanup.name
  policy = data.aws_iam_policy_document.cleanup.json
}

output "inventory_role_arn" {
  description = "Repository secret AWS_INVENTORY_ROLE (workflow `AWS inventory`)."
  value       = aws_iam_role.inventory.arn
}
output "cleanup_role_arn" {
  description = "Repository secret AWS_CLEANUP_ROLE (workflow `AWS cleanup`, environment aws-cleanup)."
  value       = aws_iam_role.cleanup.arn
}
