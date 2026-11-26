# One-time prerequisites of infra/envs/prod (infra/README.md «Prerequisites»),
# run once from the owner's Mac before the first prod apply:
#   - S3 bucket + DynamoDB table for the prod Terraform state and lock
#   - ECR repositories lawbid-api / lawbid-admin / lawbid-clamav / lawbid-pgbouncer (clamav: a copy of
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
    aws = { source = "hashicorp/aws", version = "~> 6.72" }
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
variable "github_repo_immutable" {
  type        = string
  default     = "syimykkalykov1999@91685781/LawBid@1400978845"
  description = "The repository has use_immutable_subject on: GitHub signs OIDC tokens as repo:<owner>@<owner_id>/<repo>@<repo_id>:... (gh api repos/OWNER/REPO/actions/oidc/customization/sub)."
}
variable "deploy_trust_main_branch" {
  type        = bool
  default     = true
  description = "S4-9: also trust plain main-branch workflow runs (no GitHub environment) for the deploy role. true = today's behaviour. false = only jobs that declare environment: production (approval gate) can assume it; first add `environment: production` to deploy.yml build, web-deploy, seo-deploy and self-check."
}
variable "deploy_max_session_seconds" {
  description = "Longest session the GitHub deploy role allows (seconds, 3600-43200). D1-37: 14400 covers plan + owner wait + a long apply."
  type        = number
  default     = 14400
  validation {
    condition     = var.deploy_max_session_seconds >= 3600 && var.deploy_max_session_seconds <= 43200
    error_message = "AWS allows 3600 to 43200 seconds."
  }
}

variable "env" {
  type    = string
  default = "prod"
}
# S11-2 / C4 (THIRD_PASS_B 26.11, GitHub docs «Configuring OpenID Connect in
# AWS», claim `job_workflow_ref`): each GitHub OIDC role is assumable only by
# the workflow FILES listed for it, as they are on main. A branch that edits a
# workflow (and an owner who clicks Approve on a normal-looking prompt) gets
# `job_workflow_ref = ...@refs/heads/<branch>` and is refused by AWS; a job in
# any OTHER workflow file on main is refused too. Three roles, each with only
# its own rights (AWS WA SEC03-BP02 least privilege):
#   deploy       ECS / CloudFront / SSM release rights   (deploy_workflows)
#   build        ECR push of the app images only         (build_workflows)
#   infra-apply  terraform apply from the admin          (infra-apply.tf)
# One file x 3 repository spellings per entry; the trust policy limit is 2048
# characters (ACLSizePerRole), checked by the precondition on each role.
# A NEW workflow that needs a role must be added here before its first run.
variable "bind_deploy_workflows" {
  type        = bool
  default     = true
  description = "Require the OIDC claim job_workflow_ref to be one of the listed workflow files of this repository on refs/heads/main."
}
variable "deploy_workflows" {
  type        = list(string)
  default     = ["deploy.yml", "rollback.yml", "web-deploy.yml", "seo-deploy.yml", "self-check.yml"]
  description = "Workflow files that may assume the deploy role (aws-inventory.yml uses the inventory role, image builds the build role, infra-apply.yml its own role)."
}
variable "build_workflows" {
  type        = list(string)
  default     = ["deploy.yml", "build-pgbouncer.yml", "mirror-clamav.yml"]
  description = "Workflow files that may assume the image build role (ECR push only)."
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
  # job_workflow_ref carries the repository name in the case GitHub emits;
  # all spellings of the repository are listed like the `sub` values.
  repo_spellings = distinct([var.github_repo, lower(var.github_repo), var.github_repo_immutable])
  # C4: one entry per workflow file and spelling (no `*` for the file: 08.11
  # the wildcard was used because ONE role carried nine files and went over
  # 2048 characters; split into three roles each list fits).
  deploy_workflow_refs = [
    for p in setproduct(var.deploy_workflows, local.repo_spellings) :
    "${p[1]}/.github/workflows/${p[0]}@refs/heads/main"
  ]
  build_workflow_refs = [
    for p in setproduct(var.build_workflows, local.repo_spellings) :
    "${p[1]}/.github/workflows/${p[0]}@refs/heads/main"
  ]
  # Every GitHub OIDC / bootstrap role. The pipeline roles may never change
  # them (ci-guard.tf, C5): they hold the Deny statements and the trust.
  bootstrap_role_names = [
    "${local.name}-github-deploy", "${local.name}-github-build", "${local.name}-github-infra-apply",
    "${local.name}-github-notify", "${local.name}-github-inventory", "${local.name}-github-cleanup",
    "${local.name}-github-plan", "${local.name}-github-media-backup", "${local.name}-tfstate-replication",
    # owner-only emergency administrator (modules/break-glass), never the pipeline's
    "${local.name}-break-glass",
  ]
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
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
      # S4-14: a customer-managed key only while the replica is on (state-replica.tf).
      kms_master_key_id = var.state_replica_enabled ? aws_kms_key.state[0].arn : null
    }
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
  for_each             = toset(["lawbid-api", "lawbid-admin", "lawbid-clamav", "lawbid-pgbouncer"])
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
  ecr_keep = { "lawbid-api" = 60, "lawbid-admin" = 60, "lawbid-clamav" = 5, "lawbid-pgbouncer" = 5 }
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
    # `production` environment jobs always; main-branch jobs (image build,
    # web deploy, self-check ...) only while deploy_trust_main_branch is true.
    # S4-9: with the main-branch line a push to main reaches the powerful
    # ECS permissions below WITHOUT the production approval. Set it to false
    # once every workflow that uses AWS_DEPLOY_ROLE_PROD declares
    # `environment: production` (docs/runbooks/infra-hardening.md).
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = concat(
        [
          "repo:${var.github_repo}:environment:production",
          "repo:${lower(var.github_repo)}:environment:production",
          "repo:${var.github_repo_immutable}:environment:production",
        ],
        var.deploy_trust_main_branch ? [
          "repo:${var.github_repo}:ref:refs/heads/main",
          "repo:${lower(var.github_repo)}:ref:refs/heads/main",
          "repo:${var.github_repo_immutable}:ref:refs/heads/main",
        ] : [],
        # C4: the `infra-apply` environment trusts its own role now
        # (infra-apply.tf aws_iam_role.infra_apply), not this one.
      )
    }
    # S11-2: bind the role to the protected workflow files on main (see
    # var.bind_deploy_workflows). The GitHub environment `production` should
    # ALSO be limited to the `main` branch (Settings -> Environments ->
    # production -> Deployment branches and tags -> Selected branches: main),
    # which is a repository setting, not Terraform.
    dynamic "condition" {
      for_each = var.bind_deploy_workflows ? [1] : []
      content {
        test     = "StringLike"
        variable = "token.actions.githubusercontent.com:job_workflow_ref"
        values   = local.deploy_workflow_refs
      }
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "${local.name}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.deploy_trust.json
  # D1-37: a session long enough for plan + the owner's 2FA wait + a long
  # apply (Multi-AZ, OpenSearch, a read copy: 20-60 min) or a deploy with
  # two rolling waits. The workflows ask for less unless the repository
  # variable AWS_APPLY_SESSION_SECONDS / AWS_DEPLOY_SESSION_SECONDS is set.
  max_session_duration = var.deploy_max_session_seconds
  lifecycle {
    # AWS refuses a trust policy longer than 2048 characters (whitespace
    # removed): stop at plan time instead of half-way through an apply.
    precondition {
      condition     = length(jsonencode(jsondecode(data.aws_iam_policy_document.deploy_trust.json))) <= 2048
      error_message = "The deploy role trust policy is longer than AWS allows (2048 characters, ACLSizePerRole)."
    }
  }
}

data "aws_iam_policy_document" "deploy" {
  statement {
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  # C4: pushing images is the build role's job (below); a release only reads
  # them (cosign verify, describe-images for the digest).
  statement {
    actions = [
      "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage",
      "ecr:DescribeImages", "ecr:GetDownloadUrlForLayer",
    ]
    resources = [for r in aws_ecr_repository.app : r.arn]
  }
  # S4-9: ECS actions limited to this environment's services, task-definition
  # families and cluster (everything is named lawbid-<env>...). A rogue
  # task definition for another family or cluster cannot be registered or run.
  statement {
    actions   = ["ecs:DescribeTaskDefinition", "ec2:DescribeSubnets", "ec2:DescribeSecurityGroups"]
    resources = ["*"] # no resource-level permission exists for these
  }
  statement {
    actions   = ["ecs:RegisterTaskDefinition"]
    resources = ["*"] # RegisterTaskDefinition cannot be scoped; iam:PassRole below is what bounds it
  }
  statement {
    actions   = ["ecs:DescribeServices", "ecs:UpdateService"]
    resources = ["arn:aws:ecs:*:${local.account}:service/${local.name}/*"]
  }
  # X1 (25.11): scripts/deploy/roll-services.sh waits for the result of an ECS
  # built-in canary / linear deployment (ListServiceDeployments ->
  # DescribeServiceRevisions -> DescribeServiceDeployments). Read only.
  statement {
    actions = ["ecs:ListServiceDeployments", "ecs:DescribeServiceDeployments", "ecs:DescribeServiceRevisions"]
    resources = [
      "arn:aws:ecs:*:${local.account}:service/${local.name}/*",
      "arn:aws:ecs:*:${local.account}:service-deployment/${local.name}/*",
      "arn:aws:ecs:*:${local.account}:service-revision/${local.name}/*",
    ]
  }
  # Canary (scripts/deploy/canary.sh, off unless CANARY_ENABLED): one temporary
  # service api-canary, nothing else can be created or deleted.
  statement {
    actions   = ["ecs:CreateService", "ecs:DeleteService", "ecs:TagResource"]
    resources = ["arn:aws:ecs:*:${local.account}:service/${local.name}/api-canary"]
  }
  statement {
    actions   = ["cloudwatch:DescribeAlarms"]
    resources = ["*"] # no resource-level permission exists for this read
  }
  statement {
    actions   = ["ecs:RunTask"]
    resources = ["arn:aws:ecs:*:${local.account}:task-definition/${local.name}-*:*"]
    condition {
      test     = "ArnLike"
      variable = "ecs:cluster"
      values   = ["arn:aws:ecs:*:${local.account}:cluster/${local.name}"]
    }
  }
  statement {
    # S11-4: DescribeTasks, plus StopTask (a migrate task past its deadline or
    # cancelled) and ListTasks (refuse a second concurrent migration).
    actions   = ["ecs:DescribeTasks", "ecs:StopTask"]
    resources = ["arn:aws:ecs:*:${local.account}:task/${local.name}/*"]
  }
  statement {
    actions   = ["ecs:ListTasks"]
    resources = ["*"] # ListTasks has no resource-level permission
  }
  # S11-14: the real backup check (LatestRestorableTime) and the named snapshot
  # taken before a contract migration. One database, one snapshot name pattern.
  statement {
    actions   = ["rds:DescribeDBInstances", "rds:CreateDBSnapshot"]
    resources = ["arn:aws:rds:${var.region}:${local.account}:db:${local.name}-postgres"]
  }
  statement {
    actions   = ["rds:CreateDBSnapshot", "rds:DescribeDBSnapshots", "rds:AddTagsToResource"]
    resources = ["arn:aws:rds:${var.region}:${local.account}:snapshot:pre-migrate-*"]
  }
  # S11-9: the last release that passed smoke (rollback's default target).
  statement {
    actions   = ["ssm:GetParameter", "ssm:PutParameter"]
    resources = ["arn:aws:ssm:${var.region}:${local.account}:parameter/${local.name}/deploy/*"]
  }
  # Daily self-check (scripts/ops/self-check.sh, read-only): the alert topic
  # and its e-mail subscription, and the monthly budget. ListTopics has no
  # resource-level permission; the rest is scoped to this environment.
  statement {
    actions   = ["sns:ListTopics"]
    resources = ["*"]
  }
  statement {
    actions   = ["sns:ListSubscriptionsByTopic"]
    resources = ["arn:aws:sns:${var.region}:${local.account}:${local.name}-alerts"]
  }
  statement {
    actions   = ["budgets:ViewBudget"]
    resources = ["arn:aws:budgets::${local.account}:budget/${local.name}-monthly"]
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

# --- Image build role (C4, THIRD_PASS_B 26.11) ---------------------------------
# The image build jobs (deploy.yml «Build & push», build-pgbouncer.yml,
# mirror-clamav.yml) ran on the deploy role and so held its ECS / IAM-pass
# rights on every push to main. They get this role instead: ECR push to the
# app repositories, nothing else. Workflows: secret AWS_BUILD_ROLE_PROD
# (terraform output build_role_arn), falling back to AWS_DEPLOY_ROLE_PROD.
data "aws_iam_policy_document" "build_trust" {
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
    # deploy.yml builds on main; build-pgbouncer / mirror-clamav run in the
    # `production` environment.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = flatten([for r in local.repo_spellings : [
        "repo:${r}:ref:refs/heads/main",
        "repo:${r}:environment:production",
      ]])
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:job_workflow_ref"
      values   = local.build_workflow_refs
    }
  }
}

resource "aws_iam_role" "build" {
  name               = "${local.name}-github-build"
  assume_role_policy = data.aws_iam_policy_document.build_trust.json
  lifecycle {
    precondition {
      condition     = length(jsonencode(jsondecode(data.aws_iam_policy_document.build_trust.json))) <= 2048
      error_message = "The build role trust policy is longer than AWS allows (2048 characters, ACLSizePerRole)."
    }
  }
}

data "aws_iam_policy_document" "build" {
  statement {
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"] # no resource-level permission exists for this
  }
  statement {
    actions = [
      "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:CompleteLayerUpload",
      "ecr:DescribeImages", "ecr:GetDownloadUrlForLayer", "ecr:InitiateLayerUpload",
      "ecr:PutImage", "ecr:UploadLayerPart",
    ]
    resources = [for r in aws_ecr_repository.app : r.arn]
  }
}

resource "aws_iam_role_policy" "build" {
  name   = "build"
  role   = aws_iam_role.build.name
  policy = data.aws_iam_policy_document.build.json
}

output "build_role_arn" {
  description = "Repository secret AWS_BUILD_ROLE_PROD (deploy.yml image builds, build-pgbouncer.yml, mirror-clamav.yml)."
  value       = aws_iam_role.build.arn
}

# --- CI failure notifications (S11-6) -------------------------------------------
# .github/workflows/notify-failure.yml publishes one line to the existing alerts
# topic (infra/modules/monitoring: <name>-alerts, e-mail subscribers). Trusted only
# for that reusable workflow on main; may do nothing but sns:Publish.
data "aws_iam_policy_document" "notify_trust" {
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
      variable = "token.actions.githubusercontent.com:job_workflow_ref"
      values   = [for r in distinct([var.github_repo, lower(var.github_repo)]) : "${r}/.github/workflows/notify-failure.yml@refs/heads/main"]
    }
    # Called from any workflow on main (push, schedule) or the production environment.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repo}:ref:refs/heads/main",
        "repo:${lower(var.github_repo)}:ref:refs/heads/main",
        "repo:${var.github_repo_immutable}:ref:refs/heads/main",
      ]
    }
  }
}

resource "aws_iam_role" "notify" {
  name               = "${local.name}-github-notify"
  assume_role_policy = data.aws_iam_policy_document.notify_trust.json
}

resource "aws_iam_role_policy" "notify" {
  role = aws_iam_role.notify.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sns:Publish"]
      Resource = "arn:aws:sns:${var.region}:${local.account}:${local.name}-alerts"
    }]
  })
}

# --- outputs -------------------------------------------------------------------
output "notify_role_arn" {
  description = "GitHub secret AWS_NOTIFY_ROLE (notify-failure.yml)."
  value       = aws_iam_role.notify.arn
}
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
  value = concat(
    var.deploy_trust_main_branch ? ["repo:${var.github_repo}:ref:refs/heads/main"] : [],
    ["repo:${var.github_repo}:environment:production"],
  )
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
        "repo:${var.github_repo_immutable}:ref:refs/heads/main",
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
        "repo:${var.github_repo_immutable}:environment:aws-cleanup",
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

# --- Terraform drift check role (P1, 2026-10-24) --------------------------------
# Used ONLY by the nightly workflow "Terraform drift" (terraform plan, never
# apply). Read-only on the account (AWS ReadOnlyAccess) + read of the prod state
# and of the secrets Terraform refreshes. Trusted from the main branch only
# (scheduled runs always run on the default branch). It has NO write permission
# anywhere: the S3 state bucket is read-only (explicit Deny on writes) and the
# plan runs with -lock=false, so it needs nothing on the lock table.
data "aws_iam_policy_document" "plan_trust" {
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
        "repo:${var.github_repo_immutable}:ref:refs/heads/main",
      ]
    }
  }
}

resource "aws_iam_role" "plan" {
  name                 = "${local.name}-github-plan"
  assume_role_policy   = data.aws_iam_policy_document.plan_trust.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "plan_readonly" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy" "plan" {
  role = aws_iam_role.plan.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadPlanState"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:ListBucket", "s3:GetBucketLocation"]
        Resource = [aws_s3_bucket.tfstate.arn, "${aws_s3_bucket.tfstate.arn}/prod/*"]
      },
      {
        Sid      = "DecryptState"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = "*"
        # 13.11 (KNOWN_ERRORS 134): the prod secrets use the stack's CMK too;
        # without secretsmanager here the drift plan could not refresh the 5
        # secret versions (GetSecretValue alone is not enough) and never ran.
        Condition = {
          StringEquals = { "kms:ViaService" = ["s3.${var.region}.amazonaws.com", "secretsmanager.${var.region}.amazonaws.com"] }
        }
      },
      {
        # The prod tfvars backup, and the secret values Terraform refreshes.
        # The same values are already in the state this role may read.
        Sid      = "ReadProdSecrets"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = "arn:aws:secretsmanager:*:${local.account}:secret:lawbid-${var.env}/*"
      },
      {
        Sid    = "NeverWriteState"
        Effect = "Deny"
        Action = [
          "s3:PutObject", "s3:DeleteObject", "s3:DeleteObjectVersion",
          "s3:PutObjectAcl", "s3:PutBucketPolicy", "s3:PutBucketVersioning",
        ]
        Resource = [aws_s3_bucket.tfstate.arn, "${aws_s3_bucket.tfstate.arn}/*"]
      },
    ]
  })
}

output "plan_role_arn" {
  description = "Repository secret AWS_PLAN_ROLE (workflow `Terraform drift`)."
  value       = aws_iam_role.plan.arn
}

output "inventory_role_arn" {
  description = "Repository secret AWS_INVENTORY_ROLE (workflow `AWS inventory`)."
  value       = aws_iam_role.inventory.arn
}
output "cleanup_role_arn" {
  description = "Repository secret AWS_CLEANUP_ROLE (workflow `AWS cleanup`, environment aws-cleanup)."
  value       = aws_iam_role.cleanup.arn
}
