# One environment (docs/06 §6.2: staging / prod are separate AWS accounts,
# same stack, different sizes). Composes the modules; the env folders only
# carry the backend, providers and tfvars.
terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.60"
      configuration_aliases = [aws.replica]
    }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

variable "env" { type = string }
variable "azs" { type = list(string) }
variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}
variable "nat_per_az" {
  type    = bool
  default = true
}
variable "interface_endpoints" {
  type    = list(string)
  default = ["ecr.api", "ecr.dkr", "logs", "secretsmanager", "kms"]
}
variable "admin_allowed_cidrs" {
  type        = list(string)
  default     = []
  description = "When set, admin.<domain> answers only these CIDRs (WAF); empty = open, 2FA only."
}
variable "domain" { type = string }
variable "api_host" { type = string }
variable "admin_host" { type = string }
variable "app_link_base_url" { type = string }
variable "certificate_arn" { type = string }
variable "hosted_zone_id" {
  type    = string
  default = null
}
variable "dmarc_rua" { type = string }
variable "ses_from_address" { type = string }
variable "api_image" { type = string }
variable "admin_image" { type = string }
variable "alert_emails" { type = list(string) }
variable "slack_webhook_url" {
  type      = string
  default   = null
  sensitive = true
}
variable "stripe_price_id" { type = string }
variable "fcm_project_id" {
  type    = string
  default = ""
}
variable "fcm_client_email" {
  type    = string
  default = ""
}
variable "google_client_ids" {
  type    = string
  default = ""
}
variable "apple_bundle_ids" {
  type    = string
  default = ""
}
variable "apple_team_id" {
  type    = string
  default = ""
}
variable "redis_node_type" {
  type    = string
  default = "cache.t4g.medium"
}
variable "redis_replicas" {
  type    = number
  default = 1
}
variable "api_max_tasks" {
  type    = number
  default = 20
}
variable "worker_max_tasks" {
  type    = number
  default = 10
}
variable "waf_rate_limit_per_5m" {
  type    = number
  default = 3000
}
variable "p95_target_ms" {
  type    = number
  default = 600
}

locals {
  name = "lawbid-${var.env}"
  tags = { Project = "lawbid", Env = var.env, ManagedBy = "terraform" }

  # docs/06 §4.3: everything sensitive is a Secrets Manager secret; values
  # are set by the owner after the first apply (infra/README.md).
  secret_names = [
    "DATABASE_URL",           # lawbid_app role (CockroachDB Cloud)
    "RETENTION_DATABASE_URL", # lawbid_retention role
    "JWT_KEYS",
    "OTP_CODE_SECRET",
    "OTP_KEY_PEPPER",
    "AUTH_EVENT_PEPPER",
    "ADMIN_TOTP_ENC_KEY",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_MESSAGING_SERVICE_SID",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "FCM_PRIVATE_KEY",
    "SENTRY_DSN",
    "PERSONA_API_KEY",
    "BAR_LOOKUP_API_KEY",
    "MUX_TOKEN_ID",
    "MUX_TOKEN_SECRET",
  ]
}

data "aws_region" "current" {}

module "kms" {
  source = "../kms"
  name   = local.name
  tags   = local.tags
}

module "kms_replica" {
  source    = "../kms"
  providers = { aws = aws.replica }
  name      = "${local.name}-replica"
  tags      = local.tags
}

module "network" {
  source              = "../network"
  name                = local.name
  cidr                = var.vpc_cidr
  azs                 = var.azs
  nat_per_az          = var.nat_per_az
  interface_endpoints = var.interface_endpoints
  tags                = local.tags
}

module "s3" {
  source              = "../s3"
  providers           = { aws = aws, aws.replica = aws.replica }
  name                = local.name
  kms_key_arn         = module.kms.key_arn
  replica_kms_key_arn = module.kms_replica.key_arn
  tags                = local.tags
}

module "ses" {
  source         = "../ses"
  domain         = var.domain
  hosted_zone_id = var.hosted_zone_id
  dmarc_rua      = var.dmarc_rua
  tags           = local.tags
}

module "alb" {
  source                = "../alb"
  name                  = local.name
  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  certificate_arn       = var.certificate_arn
  api_host              = var.api_host
  admin_host            = var.admin_host
  waf_rate_limit_per_5m = var.waf_rate_limit_per_5m
  admin_allowed_cidrs   = var.admin_allowed_cidrs
  tags                  = local.tags
}

resource "aws_security_group" "tasks" {
  name        = "${local.name}-tasks"
  description = "ECS tasks: ALB in, everything out"
  vpc_id      = module.network.vpc_id
  ingress {
    from_port       = 3000
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [module.alb.security_group_id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = local.tags
}

module "redis" {
  source                     = "../redis"
  name                       = local.name
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.private_subnet_ids
  allowed_security_group_ids = [aws_security_group.tasks.id]
  node_type                  = var.redis_node_type
  replicas                   = var.redis_replicas
  kms_key_arn                = module.kms.key_arn
  tags                       = local.tags
}

module "secrets" {
  source      = "../secrets"
  name        = local.name
  kms_key_arn = module.kms.key_arn
  names       = concat(local.secret_names, ["MIGRATOR_DATABASE_URL"])
  tags        = local.tags
}

locals {
  api_env = {
    NODE_ENV            = "production"
    TRUST_PROXY_HOPS    = "1"
    APP_LINK_BASE_URL   = var.app_link_base_url
    ADMIN_ORIGINS       = "https://${var.admin_host}"
    ADMIN_PANEL_URL     = "https://${var.admin_host}"
    S3_REGION           = data.aws_region.current.name
    S3_BUCKET_DOCUMENTS = module.s3.documents_bucket
    S3_BUCKET_MEDIA     = module.s3.media_bucket
    MEDIA_CDN_BASE_URL  = "https://${module.s3.media_cdn_domain}"
    SES_REGION          = data.aws_region.current.name
    SES_FROM_ADDRESS    = var.ses_from_address
    EMAIL_PROVIDER      = "ses"
    SMS_PROVIDER        = "twilio"
    STRIPE_PRICE_ID     = var.stripe_price_id
    FCM_PROJECT_ID      = var.fcm_project_id
    FCM_CLIENT_EMAIL    = var.fcm_client_email
    GOOGLE_CLIENT_IDS   = var.google_client_ids
    APPLE_BUNDLE_IDS    = var.apple_bundle_ids
    APPLE_TEAM_ID       = var.apple_team_id
  }
  app_secret_arns = merge(
    { for k in local.secret_names : k => module.secrets.arns[k] },
    { REDIS_URL = module.redis.redis_url_secret_arn },
  )
}

module "ecs" {
  source                  = "../ecs"
  name                    = local.name
  vpc_id                  = module.network.vpc_id
  private_subnet_ids      = module.network.private_subnet_ids
  tasks_security_group_id = aws_security_group.tasks.id
  api_target_group_arn    = module.alb.api_target_group_arn
  admin_target_group_arn  = module.alb.admin_target_group_arn
  api_image               = var.api_image
  admin_image             = var.admin_image
  kms_key_arn             = module.kms.key_arn
  api_env                 = local.api_env
  admin_env = {
    NODE_ENV      = "production"
    API_BASE_URL  = "https://${var.api_host}/api/v1"
    COOKIE_SECURE = "true"
  }
  secret_arns                      = local.app_secret_arns
  migrator_database_url_secret_arn = module.secrets.arns["MIGRATOR_DATABASE_URL"]
  alb_resource_label               = "${module.alb.arn_suffix}/${module.alb.api_target_group_arn_suffix}"
  api_max_tasks                    = var.api_max_tasks
  worker_max_tasks                 = var.worker_max_tasks
  tags                             = local.tags
}

# Task role: the app's own permissions (buckets, SES, KMS for SSE-KMS).
data "aws_iam_policy_document" "task" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload"]
    resources = ["${module.s3.documents_bucket_arn}/*", "${module.s3.media_bucket_arn}/*"]
  }
  statement {
    actions   = ["s3:ListBucket"]
    resources = [module.s3.documents_bucket_arn, module.s3.media_bucket_arn]
  }
  statement {
    actions   = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey"]
    resources = [module.kms.key_arn]
  }
  statement {
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = [var.ses_from_address]
    }
  }
}

resource "aws_iam_role_policy" "task" {
  role   = module.ecs.task_role_name
  policy = data.aws_iam_policy_document.task.json
}

module "monitoring" {
  source                      = "../monitoring"
  name                        = local.name
  alert_emails                = var.alert_emails
  slack_webhook_url           = var.slack_webhook_url
  alb_arn_suffix              = module.alb.arn_suffix
  api_target_group_arn_suffix = module.alb.api_target_group_arn_suffix
  cluster_name                = module.ecs.cluster_name
  api_service_name            = module.ecs.api_service_name
  worker_service_name         = module.ecs.worker_service_name
  redis_replication_group_id  = "${local.name}-redis"
  api_log_group               = module.ecs.log_group_names["api"]
  worker_log_group            = module.ecs.log_group_names["worker"]
  p95_target_ms               = var.p95_target_ms
  kms_key_arn                 = module.kms.key_arn
  tags                        = local.tags
}

resource "aws_route53_record" "hosts" {
  for_each = var.hosted_zone_id == null ? {} : { api = var.api_host, admin = var.admin_host }
  zone_id  = var.hosted_zone_id
  name     = each.value
  type     = "A"
  alias {
    name                   = module.alb.dns_name
    zone_id                = module.alb.zone_id
    evaluate_target_health = true
  }
}

output "alb_dns_name" { value = module.alb.dns_name }
output "cluster_name" { value = module.ecs.cluster_name }
output "migrate_task_definition_arn" { value = module.ecs.migrate_task_definition_arn }
output "media_cdn_domain" { value = module.s3.media_cdn_domain }
output "secrets_to_fill" { value = sort(keys(module.secrets.arns)) }
output "ses_dns" {
  value = {
    verification_token = module.ses.verification_token
    dkim_tokens        = module.ses.dkim_tokens
  }
}
output "alerts_topic_arn" { value = module.monitoring.alerts_topic_arn }
