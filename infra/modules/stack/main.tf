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
variable "s3_cors_allowed_origins" {
  type        = list(string)
  default     = ["https://syimykkalykov1999.github.io"]
  description = "Web origins allowed to upload to / read from the S3 buckets directly (presigned POST / signed GET)."
}
variable "create_database" {
  type        = bool
  default     = false
  description = "Create the RDS PostgreSQL with daily backups (modules/postgres). Off: the launch database is any managed PostgreSQL (infra/README.md)."
}
variable "database_instance_class" {
  type    = string
  default = "db.t4g.medium"
}
variable "database_backup_retention_days" {
  type    = number
  default = 14
}
variable "database_multi_az" {
  type        = bool
  default     = false
  description = "RDS Multi-AZ (standby in the second AZ, automatic failover). ≈ ×2 the instance price. Prod: true."
}
variable "existing_database_identifier" {
  type        = string
  default     = ""
  description = "RDS identifier of a database created outside Terraform (prod: lawbid-prod-postgres). Used for the AWS Backup plan and the plan-time settings check; never modified."
}
variable "backup_enabled" {
  type        = bool
  default     = false
  description = "AWS Backup plan for the database: daily copy in this region + the replica region (modules/backup). Prod: true."
}
variable "backup_retention_days" {
  type    = number
  default = 35
}
variable "backup_copy_account_id" {
  type        = string
  default     = ""
  description = "Optional separate backup AWS account (same Organization). Empty = no cross-account copy. Its vault must exist first (docs/runbooks/backups.md)."
}
variable "backup_copy_vault_name" {
  type    = string
  default = "lawbid-backup-copy"
}
variable "backup_copy_region" {
  type        = string
  default     = ""
  description = "Region of the backup account's vault; empty = the main region."
}
variable "interface_endpoint_azs" {
  type        = number
  default     = 0
  description = "0 = interface endpoints in every AZ; 1 = first AZ only (launch size, half the price)."
}
variable "redis_cache_node" {
  type        = bool
  default     = false
  description = "Second Redis only for caches (allkeys-lru), so the queue / socket Redis (noeviction) never fills with cache keys. Its URL is injected as REDIS_CACHE_URL; the app uses it once it reads that variable (docs/runbooks/redis.md)."
}
variable "redis_cache_node_type" {
  type    = string
  default = "cache.t4g.micro"
}
variable "worker_jobs_per_task" {
  type        = number
  default     = 50
  description = "Worker autoscaling on queue depth: waiting jobs per worker task. 0 = CPU only."
}
variable "turn_enabled" {
  type        = bool
  default     = false
  description = "coturn relay for calls on a small EC2 (modules/turn, ≈ $7–8/month); docs/runbooks/TURN.md."
}
variable "domain" { type = string }
variable "api_host" { type = string }
variable "admin_host" { type = string }
variable "app_link_base_url" { type = string }
variable "certificate_arn" { type = string }
variable "web_host" {
  type        = string
  default     = ""
  description = "Host of the web app (e.g. app.<domain>); empty = only the CloudFront address."
}
variable "web_cross_origin_isolation" {
  type        = bool
  default     = false
  description = "COOP/COEP headers on the web app (the engine renders on a worker thread)."
}
variable "web_certificate_arn" {
  type        = string
  default     = ""
  description = "ACM certificate for web_host in us-east-1 (CloudFront only reads that region)."
}
variable "web_create_certificate" {
  type        = bool
  default     = false
  description = "Terraform requests the web certificate itself (DNS validation, records added by hand)."
}
variable "web_extra_hosts" {
  type    = list(string)
  default = []
}
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
variable "stripe_price_id" {
  type        = string
  default     = ""
  description = "Fallback only: subscription prices are set in the admin (Деньги → Цены)."
}
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
variable "min_tasks" {
  type        = number
  default     = 2
  description = "Minimum api and worker tasks (autoscaling floor). 1 = launch size, 2+ = survives a lost AZ."
}
variable "cpu_architecture" {
  type        = string
  default     = "X86_64"
  description = "ARM64 (Graviton) is about 20 % cheaper; needs linux/arm64 images."
}
variable "worker_spot" {
  type        = bool
  default     = false
  description = "Worker on Fargate Spot (one task stays on regular Fargate)."
}
variable "api_spot" {
  type        = bool
  default     = false
  description = "Extra API tasks (above the first) on Fargate Spot, up to 70 % cheaper."
}
variable "night_scale_down" {
  type        = bool
  default     = false
  description = "Lower the minimum task count at night (07:00-12:00 UTC)."
}
variable "night_min_tasks" {
  type    = number
  default = 1
}
variable "admin_tasks" {
  type    = number
  default = 2
}
variable "api_cpu" {
  type    = number
  default = 1024
}
variable "api_memory" {
  type    = number
  default = 2048
}
variable "worker_cpu" {
  type    = number
  default = 512
}
variable "worker_memory" {
  type    = number
  default = 1024
}
variable "waf_rate_limit_per_5m" {
  type    = number
  default = 3000
}
variable "p95_target_ms" {
  type    = number
  default = 600
}
# Owner 2026-10-22 (audit #4 §7): the external uptime canary (~$10/month at
# one run every 5 minutes) and the "signups stopped" alarm (0 = off).
variable "uptime_canary_enabled" {
  type    = bool
  default = true
}
variable "min_daily_signups" {
  type    = number
  default = 0
}
variable "monthly_budget_usd" {
  type        = number
  default     = 200
  description = "Monthly AWS spend (USD): e-mails at 50/80/100 %, autoscaling capped at the minimum at 100 %."
}
variable "create_anomaly_monitor" {
  type    = bool
  default = true
}
variable "clamav_image" {
  type        = string
  default     = "clamav/clamav:1.4"
  description = "Antivirus sidecar image; prod uses the ECR copy (scripts/deploy/prod-images.sh)."
}
variable "extra_secrets" {
  type        = list(string)
  default     = []
  description = "Optional env-var secrets (e.g. SENTRY_DSN, TWILIO_AUTH_TOKEN) — add a name only after its value is set, or ECS cannot start the tasks."
}
variable "runbook_base_url" {
  type        = string
  default     = "https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks"
  description = "Alert e-mails link the matching runbook here."
}

locals {
  name = "lawbid-${var.env}"
  tags = { Project = "lawbid", Env = var.env, ManagedBy = "terraform" }

  # docs/06 §4.3: everything sensitive is a Secrets Manager secret; values
  # are set by the owner after the first apply (infra/README.md).
  # Only the secrets the app cannot start without. ECS refuses to start a
  # task whose secret has no value, so a secret nobody fills (Sentry, Mux…)
  # must not be referenced. Third-party keys (Twilio, Stripe, FCM, Bunny…)
  # live in the admin key store (Безопасность → Ключи и сервисы, encrypted
  # with SECRETS_MASTER_KEYS); `extra_secrets` adds env-var fallbacks.
  secret_names = concat([
    "DATABASE_URL",           # lawbid_app role (managed PostgreSQL)
    "RETENTION_DATABASE_URL", # lawbid_retention role
    "DEMO_DATABASE_URL",      # bloggers' demo world: own database, DDL role (docs/ops/demo-world.md)
    "JWT_KEYS",               # "j1:<secret>" (JWT_ACTIVE_KID below)
    "OTP_CODE_SECRET",
    "OTP_KEY_PEPPER",
    "AUTH_EVENT_PEPPER",
    "ADMIN_TOTP_ENC_KEY",
    "SECRETS_MASTER_KEYS", # admin key store ("k1:<secret>")
    "MESSAGE_ENC_KEYS",    # chat texts at rest ("m1:<secret>"), scaling TZ point 11
  ], var.extra_secrets)
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

module "kms" {
  source = "../kms"
  name   = local.name
  tags   = local.tags

  backup_copy_account_ids = var.backup_copy_account_id == "" ? [] : [var.backup_copy_account_id]
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

  interface_endpoint_azs = var.interface_endpoint_azs
}

module "turn" {
  count     = var.turn_enabled ? 1 : 0
  source    = "../turn"
  name      = local.name
  vpc_id    = module.network.vpc_id
  subnet_id = module.network.public_subnet_ids[0]
  realm     = var.domain
  tags      = local.tags
}

module "s3" {
  source              = "../s3"
  providers           = { aws = aws, aws.replica = aws.replica }
  name                = local.name
  kms_key_arn         = module.kms.key_arn
  replica_kms_key_arn = module.kms_replica.key_arn
  tags                = local.tags

  cors_allowed_origins = var.s3_cors_allowed_origins
}

# Owner 2026-10-15: the web version of the app (S3 + CloudFront).
module "web" {
  source                 = "../web"
  name                   = local.name
  web_host               = var.web_host
  certificate_arn        = var.web_certificate_arn
  create_certificate     = var.web_create_certificate
  extra_hosts            = var.web_extra_hosts
  cross_origin_isolation = var.web_cross_origin_isolation
  hosted_zone_id         = var.hosted_zone_id == null ? "" : var.hosted_zone_id
  api_origin             = "https://${var.api_host}"
  media_origins          = ["https://${module.s3.media_cdn_domain}"]
  tags                   = local.tags
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

module "postgres" {
  count                      = var.create_database ? 1 : 0
  source                     = "../postgres"
  name                       = local.name
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.private_subnet_ids
  allowed_security_group_ids = [aws_security_group.tasks.id]
  kms_key_arn                = module.kms.key_arn
  instance_class             = var.database_instance_class
  backup_retention_days      = var.database_backup_retention_days
  multi_az                   = var.database_multi_az
  tags                       = local.tags
}

# Second Redis for caches only (owner 2026-10-22: planned, off by default).
module "redis_cache" {
  count                      = var.redis_cache_node ? 1 : 0
  source                     = "../redis"
  name                       = "${local.name}-cache"
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.private_subnet_ids
  allowed_security_group_ids = [aws_security_group.tasks.id]
  node_type                  = var.redis_cache_node_type
  replicas                   = 0
  maxmemory_policy           = "allkeys-lru"
  description                = "cache only (allkeys-lru)"
  kms_key_arn                = module.kms.key_arn
  tags                       = local.tags
}

# --- database backups (owner 2026-10-22) ----------------------------------
# The prod database is created outside Terraform (create_database = false).
# Terraform never changes it; it only backs it up (AWS Backup works on any
# RDS instance of the account) and checks its settings at plan time.
locals {
  database_arn = var.create_database ? module.postgres[0].arn : (
    var.existing_database_identifier == "" ? "" :
    "arn:aws:rds:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:db:${var.existing_database_identifier}"
  )
}

# Read-only: the existing instance's settings (plan fails if the named
# instance does not exist — a typo in existing_database_identifier).
data "aws_db_instance" "existing" {
  count                  = !var.create_database && var.existing_database_identifier != "" ? 1 : 0
  db_instance_identifier = var.existing_database_identifier
}

# A failed assertion is a warning in `terraform plan`, never an error.
check "existing_database_settings" {
  assert {
    condition     = alltrue([for d in data.aws_db_instance.existing : d.multi_az || !var.database_multi_az])
    error_message = "Production database is not Multi-AZ. RDS console → Modify → Multi-AZ DB instance (docs/runbooks/backups.md, «Консоль RDS»)."
  }
  assert {
    condition     = alltrue([for d in data.aws_db_instance.existing : d.backup_retention_period >= var.database_backup_retention_days])
    error_message = "Production database keeps automated backups for fewer days than database_backup_retention_days (14). RDS console → Modify → Backup retention period."
  }
  assert {
    condition     = alltrue([for d in data.aws_db_instance.existing : d.storage_encrypted])
    error_message = "Production database storage is not encrypted."
  }
}

module "backup" {
  count               = var.backup_enabled && local.database_arn != "" ? 1 : 0
  source              = "../backup"
  providers           = { aws = aws, aws.replica = aws.replica }
  name                = local.name
  resource_arns       = [local.database_arn]
  kms_key_arn         = module.kms.key_arn
  replica_kms_key_arn = module.kms_replica.key_arn
  retention_days      = var.backup_retention_days
  copy_retention_days = var.backup_retention_days
  copy_account_vault_arn = var.backup_copy_account_id == "" ? "" : (
    "arn:aws:backup:${var.backup_copy_region == "" ? data.aws_region.current.name : var.backup_copy_region}:${var.backup_copy_account_id}:backup-vault:${var.backup_copy_vault_name}"
  )
  alerts_topic_arn = module.monitoring.alerts_topic_arn
  tags             = local.tags
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
    # Key ids inside the two key secrets above (rotation: add k2/m2 to
    # the secret, then switch these).
    JWT_ACTIVE_KID         = "j1"
    SECRETS_ACTIVE_KID     = "k1"
    MESSAGE_ENC_ACTIVE_KID = "m1"
    # Zero maintenance (owner 2026-10-05): admin «Здоровье системы» buttons
    # and the worker's ops guard (src/common/ops/aws-ops.service.ts).
    OPS_ECS_CLUSTER      = local.name
    OPS_API_SERVICE      = "api"
    OPS_WORKER_SERVICE   = "worker"
    OPS_MIN_TASKS        = tostring(var.min_tasks)
    OPS_API_MAX_TASKS    = tostring(var.api_max_tasks)
    OPS_WORKER_MAX_TASKS = tostring(var.worker_max_tasks)
    # Economy guard (owner 2026-10-16): monthly cost of one task (Fargate
    # list price, us-east-1; ARM64 ≈ 20 % cheaper) and the names of the
    # database and Redis the admin may raise one tier.
    OPS_API_TASK_USD    = tostring(local.api_task_usd)
    OPS_WORKER_TASK_USD = tostring(local.worker_task_usd)
    OPS_DB_INSTANCE     = var.create_database ? "${local.name}-postgres" : ""
    OPS_REDIS_GROUP     = "${local.name}-redis"
    OPS_BUDGET_NAME     = "${local.name}-monthly"
    OPS_AWS_ACCOUNT_ID  = data.aws_caller_identity.current.account_id
    AWS_REGION          = data.aws_region.current.name
  }
  arm_factor      = var.cpu_architecture == "ARM64" ? 0.8 : 1
  api_task_usd    = floor(730 * (var.api_cpu / 1024 * 0.04048 + var.api_memory / 1024 * 0.004445) * local.arm_factor * 100) / 100
  worker_task_usd = floor(730 * (var.worker_cpu / 1024 * 0.04048 + var.worker_memory / 1024 * 0.004445) * local.arm_factor * 100) / 100
  app_secret_arns = merge(
    { for k in local.secret_names : k => module.secrets.arns[k] },
    { REDIS_URL = module.redis.redis_url_secret_arn },
    var.redis_cache_node ? { REDIS_CACHE_URL = module.redis_cache[0].redis_url_secret_arn } : {},
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
    # Audit #8: the admin CSP connect-src (apps/admin/src/lib/csp.ts) — the
    # buckets presigned uploads POST to (both endpoint spellings the AWS SDK
    # may produce) and the media CDN.
    ADMIN_CONNECT_SRC = join(" ", [
      "https://${module.s3.media_bucket}.s3.${data.aws_region.current.name}.amazonaws.com",
      "https://${module.s3.media_bucket}.s3.amazonaws.com",
      "https://${module.s3.documents_bucket}.s3.${data.aws_region.current.name}.amazonaws.com",
      "https://${module.s3.documents_bucket}.s3.amazonaws.com",
      "https://${module.s3.media_cdn_domain}",
    ])
  }
  secret_arns                      = local.app_secret_arns
  migrator_database_url_secret_arn = module.secrets.arns["MIGRATOR_DATABASE_URL"]
  alb_resource_label               = "${module.alb.arn_suffix}/${module.alb.api_target_group_arn_suffix}"
  api_max_tasks                    = var.api_max_tasks
  worker_max_tasks                 = var.worker_max_tasks
  min_tasks                        = var.min_tasks
  admin_tasks                      = var.admin_tasks
  api_cpu                          = var.api_cpu
  api_memory                       = var.api_memory
  worker_cpu                       = var.worker_cpu
  worker_memory                    = var.worker_memory
  clamav_image                     = var.clamav_image
  cpu_architecture                 = var.cpu_architecture
  worker_spot                      = var.worker_spot
  api_spot                         = var.api_spot
  night_scale_down                 = var.night_scale_down
  night_min_tasks                  = var.night_min_tasks
  tags                             = local.tags

  # Same namespace as modules/monitoring (QueueWaitingTotal).
  metrics_namespace    = "LawBid/${local.name}"
  worker_jobs_per_task = var.worker_jobs_per_task
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
  # Zero maintenance: restart the worker, cap / restore autoscaling, read
  # this month's spend. Only these two services and this one budget.
  statement {
    actions   = ["ecs:UpdateService", "ecs:DescribeServices"]
    resources = [module.ecs.api_service_arn, module.ecs.worker_service_arn]
  }
  statement {
    actions = [
      "application-autoscaling:RegisterScalableTarget",
      "application-autoscaling:DescribeScalableTargets",
    ]
    resources = ["*"]
  }
  statement {
    actions   = ["budgets:ViewBudget"]
    resources = [module.budget.budget_arn]
  }
  # Economy guard (owner 2026-10-16): read database / Redis load and move
  # them one tier up from the admin. Metrics have no resource-level scope.
  statement {
    actions   = ["cloudwatch:GetMetricStatistics"]
    resources = ["*"]
  }
  statement {
    actions   = ["rds:DescribeDBInstances", "rds:ModifyDBInstance"]
    resources = ["arn:aws:rds:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:db:${local.name}-postgres"]
  }
  statement {
    actions   = ["elasticache:DescribeReplicationGroups", "elasticache:ModifyReplicationGroup"]
    resources = ["arn:aws:elasticache:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:replicationgroup:${local.name}-redis"]
  }
}

resource "aws_iam_role_policy" "task" {
  role   = module.ecs.task_role_name
  policy = data.aws_iam_policy_document.task.json
}

module "budget" {
  source                 = "../budget"
  name                   = local.name
  monthly_budget_usd     = var.monthly_budget_usd
  alert_emails           = var.alert_emails
  create_anomaly_monitor = var.create_anomaly_monitor
  tags                   = local.tags
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
  runbook_base_url            = var.runbook_base_url
  kms_key_arn                 = module.kms.key_arn
  # Owner 2026-10-22 (audit #4 §7): external uptime canary + SLO alarms.
  canary_url        = var.uptime_canary_enabled ? "https://${var.api_host}/health/ready" : null
  min_daily_signups = var.min_daily_signups
  tags              = local.tags
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

output "turn_url" { value = one(module.turn[*].turn_url) }
output "turn_public_ip" { value = one(module.turn[*].public_ip) }
output "turn_secret_parameter" { value = one(module.turn[*].secret_parameter) }
output "alb_dns_name" { value = module.alb.dns_name }
output "cluster_name" { value = module.ecs.cluster_name }
output "migrate_task_definition_arn" { value = module.ecs.migrate_task_definition_arn }
output "media_cdn_domain" { value = module.s3.media_cdn_domain }
output "web_bucket" { value = module.web.web_bucket }
output "web_certificate_validation" { value = module.web.web_certificate_validation }
output "web_distribution_id" { value = module.web.web_distribution_id }
output "web_cdn_domain" { value = module.web.web_cdn_domain }
output "web_deploy_policy_arn" { value = module.web.web_deploy_policy_arn }
output "secrets_to_fill" { value = sort(keys(module.secrets.arns)) }
output "ses_dns" {
  value = {
    verification_token = module.ses.verification_token
    dkim_tokens        = module.ses.dkim_tokens
  }
}
output "database_endpoint" { value = one(module.postgres[*].endpoint) }
output "database_instance_id" { value = one(module.postgres[*].instance_id) }
output "backup_vault" { value = one(module.backup[*].vault_name) }
output "backup_dr_vault_arn" { value = one(module.backup[*].dr_vault_arn) }
output "alerts_topic_arn" { value = module.monitoring.alerts_topic_arn }
output "budget_name" { value = module.budget.budget_name }
