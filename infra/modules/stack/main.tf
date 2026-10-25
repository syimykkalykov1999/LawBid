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
variable "ephemeral" {
  type        = bool
  default     = false
  description = "Throw-away stack for load tests (envs/loadtest): everything can be destroyed (database without deletion protection and final snapshot, buckets with objects, secrets and keys deleted fast) and the account-wide singletons (SES identity, CloudTrail/GuardDuty/Access Analyzer baseline, budget) are NOT created. Prod/staging: false."
}
variable "project_tag" {
}
variable "extra_tags" {
}
variable "azs" { type = list(string) }
variable "vpc_cidr" {
}
variable "nat_per_az" {
}
variable "interface_endpoints" {
}
variable "admin_allowed_cidrs" {
}
variable "s3_cors_allowed_origins" {
}
variable "create_database" {
}
variable "database_instance_class" {
}
variable "database_backup_retention_days" {
}
variable "database_multi_az" {
}
variable "existing_database_identifier" {
}
variable "backup_enabled" {
}
variable "backup_retention_days" {
}
variable "backup_copy_account_id" {
}
variable "backup_copy_vault_name" {
}
variable "backup_copy_region" {
}
variable "interface_endpoint_azs" {
}
variable "redis_cache_node" {
}
variable "redis_cache_node_type" {
}
variable "worker_jobs_per_task" {
}
variable "turn_enabled" {
}
variable "turn_second_enabled" {
}
variable "turn_traffic_alarm_gb_per_day" {
}
variable "turn_instance_type" {
}
variable "turn_total_quota" {
}
variable "livekit_enabled" {
}
variable "livekit_instance_type" {
}
variable "livekit_use_redis" {
}
variable "livekit_egress_alarm_gb_per_day" {
}
variable "domain" { type = string }
variable "api_host" { type = string }
variable "admin_host" { type = string }
variable "app_link_base_url" { type = string }
variable "certificate_arn" { type = string }
variable "web_host" {
}
variable "web_cross_origin_isolation" {
}
variable "web_certificate_arn" {
}
variable "web_create_certificate" {
}
variable "web_extra_hosts" {
}
variable "hosted_zone_id" {
}
variable "dmarc_rua" { type = string }
variable "dmarc_policy" {
}
# Security research #5 (2026-10-22), A6 / A8.
variable "security_hub_enabled" {
}
variable "guardduty_alert_severity" {
}
# Security & legal pass 2026-10-24 (docs/runbooks/SECURITY_LEGAL.md): every
# switch with its monthly cost. Free ones default on, paid ones off.
variable "securityhub_fsbp_enabled" {
}
variable "inspector_enabled" {
}
variable "unused_access_analyzer_enabled" {
}
variable "s3_account_block_public_access" {
}
variable "critical_api_alerts_enabled" {
}
variable "documents_data_events" {
}
variable "audit_logs_enabled" {
}
variable "audit_logs_retention_days" {
}
variable "audit_logs_object_lock" {
}
variable "vpc_flow_logs_traffic" {
}
variable "macie_enabled" {
}
variable "macie_sampling_percentage" {
}
variable "backup_vault_lock_mode" {
}
variable "backup_vault_lock_cooling_off_days" {
}
variable "ecs_readonly_root_filesystem" {
}
variable "deploy_alarm_rollback" {
}
variable "deploy_rollback_on_slo" {
}
variable "ses_from_address" { type = string }
variable "api_image" { type = string }
variable "admin_image" { type = string }
variable "alert_emails" { type = list(string) }
variable "slack_webhook_url" {
  sensitive = true
}
variable "stripe_price_id" {
}
variable "fcm_project_id" {
}
variable "fcm_client_email" {
}
variable "google_client_ids" {
}
variable "apple_bundle_ids" {
}
variable "apple_team_id" {
}
variable "redis_node_type" {
}
variable "redis_replicas" {
}
variable "redis_cluster_mode" {
    Redis cluster mode (sharded), docs/runbooks/redis-cluster.md. One line to switch:
      off      today: one standalone group.
      standby  a second group (cluster mode enabled) is BUILT and idle; the app still uses the standalone one. Cost: the new nodes.
      on       the app uses the cluster: REDIS_URL = cluster configuration endpoint, REDIS_CLUSTER=true (same line, one deploy).
    Cutover steps and rollback (back to "standby"/"off" while the old group lives) are in the runbook.
  EOT
  validation {
    condition     = contains(["off", "standby", "on"], var.redis_cluster_mode)
    error_message = "redis_cluster_mode: off, standby or on."
  }
}
variable "redis_cluster_shards" {
}
variable "redis_cluster_replicas_per_shard" {
}
variable "redis_cluster_node_type" {
}
variable "api_max_tasks" {
}
variable "worker_max_tasks" {
}
variable "min_tasks" {
}
variable "api_min_tasks" {
}
variable "cpu_architecture" {
}
variable "container_insights" {
}
variable "worker_spot" {
}
variable "api_spot" {
}
variable "night_scale_down" {
}
variable "night_min_tasks" {
}
variable "admin_tasks" {
}
variable "api_cpu" {
}
variable "api_memory" {
}
variable "worker_cpu" {
}
variable "worker_memory" {
}
# Scale audit 2026-10-23: one mobile-carrier (CGNAT) or office address carries
# thousands of people; 3000 / 5 min (10 per second) cut real users off the
# moment a city came online. Signed-in users are limited per account by the
# API itself (100 / min), so this edge rule only has to stop floods.
variable "waf_rate_limit_per_5m" {
}
# Security research #5 (2026-10-22), A3: the sign-in code / password reset
# paths get their own, much lower per-IP limit at the WAF (the API's own
# OTP limits stay; this stops a flood before it reaches the API at all).
variable "waf_otp_rate_limit_per_5m" {
}
variable "waf_device_header" {
}
variable "waf_auth_rules_enabled" {
}
variable "waf_auth_rate_action" {
}
variable "alb_deletion_protection" {
}
variable "alb_least_outstanding_requests" {
}
variable "alb_websocket_target_group" {
}
# AWS Bot Control (paid: ~$10/month + $1 per million requests). Off by
# default; on, it only COUNTS (labels in the WAF metrics) until
# `waf_bot_control_block` is switched on after reading them for a while.
variable "waf_bot_control_enabled" {
}
variable "waf_bot_control_block" {
}
variable "cdn_waf_rate_limit_per_5m" {
}
variable "p95_target_ms" {
}
# Owner 2026-10-22 (audit #4 §7): the external uptime canary (~$10/month at
# one run every 5 minutes) and the "signups stopped" alarm (0 = off).
variable "uptime_canary_enabled" {
}
variable "min_daily_signups" {
}
variable "monthly_budget_usd" {
}
variable "uptime_check" {
}
# --- Batch A (docs/architecture/P0_AND_COST_PLAN.md): paging, budgets, NAT, backup alarm ---
variable "pagerduty_https_endpoint" {
}
variable "critical_email_too" {
}
variable "redis_memory_alarm_percent" {
}
variable "nat_traffic_alarm_gb_per_day" {
}
variable "budget_forecast_thresholds" {
}
variable "budget_to_alerts_topic" {
}
variable "anomaly_existing_monitor_arn" {
}
variable "anomaly_extra_emails" {
}
variable "anomaly_threshold_usd" {
}
variable "backup_age_missing_data" {
}
variable "guardduty_ebs_malware" {
}
variable "guardduty_runtime_monitoring" {
}
variable "create_anomaly_monitor" {
}
variable "clamav_image" {
}
variable "documents_cdn_public_key_pem" {
}
variable "extra_secrets" {
}
variable "runbook_base_url" {
}

# Owner 2026-10-24: the media CDN answered the web app's image fetches
# without Access-Control-Allow-Origin because the origin list held only the
# old github.io address (s3_cors_allowed_origins) and never the real web
# hosts. The list is now built from the hosts this stack serves (web, its
# extra hosts, admin) plus whatever s3_cors_allowed_origins adds (previews,
# http://localhost:<port> for development).
locals {
  # redis_cluster_mode = "on": the app talks to the cluster-mode-enabled group.
  redis_cluster_on = var.redis_cluster_mode == "on"
  web_cors_origins = distinct(concat(
    var.s3_cors_allowed_origins,
    [for h in concat([var.web_host, var.admin_host], var.web_extra_hosts) : "https://${h}" if h != ""],
  ))
}

locals {
  name = "lawbid-${var.env}"
  tags = merge({ Project = var.project_tag, Env = var.env, ManagedBy = "terraform" }, var.extra_tags)

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

  allow_macie = var.macie_enabled

  backup_copy_account_ids = var.backup_copy_account_id == "" ? [] : [var.backup_copy_account_id]
  deletion_window_in_days = var.ephemeral ? 7 : 30
}

module "kms_replica" {
  providers = { aws = aws.replica }

}

# Owner 2026-10-22: a separate key for wrapping application data keys
# (MESSAGE_ENC_KEYS, SECRETS_MASTER_KEYS). The task role may only Decrypt
# with it; the owner (account admin) encrypts new data keys with
# `aws kms encrypt --encryption-context app=<name>`.
resource "aws_kms_key" "data_keys" {
  enable_key_rotation     = true
}

resource "aws_kms_alias" "data_keys" {
  target_key_id = aws_kms_key.data_keys.key_id
}

module "network" {
  cidr                = var.vpc_cidr
  azs                 = var.azs
  nat_per_az          = var.nat_per_az
  interface_endpoints = var.interface_endpoints

  interface_endpoint_azs = var.interface_endpoint_azs
}

module "turn" {
  count     = var.turn_enabled ? 1 : 0
  vpc_id    = module.network.vpc_id
  subnet_id = module.network.public_subnet_ids[0]
  realm     = var.domain

  # Second relay in the next Availability Zone, health checks, alarms.
  secondary_subnet_id      = var.turn_second_enabled ? module.network.public_subnet_ids[1] : null
  alerts_topic_arn         = module.monitoring.alerts_topic_arn
  alarms_enabled           = true
  traffic_alarm_gb_per_day = var.turn_traffic_alarm_gb_per_day
  instance_type            = var.turn_instance_type
  turn_total_quota         = var.turn_total_quota
  hosted_zone_id           = var.hosted_zone_id
  # Route 53 health-check metrics exist in us-east-1 only.
  health_checks = data.aws_region.current.name == "us-east-1"
}

# Owner 2026-10-22: self-hosted LiveKit SFU (off until livekit_enabled).
module "livekit" {
  domain                  = var.domain
  use_redis               = var.livekit_use_redis
  redis_endpoint          = module.redis.primary_endpoint
  redis_url_secret_arn    = module.redis.redis_url_secret_arn
  redis_security_group_id = module.redis.security_group_id
  kms_key_arn             = module.kms.key_arn
  egress_alarm_gb_per_day = var.livekit_egress_alarm_gb_per_day

  recovery_window_in_days = var.ephemeral ? 0 : 30
}

module "s3" {
  replica_kms_key_arn = module.kms_replica.key_arn

  cors_allowed_origins         = local.web_cors_origins
  media_web_acl_arn            = module.cdn_waf.web_acl_arn
  documents_cdn_public_key_pem = var.documents_cdn_public_key_pem
  force_destroy                = var.ephemeral
  access_log_bucket            = try(module.audit_logs[0].bucket, "")
  replicate_media              = var.replicate_media && !var.ephemeral
}

variable "replicate_media" {
}

# Security & legal pass 2026-10-24: the access logs that prove who touched
# what, in a bucket nobody can delete from.
module "audit_logs" {
  enabled             = true
  retention_days      = var.audit_logs_retention_days
  object_lock_enabled = var.audit_logs_object_lock
  flow_logs_traffic   = var.vpc_flow_logs_traffic
}

# Sensitive-data discovery on the documents bucket (default off).
module "macie" {
  bucket_names        = [module.s3.documents_bucket]
  sampling_percentage = var.macie_sampling_percentage
}

# Security research #5 (2026-10-22), A3: one WAF for both CloudFront
# distributions (the web app below and the media CDN in module "s3").
module "cdn_waf" {
  rate_limit_per_5m = var.cdn_waf_rate_limit_per_5m
}

# Owner 2026-10-15: the web version of the app (S3 + CloudFront).
module "web" {
  web_acl_arn            = module.cdn_waf.web_acl_arn
  web_host               = var.web_host
  certificate_arn        = var.web_certificate_arn
  create_certificate     = var.web_create_certificate
  extra_hosts            = var.web_extra_hosts
  cross_origin_isolation = var.web_cross_origin_isolation
  api_origin             = "https://${var.api_host}"
  media_origins          = ["https://${module.s3.media_cdn_domain}"]
}

module "ses" {
  dmarc_rua      = var.dmarc_rua
  dmarc_policy   = var.dmarc_policy
}

module "alb" {
  public_subnet_ids     = module.network.public_subnet_ids
  api_host              = var.api_host
  admin_host            = var.admin_host
  waf_rate_limit_per_5m = var.waf_rate_limit_per_5m
  admin_allowed_cidrs   = var.admin_allowed_cidrs

  waf_otp_rate_limit_per_5m = var.waf_otp_rate_limit_per_5m
  waf_device_header         = var.waf_device_header
  waf_auth_rate_action      = var.waf_auth_rate_action
  waf_auth_rules_enabled    = var.waf_auth_rules_enabled
  deletion_protection       = var.alb_deletion_protection && !var.ephemeral
  load_balancing_algorithm  = var.alb_least_outstanding_requests ? "least_outstanding_requests" : "round_robin"
  ws_target_group_enabled   = var.alb_websocket_target_group
  waf_bot_control_enabled   = var.waf_bot_control_enabled
  waf_bot_control_block     = var.waf_bot_control_block

  # The load-balancer log goes to the locked audit bucket (prefix `alb`).
  access_logs_bucket = one(module.audit_logs[*].bucket)
}

resource "aws_security_group" "tasks" {
  ingress {
    from_port       = 3000
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [module.alb.security_group_id]
  }
  egress {
    cidr_blocks = ["0.0.0.0/0"]
  }
}

module "redis" {
  subnet_ids                 = module.network.private_subnet_ids
  allowed_security_group_ids = [aws_security_group.tasks.id]
  node_type                  = var.redis_node_type
  replicas                   = var.redis_replicas

  cluster_mode            = var.redis_cluster_mode != "off"
  num_node_groups         = var.redis_cluster_shards
  replicas_per_node_group = var.redis_cluster_replicas_per_shard
  cluster_node_type       = var.redis_cluster_node_type

}

module "postgres" {
  instance_class             = var.database_instance_class
  backup_retention_days      = var.database_backup_retention_days
  multi_az                   = var.database_multi_az

  skip_final_snapshot     = var.ephemeral
}

# Second Redis for caches only (owner 2026-10-22: planned, off by default).
module "redis_cache" {
  maxmemory_policy           = "allkeys-lru"

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
  db_instance_identifier = var.existing_database_identifier
}

# A failed assertion is a warning in `terraform plan`, never an error.
check "existing_database_settings" {
  assert {
  }
  assert {
  }
  assert {
  }
}

# --- adopt the prod database into Terraform (audit S4-3, 2026-10-25) -------
# The instance was created in the console. With adopt_existing_database =
# true (and the import block in envs/prod/imports.tf) it becomes a Terraform
# resource, so the daily drift check sees Multi-AZ off, short backup
# retention, deletion protection off, Performance Insights off. Everything
# the platform changes at run time or that would force a REPLACEMENT is in
# ignore_changes: class (db-autoscale / admin), storage (RDS autoscaling),
# engine version, credentials, network, KMS key, parameter group, windows.
# prevent_destroy: a plan that would delete the database fails instead.
# First plan: review it; only the declared attributes below may show a diff.
variable "adopt_existing_database" {
}
variable "database_deletion_protection" {
}

resource "aws_db_instance" "existing" {
  identifier = var.existing_database_identifier

  # Required by the provider; the real values are kept (ignore_changes).
  engine         = "postgres"

  # Declared, drift-checked attributes.
  backup_retention_period               = var.database_backup_retention_days
  storage_encrypted                     = true
  publicly_accessible                   = false
  copy_tags_to_snapshot                 = true
  auto_minor_version_upgrade            = true
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  final_snapshot_identifier             = "${local.name}-postgres-final"

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      instance_class, allocated_storage, max_allocated_storage, storage_type, iops, storage_throughput,
      engine, engine_version, db_name, username, password, manage_master_user_password, kms_key_id,
      performance_insights_kms_key_id, db_subnet_group_name, vpc_security_group_ids, parameter_group_name,
      option_group_name, backup_window, maintenance_window, enabled_cloudwatch_logs_exports,
      delete_automated_backups, apply_immediately, tags, tags_all, snapshot_identifier,
      replicate_source_db, character_set_name, license_model, ca_cert_identifier, network_type,
      monitoring_interval, monitoring_role_arn, iam_database_authentication_enabled, port, availability_zone,
    ]
  }
}

# --- RDS cross-Region automated backups (audit S4-6) -------------------------
# Snapshots + transaction logs shipped to the replica Region: point-in-time
# restore there, RPO of minutes instead of 24 h. Costs the stored backup size
# (about the size of the database) in us-west-2. Works on any instance, so it
# does not need S4-3. Off by default.
variable "rds_cross_region_backups" {
}
variable "rds_cross_region_backup_retention_days" {
}

resource "aws_db_instance_automated_backups_replication" "this" {
  provider               = aws.replica
  source_db_instance_arn = local.database_arn
  kms_key_id             = module.kms_replica.key_arn
  retention_period       = var.rds_cross_region_backup_retention_days
}

module "backup" {
  resource_arns       = [local.database_arn]
  copy_retention_days = var.backup_retention_days
  copy_account_vault_arn = var.backup_copy_account_id == "" ? "" : (
    "arn:aws:backup:${var.backup_copy_region == "" ? data.aws_region.current.name : var.backup_copy_region}:${var.backup_copy_account_id}:backup-vault:${var.backup_copy_vault_name}"
  )
  backup_age_missing_data = var.backup_age_missing_data

  vault_lock_mode             = var.backup_vault_lock_mode
  vault_lock_cooling_off_days = var.backup_vault_lock_cooling_off_days
}

module "secrets" {
  names       = concat(local.secret_names, ["MIGRATOR_DATABASE_URL"])

}

# --- database autoscale (owner 2026-10-24, docs/architecture/DB_AUTOSCALE.md) --
variable "db_autoscale_enabled" {
}
variable "db_autoscale_min_class" {
}
variable "db_autoscale_max_class" {
}
variable "db_autoscale_mode" {
}
variable "db_autoscale_ladder" {
    "db.t4g.micro", "db.t4g.small", "db.t4g.medium", "db.t4g.large",
    "db.r7g.large", "db.r7g.xlarge", "db.r7g.2xlarge",
  ]
}
variable "db_autoscale_tuning" {
}

# --- Redis autoscale (owner 2026-10-24, docs/architecture/REDIS_AUTOSCALE.md) --
variable "redis_autoscale_enabled" {
}
variable "redis_autoscale_min_class" {
}
variable "redis_autoscale_max_class" {
}
variable "redis_autoscale_mode" {
}
variable "redis_autoscale_tuning" {
}

locals {
  db_identifier = var.create_database ? "${local.name}-postgres" : var.existing_database_identifier
}

# --- database connection budget (scale audit 2026-10-23) ---------------------
# Every API / worker task keeps DB_POOL_SIZE connections (Prisma). Before
# this, the pool was a fixed 10: at 20 API + 10 worker tasks that is 300
# connections, 600 during a rolling deploy (ECS runs up to 200 % of the
# tasks) - more than a db.t4g.medium accepts (about 400). The pool is now
# worked out from the database size and the task ceilings.
variable "database_max_connections" {
}

# --- own connection pooler (docs/architecture/DB_POOLER.md) -------------------------
variable "db_pooler_enabled" {
}
variable "pgbouncer_image" {
}
variable "pgbouncer_min_tasks" {
}
variable "pgbouncer_max_tasks" {
}
variable "pgbouncer_cpu" {
}
variable "pgbouncer_memory" {
}
variable "pgbouncer_reserve_pool_size" {
}
variable "db_pooler_max_client_conn" {
}
variable "pgbouncer_query_wait_timeout" {
}

locals {
  db_memory_gib = {
    "db.t4g.micro" = 1, "db.t4g.small" = 2, "db.t4g.medium" = 4,
    "db.t4g.large" = 8, "db.t4g.xlarge" = 16, "db.t4g.2xlarge" = 32,
    "db.t3.medium" = 4, "db.t3.large" = 8,
    "db.m6g.large" = 8, "db.m6g.xlarge" = 16, "db.m6g.2xlarge" = 32,
    "db.m7g.large" = 8, "db.m7g.xlarge" = 16, "db.m7g.2xlarge" = 32,
    "db.r6g.large" = 16, "db.r6g.xlarge" = 32, "db.r6g.2xlarge" = 64,
    "db.r7g.large" = 16, "db.r7g.xlarge" = 32, "db.r7g.2xlarge" = 64,
  }
  # Owner 2026-10-24: with db_autoscale_enabled the database changes size by
  # itself. The pool must be safe at the SMALLEST size it can shrink to
  # (db_autoscale_min_class); the check below asks only that the LARGEST size
  # (db_autoscale_max_class) can carry the task ceiling at all.
  db_autoscale_on    = var.db_autoscale_enabled && local.db_identifier != ""
  db_pool_class      = local.db_autoscale_on ? var.db_autoscale_min_class : var.database_instance_class
  db_ceiling_class   = local.db_autoscale_on ? var.db_autoscale_max_class : var.database_instance_class
  db_pool_memory_gib = lookup(local.db_memory_gib, local.db_pool_class, 4)
  db_ceil_memory_gib = lookup(local.db_memory_gib, local.db_ceiling_class, 4)
  # RDS: LEAST(DBInstanceClassMemory / 9531392, 5000); the usable memory is
  # about 88 % of the instance memory.
  db_max_connections     = var.database_max_connections > 0 ? var.database_max_connections : min(5000, floor(local.db_pool_memory_gib * 1073741824 * 0.88 / 9531392))
  db_ceiling_connections = var.database_max_connections > 0 ? var.database_max_connections : min(5000, floor(local.db_ceil_memory_gib * 1073741824 * 0.88 / 9531392))
  # Rolling deploy: up to twice the tasks run together.
  db_peak_tasks = 2 * (var.api_max_tasks + var.worker_max_tasks)
  # 80 % of max_connections shared by the peak tasks; 3..10 per task.
  direct_pool_size = max(3, min(10, floor(0.8 * local.db_max_connections / local.db_peak_tasks)))

  # --- own PgBouncer (db_pooler_enabled; docs/architecture/DB_POOLER.md) -------
  # App tasks then connect to the pooler, which keeps a FIXED number of
  # database connections: pgbouncer_max_tasks x (pool + reserve). 70 % of
  # max_connections is given to it; the other 30 % stay for the direct users
  # (migrate task, retention / demo roles, the admin, monitoring, superuser
  # reserve). The app-side Prisma pool is then cheap (it only holds
  # connections to the pooler), so it is 10 per task.
  db_pooler_budget         = floor(0.7 * local.db_max_connections)
  pgb_server_per_task      = min(200, floor(local.db_pooler_budget / var.pgbouncer_max_tasks))
  pgb_reserve              = var.pgbouncer_reserve_pool_size
  pgb_pool_size            = local.pgb_server_per_task - local.pgb_reserve
  pgb_server_connections   = var.pgbouncer_max_tasks * (local.pgb_pool_size + local.pgb_reserve)
  db_pool_size             = var.db_pooler_enabled ? 10 : local.direct_pool_size
  pgb_max_clients_possible = local.db_peak_tasks * 10 # every app task fully busy, a deploy at the same time
}

check "db_connection_budget" {
  assert {
      var.pgbouncer_image != "" &&
      local.pgb_pool_size >= 5 &&
      local.pgb_server_connections <= local.db_pooler_budget &&
      local.pgb_max_clients_possible <= var.db_pooler_max_client_conn
      ) : (
      local.direct_pool_size * local.db_peak_tasks <= local.db_ceiling_connections
    )
  }
}

locals {
  api_env = {
    NODE_ENV            = "production"
    DB_POOL_SIZE        = tostring(local.db_pool_size)
    TRUST_PROXY_HOPS    = "1"
    APP_LINK_BASE_URL   = var.app_link_base_url
    ADMIN_ORIGINS       = "https://${var.admin_host}"
    ADMIN_PANEL_URL     = "https://${var.admin_host}"
    S3_REGION           = data.aws_region.current.name
    S3_BUCKET_DOCUMENTS = module.s3.documents_bucket
    S3_BUCKET_MEDIA     = module.s3.media_bucket
    MEDIA_CDN_BASE_URL  = local.media_cdn_base_url # growth.cdn_images_provider (modules/stack/growth.tf)
    # Owner 2026-10-22: private media through CloudFront signed URLs (empty
    # until the owner supplies documents_cdn_public_key_pem; the private key
    # is the CLOUDFRONT_PRIVATE_KEY_PEM secret in extra_secrets).
    CLOUDFRONT_PRIVATE_DOMAIN = module.s3.documents_cdn_domain == null ? "" : module.s3.documents_cdn_domain
    CLOUDFRONT_PRIVATE_KEY_ID = module.s3.documents_cdn_key_pair_id == null ? "" : module.s3.documents_cdn_key_pair_id
    # KMS key that wraps the data keys inside MESSAGE_ENC_KEYS /
    # SECRETS_MASTER_KEYS ("<kid>:kms:<base64 ciphertext>", decrypted once
    # at boot — src/common/secrets/kms-env.ts). Owner steps: DEPLOY_PROD.md.
    DATA_KEYS_KMS_KEY_ARN = aws_kms_key.data_keys.arn
    DATA_KEYS_KMS_APP     = local.name
    SES_REGION            = data.aws_region.current.name
    SES_FROM_ADDRESS      = var.ses_from_address
    EMAIL_PROVIDER        = "ses"
    SMS_PROVIDER          = "twilio"
    STRIPE_PRICE_ID       = var.stripe_price_id
    FCM_PROJECT_ID        = var.fcm_project_id
    FCM_CLIENT_EMAIL      = var.fcm_client_email
    GOOGLE_CLIENT_IDS     = var.google_client_ids
    APPLE_BUNDLE_IDS      = var.apple_bundle_ids
    APPLE_TEAM_ID         = var.apple_team_id
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
    OPS_DB_INSTANCE     = local.db_identifier # the admin «Экономика» shows the current class (also after the autoscaler moved it)
    OPS_REDIS_GROUP     = local.redis_cluster_on ? module.redis.cluster_replication_group_id : "${local.name}-redis"
    # Batch D (2026-10-24): the admin «Масштаб» page says whether the size
    # changes by itself (the Lambda's own on / dry-run / off switch is in SSM).
    OPS_DB_AUTOSCALE    = local.db_autoscale_on ? "on" : "off"
    OPS_REDIS_AUTOSCALE = var.redis_autoscale_enabled && var.redis_replicas > 0 && !local.redis_cluster_on ? "on" : "off"
    # Cluster mode switch (var.redis_cluster_mode = "on"): the app builds ioredis Cluster clients.
    REDIS_CLUSTER      = local.redis_cluster_on ? "true" : "false"
    OPS_POOLER_MIN     = tostring(var.pgbouncer_min_tasks)
    OPS_POOLER_MAX     = tostring(var.pgbouncer_max_tasks)
    OPS_BUDGET_NAME    = "${local.name}-monthly"
    OPS_AWS_ACCOUNT_ID = data.aws_caller_identity.current.account_id
    # Owner 2026-10-24 (admin «Запуск», «Масштаб», «Расходы»): the critical
    # SNS topic the admin subscribes PagerDuty to (built from the name so the
    # app env does not depend on the monitoring module), the obsolete budget
    # the admin may delete, the cost tags that must be active, ARM / Spot.
    OPS_CRITICAL_TOPIC_ARN   = local.critical_topic_arn
    OPS_OBSOLETE_BUDGET_NAME = "LawBid Monthly"
    OPS_COST_TAG_KEYS        = join(",", sort(keys(local.tags)))
    OPS_API_SPOT             = var.api_spot ? "on" : "off"
    OPS_WORKER_SPOT          = var.worker_spot ? "on" : "off"
    AWS_REGION               = data.aws_region.current.name
    # S4-1: set only after ops_role_split (the app then assumes this role for
    # every admin AWS call; the ExternalId arrives as a secret).
    OPS_ROLE_ARN = var.ops_role_split ? aws_iam_role.ops[0].arn : ""
    # Search engine (growth.opensearch_enabled, modules/stack/growth.tf):
    # empty while off. The app uses it only when the admin sets
    # «search.engine» to shadow / engine (docs/architecture/SEARCH_READY.md).
    OPENSEARCH_URL      = var.growth.opensearch_enabled ? "https://${module.growth.opensearch_endpoint}" : ""
    OPENSEARCH_REPLICAS = tostring(module.growth.opensearch_replicas)
  }
  critical_topic_arn = "arn:aws:sns:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:${local.name}-critical"
  arm_factor         = var.cpu_architecture == "ARM64" ? 0.8 : 1
  api_task_usd       = floor(730 * (var.api_cpu / 1024 * 0.04048 + var.api_memory / 1024 * 0.004445) * local.arm_factor * 100) / 100
  worker_task_usd    = floor(730 * (var.worker_cpu / 1024 * 0.04048 + var.worker_memory / 1024 * 0.004445) * local.arm_factor * 100) / 100
  app_secret_arns = merge(
    { for k in local.secret_names : k => module.secrets.arns[k] },
    { REDIS_URL = local.redis_cluster_on ? module.redis.cluster_url_secret_arn : module.redis.redis_url_secret_arn },
    var.redis_cache_node ? { REDIS_CACHE_URL = module.redis_cache[0].redis_url_secret_arn } : {},
    # LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET (values generated by modules/livekit).
    var.livekit_enabled ? module.livekit[0].secret_arns : {},
    var.ops_role_split ? { OPS_ROLE_EXTERNAL_ID = aws_secretsmanager_secret.ops_external_id[0].arn } : {},
  )
}

# --- own connection pooler: PgBouncer service, Cloud Map name, alarms ----------------
module "pgbouncer" {

  private_subnet_ids         = module.network.private_subnet_ids
  cluster_arn                = module.ecs.cluster_arn
  cluster_name               = module.ecs.cluster_name
  client_security_group_id   = aws_security_group.tasks.id
  database_security_group_id = var.create_database ? module.postgres[0].security_group_id : ""
  database_url_secret_arn    = module.secrets.arns["DATABASE_URL"]
  image                      = var.pgbouncer_image
  cpu_architecture           = var.cpu_architecture
  cpu                        = var.pgbouncer_cpu
  memory                     = var.pgbouncer_memory
  min_tasks                  = var.pgbouncer_min_tasks
  max_tasks                  = var.pgbouncer_max_tasks
  pool_size                  = local.pgb_pool_size
  reserve_pool_size          = local.pgb_reserve
  max_client_conn            = var.db_pooler_max_client_conn
  query_wait_timeout         = var.pgbouncer_query_wait_timeout
  metrics_namespace          = "LawBid/${local.name}/PgBouncer"
  alarm_actions              = [module.monitoring.alerts_topic_arn]
  runbook_url                = "${var.runbook_base_url}/db-pooler.md"
}

# What the api / worker get when the pooler is on (src/prisma/pooler-url.ts
# swaps host and port of DATABASE_URL; the secret itself is untouched).
locals {
  # Read replica (growth.rds_read_replicas > 0): the tasks get only the HOST;
  # the app builds DATABASE_REPLICA_URL from DATABASE_URL (same role, password
  # and database) with this host (src/prisma/replica-url.ts), so no secret has
  # to be filled by hand. Empty map while the switch is off = env unchanged.
  db_replica_env = merge(
    var.growth.rds_read_replicas > 0 ? {
      DB_REPLICA_HOST = module.growth.replica_host
    } : {},
    # Admin button «Копия базы для чтения» (owner 2026-10-24): the API creates
    # and deletes ONE replica itself through the RDS API. Only these names are
    # added, and only when db_replica_toggle is true.
    var.db_replica_toggle ? merge(
      { OPS_DB_REPLICA_TOGGLE = "on" },
      var.db_replica_monitoring ? { OPS_DB_REPLICA_MONITORING_ROLE_ARN = aws_iam_role.db_replica_monitoring[0].arn } : {},
    ) : {},
  )
  db_pooler_env = var.db_pooler_enabled ? {
    DB_POOLER_HOST = module.pgbouncer[0].endpoint
    DB_POOLER_PORT = tostring(module.pgbouncer[0].port)
  } : {}
}

module "ecs" {
  readonly_root_filesystem = var.ecs_readonly_root_filesystem
  tasks_security_group_id  = aws_security_group.tasks.id
  api_target_group_arn     = module.alb.api_target_group_arn
  api_ws_target_group_arn  = module.alb.api_ws_target_group_arn
  admin_target_group_arn   = module.alb.admin_target_group_arn
  api_image                = var.api_image
  admin_image              = var.admin_image
  admin_env = {
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
  api_min_tasks                    = var.api_min_tasks
  admin_tasks                      = var.admin_tasks
  api_cpu                          = var.api_cpu
  api_memory                       = var.api_memory
  worker_cpu                       = var.worker_cpu
  worker_memory                    = var.worker_memory
  clamav_image                     = var.clamav_image
  container_insights               = var.container_insights
  worker_spot                      = var.worker_spot
  api_spot                         = var.api_spot
  night_scale_down                 = var.night_scale_down
  night_min_tasks                  = var.night_min_tasks

  # P1 deploy safety: rolling + alarm rollback (docs/runbooks/DEPLOY_SAFETY.md).
  deployment_alarm_rollback     = var.deploy_alarm_rollback
  api_deployment_alarm_names    = module.monitoring.api_deployment_alarm_names
  worker_deployment_alarm_names = module.monitoring.worker_deployment_alarm_names
  admin_deployment_alarm_names  = module.monitoring.admin_deployment_alarm_names

  # Same namespace as modules/monitoring (QueueWaitingTotal).
  worker_jobs_per_task = var.worker_jobs_per_task
}

# Task role: the app's own permissions (buckets, SES, KMS for SSE-KMS).
data "aws_iam_policy_document" "task" {
  # S4-1 (audit 2026-10-25): the admin scale / launch / cost calls live in
  # data.aws_iam_policy_document.ops. With ops_role_split = false (default)
  # they are merged back into this role, exactly as before; with true the
  # request-serving role keeps only buckets, KMS and SES, plus the right to
  # assume the separate ops role (below).
  source_policy_documents = var.ops_role_split ? [] : [data.aws_iam_policy_document.ops.json]
  dynamic "statement" {
    for_each = var.ops_role_split ? [1] : []
    content {
      actions   = ["sts:AssumeRole"]
      resources = [aws_iam_role.ops[0].arn]
    }
  }
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload"]
    resources = ["${module.s3.documents_bucket_arn}/*", "${module.s3.media_bucket_arn}/*"]
  }
  statement {
  }
  statement {
  }
  # Owner 2026-10-22 (SECURITY_TODO «KMS-wrapped keys»): the task may only
  # unwrap the message / key-store data keys, nothing else on this key.
  statement {
    condition {
      test     = "StringEquals"
      variable = "kms:EncryptionContext:app"
      values   = [local.name]
    }
  }
  statement {
    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = [var.ses_from_address]
    }
  }
}

# S4-1: the infrastructure-changing calls of the admin «Масштаб / Запуск /
# Расходы» screens. rds:ModifyDBInstance alone can reset the master password
# and set backup retention to 0, so this must not sit on the role of the
# process that serves the internet.
data "aws_iam_policy_document" "ops" {
  # Zero maintenance: restart the worker, cap / restore autoscaling, read
  # this month's spend. Only these two services and this one budget.
  statement {
  }
  statement {
      "application-autoscaling:RegisterScalableTarget",
      "application-autoscaling:DescribeScalableTargets",
    ]
  }
  dynamic "statement" {
    content {
      actions   = ["budgets:ViewBudget"]
      resources = [statement.value]
    }
  }
  # Owner 2026-10-24 (admin «Запуск»): subscribe the PagerDuty link the owner
  # pastes in the admin to the CRITICAL topic, drop the old one, publish a
  # test alarm. Only this topic (Unsubscribe is checked against the
  # subscription ARN, which starts with the topic ARN).
  statement {
  }
  statement {
  }
  # Owner 2026-10-24 (admin «Масштаб»): list the account's budgets (read),
  # change the limit of the production budget and delete the obsolete
  # «LawBid Monthly» one - by name, nothing else. If AWS refuses
  # DeleteBudget with only ModifyBudget, the separate DeleteBudget action
  # below (obsolete budget only) covers it.
  statement {
  }
  statement {
      "arn:aws:budgets::${data.aws_caller_identity.current.account_id}:budget/${local.name}-monthly",
      "arn:aws:budgets::${data.aws_caller_identity.current.account_id}:budget/LawBid Monthly",
    ]
  }
  statement {
  }
  # Owner 2026-10-24 (admin «Запуск» and «Расходы»): read-only cost data.
  # Cost Explorer has no resource-level scope; each request costs $0.01, so
  # the app asks at most every 6 hours (common/ops/spend/spend.service.ts).
  statement {
  }
  # Economy guard (owner 2026-10-16): read database / Redis load and move
  # them one tier up from the admin. Metrics have no resource-level scope.
  statement {
  }
  statement {
  }
  # Admin button «Копия базы для чтения»: create / describe / delete exactly one
  # instance named <database>-readreplica. Nothing else on RDS changes.
  dynamic "statement" {
    content {
      actions = ["rds:DescribeDBInstances"]
      resources = [
        "arn:aws:rds:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:db:${local.db_identifier}",
        "arn:aws:rds:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:db:${local.db_identifier}-readreplica",
      ]
    }
  }
  dynamic "statement" {
    content {
      actions = ["rds:CreateDBInstanceReadReplica", "rds:AddTagsToResource"]
      resources = [
        "arn:aws:rds:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:db:${local.db_identifier}",
        "arn:aws:rds:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:db:${local.db_identifier}-readreplica",
        "arn:aws:rds:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:pg:*",
        "arn:aws:rds:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:og:*",
        "arn:aws:rds:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:subgrp:*",
        "arn:aws:rds:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secgrp:*",
      ]
    }
  }
  dynamic "statement" {
    content {
      actions   = ["rds:DeleteDBInstance"]
      resources = ["arn:aws:rds:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:db:${local.db_identifier}-readreplica"]
    }
  }
  dynamic "statement" {
    content {
      actions   = ["iam:PassRole"]
      resources = [aws_iam_role.db_replica_monitoring[0].arn]
      condition {
        test     = "StringEquals"
        variable = "iam:PassedToService"
        values   = ["monitoring.rds.amazonaws.com"]
      }
    }
  }
  # The replica uses the primary's KMS key (storage and Performance Insights).
  dynamic "statement" {
    content {
      actions   = ["kms:DescribeKey", "kms:CreateGrant", "kms:Decrypt", "kms:GenerateDataKeyWithoutPlaintext", "kms:ReEncrypt*"]
      resources = [module.kms.key_arn]
    }
  }
  statement {
  }
}

# --- admin button: read copy of the database (owner 2026-10-24) -------------------
variable "db_replica_toggle" {
}
variable "db_replica_monitoring" {
}

resource "aws_iam_role" "db_replica_monitoring" {
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "db_replica_monitoring" {
  role       = aws_iam_role.db_replica_monitoring[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
variable "ops_role_split" {
variable "ops_role_external_id" {
  validation {
data "aws_iam_policy_document" "ops_trust" {
  statement {
    principals {
      type        = "AWS"
      identifiers = [module.ecs.task_role_arn]
    condition {
      test     = "StringEquals"
      variable = "sts:ExternalId"
      values   = [var.ops_role_external_id]
resource "aws_iam_role" "ops" {
  max_session_duration = 3600
  lifecycle {
    precondition {
      condition     = var.ops_role_external_id != ""
      error_message = "ops_role_split = true needs ops_role_external_id (32+ random characters)."
resource "aws_iam_role_policy" "ops" {
  policy = data.aws_iam_policy_document.ops.json
resource "aws_secretsmanager_secret" "ops_external_id" {
resource "aws_secretsmanager_secret_version" "ops_external_id" {
  secret_id     = aws_secretsmanager_secret.ops_external_id[0].id
  secret_string = var.ops_role_external_id
}

resource "aws_iam_role_policy" "task" {
}

module "budget" {
  monthly_budget_usd     = var.monthly_budget_usd
  alert_emails           = var.alert_emails
  create_anomaly_monitor = var.create_anomaly_monitor

  forecast_thresholds          = var.budget_forecast_thresholds
  subscriber_sns_topic_arns    = var.budget_to_alerts_topic ? [module.monitoring.alerts_topic_arn] : []
  anomaly_threshold_usd        = var.anomaly_threshold_usd
  anomaly_existing_monitor_arn = var.anomaly_existing_monitor_arn
  anomaly_extra_emails         = var.anomaly_extra_emails
  anomaly_sns_topic_arn        = var.anomaly_to_alerts_topic ? module.monitoring.alerts_topic_arn : ""
}

module "monitoring" {
  slack_webhook_url             = var.slack_webhook_url
  pagerduty_https_endpoint      = var.pagerduty_https_endpoint
  critical_email_too            = var.critical_email_too
  redis_memory_alarm_percent    = var.redis_memory_alarm_percent
  nat_gateway_ids               = module.network.nat_gateway_ids
  nat_traffic_alarm_gb_per_day  = var.nat_traffic_alarm_gb_per_day
  alb_arn_suffix                = module.alb.arn_suffix
  api_target_group_arn_suffix   = module.alb.api_target_group_arn_suffix
  admin_target_group_arn_suffix = module.alb.admin_target_group_arn_suffix
  deploy_rollback_on_slo        = var.deploy_rollback_on_slo
  api_service_name              = module.ecs.api_service_name
  worker_service_name           = module.ecs.worker_service_name
  redis_replication_group_id    = "${local.name}-redis"
  redis_replicas                = var.redis_replicas
  db_instance_id                = var.create_database ? "${local.name}-postgres" : ""
  acm_certificate_arns          = [var.certificate_arn]
  api_log_group                 = module.ecs.log_group_names["api"]
  worker_log_group              = module.ecs.log_group_names["worker"]
  p95_target_ms                 = var.p95_target_ms
  runbook_base_url              = var.runbook_base_url
  # Owner 2026-10-22 (audit #4 §7): external uptime canary + SLO alarms.
  canary_url        = var.uptime_canary_enabled ? "https://${var.api_host}/health/ready" : null
  uptime_check      = var.uptime_check
  min_daily_signups = var.min_daily_signups
}

# Owner 2026-10-24: database size follows the load (up fast, down at night).
module "db_autoscale" {
  service_names    = [module.ecs.api_service_name, module.ecs.worker_service_name]
  ladder           = var.db_autoscale_ladder
  min_class        = var.db_autoscale_min_class
  max_class        = var.db_autoscale_max_class
  mode             = var.db_autoscale_mode
  tuning           = var.db_autoscale_tuning
}

# Owner 2026-10-24: Redis size follows the load too (modules/redis ignores
# node_type changes, so terraform apply never undoes it).
module "redis_autoscale" {
  # Not for a cluster-mode group (the Lambda would skip it anyway: cluster_mode).
  replication_group_id = "${local.name}-redis"
  min_node_type        = var.redis_autoscale_min_class
  max_node_type        = var.redis_autoscale_max_class
  depends_on           = [module.redis]
}

check "redis_autoscale_needs_replica" {
  assert {
  }
}

# A read replica must keep max_connections >= its primary's, so the primary
# cannot grow alone; the autoscaler pauses (and e-mails) while replicas exist.
check "db_autoscale_vs_replicas" {
  assert {
  }
}

# Security research #5 (2026-10-22), A6: CloudTrail, GuardDuty, Access
# Analyzer, password policy; findings go to the alerts topic.
module "security_baseline" {
  alert_severity       = var.guardduty_alert_severity
  security_hub_enabled = var.security_hub_enabled

  securityhub_fsbp_enabled       = var.securityhub_fsbp_enabled
  inspector_enabled              = var.inspector_enabled
  unused_access_analyzer_enabled = var.unused_access_analyzer_enabled
  s3_account_block_public_access = var.s3_account_block_public_access
  critical_api_alerts_enabled    = var.critical_api_alerts_enabled
  documents_data_events          = var.documents_data_events
  documents_bucket_arn           = module.s3.documents_bucket_arn

  guardduty_ebs_malware        = var.guardduty_ebs_malware
  guardduty_runtime_monitoring = var.guardduty_runtime_monitoring
}

# AWS guardrails pass 2026-10-25 (docs/runbooks/aws-guardrails.md).
# AWS Config: recorder + 11 AWS-managed rules. ~$1-4/month, default off.
module "aws_config" {
}

# Emergency administrator role (MFA, named principals, pages on use). Free.
module "break_glass" {
  trusted_principal_arns = var.break_glass_principal_arns
}

# Athena over the CloudTrail bucket with saved investigation queries. ~$0 idle.
module "cloudtrail_athena" {
  trail_bucket = module.security_baseline[0].cloudtrail_bucket
  regions      = distinct([data.aws_region.current.name, "us-east-1"])
}

variable "config_enabled" {
}
variable "config_retention_days" {
}
variable "break_glass_enabled" {
}
variable "break_glass_principal_arns" {
}
variable "cloudtrail_athena_enabled" {
}
variable "anomaly_to_alerts_topic" {
}

resource "aws_route53_record" "hosts" {
  for_each = var.hosted_zone_id == null ? {} : { api = var.api_host, admin = var.admin_host }
  zone_id  = var.hosted_zone_id
  alias {
    name                   = module.alb.dns_name
    zone_id                = module.alb.zone_id
    evaluate_target_health = true
  }
}

output "turn_url" { value = one(module.turn[*].turn_url) }
output "turn_public_ip" { value = one(module.turn[*].public_ip) }
output "turn_public_ips" { value = one(module.turn[*].public_ips) }
output "livekit_public_ip" { value = one(module.livekit[*].public_ip) }
output "livekit_dns_names" { value = one(module.livekit[*].dns_names) }
output "turn_secret_parameter" { value = one(module.turn[*].secret_parameter) }
output "alb_dns_name" { value = module.alb.dns_name }
output "cluster_name" { value = module.ecs.cluster_name }
output "migrate_task_definition_arn" { value = module.ecs.migrate_task_definition_arn }
output "media_cdn_domain" { value = module.s3.media_cdn_domain }
output "documents_cdn_domain" { value = module.s3.documents_cdn_domain }
output "documents_cdn_key_pair_id" { value = module.s3.documents_cdn_key_pair_id }
output "data_keys_kms_key_arn" { value = aws_kms_key.data_keys.arn }
output "data_keys_kms_alias" { value = aws_kms_alias.data_keys.name }
output "web_bucket" { value = module.web.web_bucket }
output "web_certificate_validation" { value = module.web.web_certificate_validation }
output "web_distribution_id" { value = module.web.web_distribution_id }
output "web_cdn_domain" { value = module.web.web_cdn_domain }
output "web_deploy_policy_arn" { value = module.web.web_deploy_policy_arn }
output "secrets_to_fill" { value = sort(keys(module.secrets.arns)) }
output "ses_dns" {
  value = {
    verification_token = one(module.ses[*].verification_token)
    dkim_tokens        = one(module.ses[*].dkim_tokens)
  }
}
output "database_endpoint" { value = one(module.postgres[*].endpoint) }
output "database_instance_id" { value = one(module.postgres[*].instance_id) }
output "backup_vault" { value = one(module.backup[*].vault_name) }
output "backup_dr_vault_arn" { value = one(module.backup[*].dr_vault_arn) }
output "alerts_topic_arn" { value = module.monitoring.alerts_topic_arn }
output "critical_topic_arn" { value = module.monitoring.critical_topic_arn }
output "db_autoscale_function" { value = one(module.db_autoscale[*].function_name) }
output "redis_autoscale_function" { value = one(module.redis_autoscale[*].function_name) }
output "budget_name" { value = one(module.budget[*].budget_name) }
output "rds_endpoint_secret_arn" { value = one(module.postgres[*].master_secret_arn) }
output "secret_arns" { value = local.app_secret_arns }
output "task_security_group_id" { value = aws_security_group.tasks.id }
output "private_subnet_ids" { value = module.network.private_subnet_ids }
output "documents_bucket" { value = module.s3.documents_bucket }
output "media_bucket" { value = module.s3.media_bucket }
output "name" { value = local.name }

# Load-test stacks skip three account-wide modules (var.ephemeral), so they
# got a `count`. These keep the existing prod / staging state in place:
# without them terraform would plan to destroy and recreate SES, the budget
# and the security baseline.
moved {
  from = module.ses
  to   = module.ses[0]
}
moved {
}
moved {
}

# --- values the load-test environment (envs/loadtest) and its workflow read ----
output "vpc_id" { value = module.network.vpc_id }
output "public_subnet_ids" { value = module.network.public_subnet_ids }
output "kms_key_arn" { value = module.kms.key_arn }
output "redis_url_secret_arn" { value = module.redis.redis_url_secret_arn }
output "documents_bucket_arn" { value = module.s3.documents_bucket_arn }
output "turn_instance_ids" { value = one(module.turn[*].instance_ids) }
output "livekit_instance_id" { value = one(module.livekit[*].instance_id) }
output "livekit_security_group_id" { value = one(module.livekit[*].security_group_id) }
output "alb_arn_suffix" { value = module.alb.arn_suffix }
output "api_target_group_arn_suffix" { value = module.alb.api_target_group_arn_suffix }
output "pgbouncer_service_name" { value = one(module.pgbouncer[*].service_name) }
output "db_pooler_endpoint" { value = one(module.pgbouncer[*].endpoint) }
output "db_pooler_server_connections_max" { value = var.db_pooler_enabled ? local.pgb_server_connections : null }
output "api_service_name" { value = module.ecs.api_service_name }
output "worker_service_name" { value = module.ecs.worker_service_name }
output "redis_replication_group_id" { value = "${local.name}-redis" }
output "log_group_names" { value = module.ecs.log_group_names }
