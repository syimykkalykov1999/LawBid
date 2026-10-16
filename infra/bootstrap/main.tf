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

# Keep the last 30 releases (rollback.yml needs older tags); ≈ $0.10/GB-month.
resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = aws_ecr_repository.app
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "keep last 30 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 30 }
      action       = { type = "expire" }
    }]
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
