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
  type        = string
  default     = "lawbid"
  description = "Value of the Project tag. The load-test stack uses lawbid-loadtest: the watchdog and the IAM role find resources by this tag."
}
variable "extra_tags" {
  type        = map(string)
  default     = {}
  description = "More tags on every resource (load test: CreatedAt, RunId)."
}
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
variable "turn_second_enabled" {
  type        = bool
  default     = false
  description = "Owner 2026-10-22: a second coturn in another Availability Zone (≈ $7–8/month + Route 53 health checks ≈ $1.5), same secret; needs turn_enabled. docs/runbooks/TURN.md."
}
variable "turn_traffic_alarm_gb_per_day" {
  type        = number
  default     = 20
  description = "Alarm when the TURN relays send more than this many GB in 24 h (0 = off)."
}
variable "turn_instance_type" {
  type        = string
  default     = "t4g.nano"
  description = "TURN server size (modules/turn size ladder: nano 100, micro 200, small 500, medium 1000, large 2000 allocations). Default stays cheap; prod sets t4g.small."
}
variable "turn_total_quota" {
  type        = number
  default     = null
  description = "Override of the coturn quota per server; null = from the instance type."
}
variable "livekit_enabled" {
  type        = bool
  default     = false
  description = "Owner 2026-10-22: self-hosted LiveKit SFU for group calls on one EC2 box (modules/livekit, ≈ $35/month + traffic). Nothing is created until true. docs/runbooks/LIVEKIT.md."
}
variable "livekit_instance_type" {
  type    = string
  default = "c7g.medium"
}
variable "livekit_use_redis" {
  type        = bool
  default     = true
  description = "LiveKit shares the main ElastiCache (database 1); required before a second node is added."
}
variable "livekit_egress_alarm_gb_per_day" {
  type    = number
  default = 50
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
variable "dmarc_policy" {
  type    = string
  default = "quarantine"
}
# Security research #5 (2026-10-22), A6 / A8.
variable "security_hub_enabled" {
  type        = bool
  default     = false
  description = "AWS Security Hub with the CIS 1.4 standard (a few dollars a month)."
}
variable "guardduty_alert_severity" {
  type    = number
  default = 7
}
# Security & legal pass 2026-10-24 (docs/runbooks/SECURITY_LEGAL.md): every
# switch with its monthly cost. Free ones default on, paid ones off.
variable "securityhub_fsbp_enabled" {
  type        = bool
  default     = false
  description = "Security Hub: AWS Foundational Security Best Practices standard (needs security_hub_enabled). ~$5-15/month (approximate)."
}
variable "inspector_enabled" {
  type        = bool
  default     = false
  description = "Amazon Inspector for ECR images. ~$1-6/month (approximate)."
}
variable "unused_access_analyzer_enabled" {
  type        = bool
  default     = false
  description = "IAM Access Analyzer unused-access findings. ~$0.20 per role/user per month (approximate)."
}
variable "s3_account_block_public_access" {
  type        = bool
  default     = true
  description = "Account-wide S3 Block Public Access. Free."
}
variable "critical_api_alerts_enabled" {
  type        = bool
  default     = true
  description = "Alert on key deletion, CloudTrail off, backup vault/lock deletion, Block Public Access lifted, root user use. Free."
}
variable "documents_data_events" {
  type        = bool
  default     = false
  description = "CloudTrail data events on the documents bucket. ~$0.10 per 100 000 events (approximate)."
}
variable "audit_logs_enabled" {
  type        = bool
  default     = false
  description = "Locked-down log bucket with the ALB access log, the documents-bucket access log and VPC flow logs. ~$2-12/month (approximate, depends on traffic)."
}
variable "audit_logs_retention_days" {
  type    = number
  default = 400
}
variable "audit_logs_object_lock" {
  type        = bool
  default     = false
  description = "S3 Object Lock (governance) on the log bucket; only at creation; see modules/audit-logs. WARNING (AWS docs, checked 2026-10-24): a bucket with Object Lock cannot receive S3 server access logs, so with this on the documents access log (modules/s3) stops being delivered. Keep false; the bucket already denies deletes by IAM and versioning keeps history."
}
variable "vpc_flow_logs_traffic" {
  type    = string
  default = "ALL"
}
variable "macie_enabled" {
  type        = bool
  default     = false
  description = "Amazon Macie monthly sensitive-data scan of the documents bucket. ~$1 per GB inspected x sampling, see macie_sampling_percentage (approximate)."
}
variable "macie_sampling_percentage" {
  type    = number
  default = 10
}
variable "backup_vault_lock_mode" {
  type        = string
  default     = "off"
  description = "off | governance | compliance (irreversible after the cooling-off days). Free."
}
variable "backup_vault_lock_cooling_off_days" {
  type    = number
  default = 7
}
variable "ecs_readonly_root_filesystem" {
  type    = bool
  default = true
}
variable "deploy_alarm_rollback" {
  type        = bool
  default     = true
  description = "P1 deploy safety: ECS rolling deployment also rolls back when a CloudWatch alarm (ALB 5xx ratio, p95, unhealthy hosts; worker no-tasks; admin 5xx) fires during the rollout. false = circuit breaker only. docs/runbooks/DEPLOY_SAFETY.md."
}
variable "deploy_rollback_on_slo" {
  type        = bool
  default     = false
  description = "Also roll the api back on the FAST-burn SLO composites (call / push / otp). Off: they depend on third parties (Twilio, FCM, Cloudflare)."
}
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
variable "redis_cluster_mode" {
  type        = string
  default     = "off"
  description = <<-EOT
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
  type    = number
  default = 2
}
variable "redis_cluster_replicas_per_shard" {
  type    = number
  default = 1
}
variable "redis_cluster_node_type" {
  type        = string
  default     = ""
  description = "Empty = redis_node_type."
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
variable "api_min_tasks" {
  type        = number
  default     = null
  description = "Separate api floor (null = min_tasks). 2 = one api task per AZ (S4-11); the worker can stay at 1."
}
variable "cpu_architecture" {
  type        = string
  default     = "X86_64"
  description = "ARM64 (Graviton) is about 20 % cheaper; needs linux/arm64 images."
}
variable "container_insights" {
  type        = string
  default     = "disabled"
  description = "ECS Container Insights: disabled (saves about $30/month) or enabled (debugging graphs)."
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
# Scale audit 2026-10-23: one mobile-carrier (CGNAT) or office address carries
# thousands of people; 3000 / 5 min (10 per second) cut real users off the
# moment a city came online. Signed-in users are limited per account by the
# API itself (100 / min), so this edge rule only has to stop floods.
variable "waf_rate_limit_per_5m" {
  type    = number
  default = 10000
}
# Security research #5 (2026-10-22), A3: the sign-in code / password reset
# paths get their own, much lower per-IP limit at the WAF (the API's own
# OTP limits stay; this stops a flood before it reaches the API at all).
variable "waf_otp_rate_limit_per_5m" {
  type        = number
  default     = 60
  description = "Requests to the OTP / password-reset / phone-status paths from one IP in 5 minutes before the ALB WAF blocks it (backstop for callers without a device header; S4-8: one CGNAT address carries many people)."
}
variable "waf_device_header" {
  type        = string
  default     = "x-device-id"
  description = "S4-8: second WAF rate-limit key next to the IP (per-device rules). Empty = off."
}
variable "waf_auth_rate_action" {
  type        = string
  default     = "count"
  description = "S4-8: login / refresh rate rules: count (measure) or block."
}
variable "alb_deletion_protection" {
  type        = bool
  default     = false
  description = "S4-10: ALB deletion protection. Prod: true (never on load-test stacks)."
}
variable "alb_least_outstanding_requests" {
  type        = bool
  default     = false
  description = "S4-7: least_outstanding_requests instead of round_robin for the API target group (has no effect while stickiness is on for it; see alb_websocket_target_group)."
}
variable "alb_websocket_target_group" {
  type        = bool
  default     = false
  description = "S4-7: separate sticky target group for /socket.io only; the API group loses stickiness and uses least_outstanding_requests. Replaces the ECS api service in the AWS provider (short blip): apply in a quiet window."
}
# AWS Bot Control (paid: ~$10/month + $1 per million requests). Off by
# default; on, it only COUNTS (labels in the WAF metrics) until
# `waf_bot_control_block` is switched on after reading them for a while.
variable "waf_bot_control_enabled" {
  type    = bool
  default = false
}
variable "waf_bot_control_block" {
  type        = bool
  default     = false
  description = "Block the Bot Control verdicts instead of counting them (only with waf_bot_control_enabled)."
}
variable "cdn_waf_rate_limit_per_5m" {
  type        = number
  default     = 2000
  description = "Per-IP requests in 5 minutes on the web app and media CloudFront distributions."
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
  default     = 350
  description = "Monthly AWS spend (USD): e-mails at 50/80/100 %, autoscaling capped at the minimum at 100 %. 350 = the ≈ $150–170 launch size + Redis replica, second TURN, LiveKit (≈ $65–110) + traffic, with headroom so growth is not throttled by the budget (docs/runbooks/cost.md)."
}
variable "uptime_check" {
  type        = string
  default     = "synthetics"
  description = "External uptime probe: \"synthetics\" (CloudWatch canary, ≈ $10/month) or \"route53\" (HTTPS health check, ≈ $2/month, us-east-1 only). Off: uptime_canary_enabled = false."
}
# --- Batch A (docs/architecture/P0_AND_COST_PLAN.md): paging, budgets, NAT, backup alarm ---
variable "pagerduty_https_endpoint" {
  type        = string
  default     = null
  description = "Batch A item 1: PagerDuty Events API integration URL (https://events.pagerduty.com/integration/<key>/enqueue) for the CRITICAL topic (the 6 SLO composite alarms). Secret: lives only in the Secrets Manager tfvars. null = no phone paging. Runbook docs/runbooks/paging.md."
  sensitive   = true
}
variable "critical_email_too" {
  type        = bool
  default     = true
  description = "E-mail alert_emails from the critical topic as well (a second copy of the page)."
}
variable "redis_memory_alarm_percent" {
  type        = number
  default     = 70
  description = "Redis (queue node) memory alarm threshold, percent."
}
variable "nat_traffic_alarm_gb_per_day" {
  type        = number
  default     = 20
  description = "Alarm when one NAT gateway processes more than this many GB (in + out) in 24 h (0 = off). docs/runbooks/nat-endpoints.md."
}
variable "budget_forecast_thresholds" {
  type        = list(number)
  default     = [80, 100]
  description = "AWS Budgets FORECASTED alerts, percent of monthly_budget_usd."
}
variable "budget_to_alerts_topic" {
  type        = bool
  default     = true
  description = "Also send the budget notifications to the alerts SNS topic (Slack/e-mail subscribers), not only to alert_emails."
}
variable "anomaly_existing_monitor_arn" {
  type        = string
  default     = ""
  description = "With create_anomaly_monitor = false: ARN of the account's existing service anomaly monitor (aws ce get-anomaly-monitors). Together with anomaly_extra_emails adds a subscription with threshold anomaly_threshold_usd."
}
variable "anomaly_extra_emails" {
  type        = list(string)
  default     = []
  description = "E-mails of the extra Cost Anomaly subscription on the existing monitor."
}
variable "anomaly_threshold_usd" {
  type        = number
  default     = 20
  description = "Cost anomaly e-mail threshold (USD impact)."
}
variable "backup_age_missing_data" {
  type        = string
  default     = "breaching"
  description = "breaching (steady state) or notBreaching ONLY until the first backup job completes, so the backup-age alarm cannot fire falsely (docs/runbooks/restore-drill.md)."
}
variable "guardduty_ebs_malware" {
  type        = bool
  default     = false
  description = "GuardDuty EBS malware protection ($0.03/GB scanned, only after a finding). We run Fargate: leave off."
}
variable "guardduty_runtime_monitoring" {
  type        = bool
  default     = false
  description = "GuardDuty Runtime Monitoring on Fargate, $1.50/vCPU/month (about $5-50). Changes task start (sidecar): staging first."
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
variable "documents_cdn_public_key_pem" {
  type        = string
  default     = ""
  description = "Owner 2026-10-22: PEM public key for CloudFront signed URLs on private media (docs/runbooks/DEPLOY_PROD.md «CloudFront для приватных файлов»). Empty = presigned S3 links as before. Pair it with CLOUDFRONT_PRIVATE_KEY_PEM in extra_secrets."
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
  name   = local.name
  tags   = local.tags

  allow_macie = var.macie_enabled

  backup_copy_account_ids = var.backup_copy_account_id == "" ? [] : [var.backup_copy_account_id]
  deletion_window_in_days = var.ephemeral ? 7 : 30
}

module "kms_replica" {
  source    = "../kms"
  providers = { aws = aws.replica }
  name      = "${local.name}-replica"
  tags      = local.tags

  deletion_window_in_days = var.ephemeral ? 7 : 30
}

# Owner 2026-10-22: a separate key for wrapping application data keys
# (MESSAGE_ENC_KEYS, SECRETS_MASTER_KEYS). The task role may only Decrypt
# with it; the owner (account admin) encrypts new data keys with
# `aws kms encrypt --encryption-context app=<name>`.
resource "aws_kms_key" "data_keys" {
  description             = "${local.name}: wraps the app data keys (messages, admin key store)"
  deletion_window_in_days = var.ephemeral ? 7 : 30
  enable_key_rotation     = true
  tags                    = local.tags
}

resource "aws_kms_alias" "data_keys" {
  name          = "alias/${local.name}-data-keys"
  target_key_id = aws_kms_key.data_keys.key_id
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
  count                   = var.livekit_enabled ? 1 : 0
  source                  = "../livekit"
  name                    = local.name
  vpc_id                  = module.network.vpc_id
  subnet_id               = module.network.public_subnet_ids[0]
  domain                  = var.domain
  hosted_zone_id          = var.hosted_zone_id
  instance_type           = var.livekit_instance_type
  use_redis               = var.livekit_use_redis
  redis_endpoint          = module.redis.primary_endpoint
  redis_url_secret_arn    = module.redis.redis_url_secret_arn
  redis_security_group_id = module.redis.security_group_id
  kms_key_arn             = module.kms.key_arn
  alerts_topic_arn        = module.monitoring.alerts_topic_arn
  egress_alarm_gb_per_day = var.livekit_egress_alarm_gb_per_day
  tags                    = local.tags

  recovery_window_in_days = var.ephemeral ? 0 : 30
}

module "s3" {
  source              = "../s3"
  providers           = { aws = aws, aws.replica = aws.replica }
  name                = local.name
  kms_key_arn         = module.kms.key_arn
  replica_kms_key_arn = module.kms_replica.key_arn
  tags                = local.tags

  cors_allowed_origins         = local.web_cors_origins
  media_web_acl_arn            = module.cdn_waf.web_acl_arn
  documents_cdn_public_key_pem = var.documents_cdn_public_key_pem
  force_destroy                = var.ephemeral
  access_log_bucket            = try(module.audit_logs[0].bucket, "")
  replicate_media              = var.replicate_media && !var.ephemeral
}

variable "replicate_media" {
  type        = bool
  default     = false
  description = "S4-5: replicate the media bucket to the replica Region (no delete markers). Prod: true. Never on load-test stacks."
}

# Security & legal pass 2026-10-24: the access logs that prove who touched
# what, in a bucket nobody can delete from.
module "audit_logs" {
  count               = var.audit_logs_enabled && !var.ephemeral ? 1 : 0
  source              = "../audit-logs"
  name                = local.name
  enabled             = true
  retention_days      = var.audit_logs_retention_days
  object_lock_enabled = var.audit_logs_object_lock
  vpc_id              = module.network.vpc_id
  flow_logs_traffic   = var.vpc_flow_logs_traffic
  tags                = local.tags
}

# Sensitive-data discovery on the documents bucket (default off).
module "macie" {
  count               = var.macie_enabled && !var.ephemeral ? 1 : 0
  source              = "../macie"
  name                = local.name
  bucket_names        = [module.s3.documents_bucket]
  sampling_percentage = var.macie_sampling_percentage
  alerts_topic_arn    = module.monitoring.alerts_topic_arn
  tags                = local.tags
}

# Security research #5 (2026-10-22), A3: one WAF for both CloudFront
# distributions (the web app below and the media CDN in module "s3").
module "cdn_waf" {
  source            = "../cdn-waf"
  name              = local.name
  rate_limit_per_5m = var.cdn_waf_rate_limit_per_5m
  tags              = local.tags
}

# Owner 2026-10-15: the web version of the app (S3 + CloudFront).
module "web" {
  source                 = "../web"
  web_acl_arn            = module.cdn_waf.web_acl_arn
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
  force_destroy          = var.ephemeral
}

module "ses" {
  count          = var.ephemeral ? 0 : 1 # one SES identity per domain per account
  source         = "../ses"
  domain         = var.domain
  hosted_zone_id = var.hosted_zone_id
  dmarc_rua      = var.dmarc_rua
  dmarc_policy   = var.dmarc_policy
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

  waf_otp_rate_limit_per_5m = var.waf_otp_rate_limit_per_5m
  waf_device_header         = var.waf_device_header
  waf_auth_rate_action      = var.waf_auth_rate_action
  deletion_protection       = var.alb_deletion_protection && !var.ephemeral
  load_balancing_algorithm  = var.alb_least_outstanding_requests ? "least_outstanding_requests" : "round_robin"
  ws_target_group_enabled   = var.alb_websocket_target_group
  waf_bot_control_enabled   = var.waf_bot_control_enabled
  waf_bot_control_block     = var.waf_bot_control_block

  # The load-balancer log goes to the locked audit bucket (prefix `alb`).
  access_logs_bucket = one(module.audit_logs[*].bucket)
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

  cluster_mode            = var.redis_cluster_mode != "off"
  num_node_groups         = var.redis_cluster_shards
  replicas_per_node_group = var.redis_cluster_replicas_per_shard
  cluster_node_type       = var.redis_cluster_node_type

  recovery_window_in_days = var.ephemeral ? 0 : 30
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

  deletion_protection     = !var.ephemeral
  skip_final_snapshot     = var.ephemeral
  recovery_window_in_days = var.ephemeral ? 0 : 30
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

  recovery_window_in_days = var.ephemeral ? 0 : 30
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
  type        = bool
  default     = false
  description = "Manage the database named in existing_database_identifier as aws_db_instance.existing (imported by envs/prod/imports.tf). Needs create_database = false. Never replaces or deletes it."
}
variable "database_deletion_protection" {
  type        = bool
  default     = true
  description = "Deletion protection of the adopted database (drift shows when it is off)."
}

resource "aws_db_instance" "existing" {
  count      = var.adopt_existing_database && !var.create_database && var.existing_database_identifier != "" ? 1 : 0
  identifier = var.existing_database_identifier

  # Required by the provider; the real values are kept (ignore_changes).
  engine         = "postgres"
  instance_class = var.database_instance_class

  # Declared, drift-checked attributes.
  multi_az                              = var.database_multi_az
  backup_retention_period               = var.database_backup_retention_days
  deletion_protection                   = var.database_deletion_protection
  storage_encrypted                     = true
  publicly_accessible                   = false
  copy_tags_to_snapshot                 = true
  auto_minor_version_upgrade            = true
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  skip_final_snapshot                   = false
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
  type        = bool
  default     = false
  description = "Replicate RDS automated backups (snapshots and WAL) to the replica Region with PITR there (aws_db_instance_automated_backups_replication). Needs create_database or existing_database_identifier, and the instance's backup_retention_period > 0."
}
variable "rds_cross_region_backup_retention_days" {
  type        = number
  default     = 14
  description = "Retention of the replicated automated backups (1-35)."
}

resource "aws_db_instance_automated_backups_replication" "this" {
  provider               = aws.replica
  count                  = var.rds_cross_region_backups && local.database_arn != "" ? 1 : 0
  source_db_instance_arn = local.database_arn
  kms_key_id             = module.kms_replica.key_arn
  retention_period       = var.rds_cross_region_backup_retention_days
}

module "backup" {
  count               = var.backup_enabled && (var.create_database || var.existing_database_identifier != "") ? 1 : 0
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
  alerts_topic_arn        = module.monitoring.alerts_topic_arn
  backup_age_missing_data = var.backup_age_missing_data
  tags                    = local.tags

  vault_lock_mode             = var.backup_vault_lock_mode
  vault_lock_cooling_off_days = var.backup_vault_lock_cooling_off_days
}

module "secrets" {
  source      = "../secrets"
  name        = local.name
  kms_key_arn = module.kms.key_arn
  names       = concat(local.secret_names, ["MIGRATOR_DATABASE_URL"])
  tags        = local.tags

  recovery_window_in_days = var.ephemeral ? 0 : 30
}

# --- database autoscale (owner 2026-10-24, docs/architecture/DB_AUTOSCALE.md) --
variable "db_autoscale_enabled" {
  type        = bool
  default     = false
  description = "The database grows one size under load and shrinks one size after 3 quiet days, by itself (modules/db-autoscale). Needs a database named by create_database or existing_database_identifier."
}
variable "db_autoscale_min_class" {
  type    = string
  default = "db.t4g.micro"
}
variable "db_autoscale_max_class" {
  type        = string
  default     = "db.r7g.xlarge"
  description = "Ceiling for the bill. Above it the owner gets an e-mail."
}
variable "db_autoscale_mode" {
  type        = string
  default     = "on"
  description = "Start value of the switch: on | dry-run | off. Later changes are made in SSM (docs/runbooks/db-autoscale.md)."
}
variable "db_autoscale_ladder" {
  type = list(string)
  default = [
    "db.t4g.micro", "db.t4g.small", "db.t4g.medium", "db.t4g.large",
    "db.r7g.large", "db.r7g.xlarge", "db.r7g.2xlarge",
  ]
}
variable "db_autoscale_tuning" {
  type    = map(number)
  default = {}
}

# --- Redis autoscale (owner 2026-10-24, docs/architecture/REDIS_AUTOSCALE.md) --
variable "redis_autoscale_enabled" {
  type        = bool
  default     = false
  description = "Redis grows one node type under load and shrinks one after 3 quiet days, by itself (modules/redis-autoscale). Needs redis_replicas >= 1 (online resize through failover); idle until automatic failover is on."
}
variable "redis_autoscale_min_class" {
  type    = string
  default = "cache.t4g.micro"
}
variable "redis_autoscale_max_class" {
  type        = string
  default     = "cache.r7g.large"
  description = "Ceiling for the bill: ≈ $320/month with one replica. Above it the owner gets an e-mail."
}
variable "redis_autoscale_mode" {
  type        = string
  default     = "on"
  description = "Start value of the switch: on | dry-run | off. Later changes are made in SSM (docs/runbooks/redis-autoscale.md)."
}
variable "redis_autoscale_tuning" {
  type    = map(number)
  default = {}
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
  type        = number
  default     = 0
  description = "max_connections of the database. 0 = estimate from database_instance_class with the RDS default formula (memory / 9531392); set it when the database is not ours (create_database = false) or the parameter group changes it."
}

# --- own connection pooler (docs/architecture/DB_POOLER.md) -------------------------
variable "db_pooler_enabled" {
  type        = bool
  default     = false
  description = "Owner 2026-10-24: run our own PgBouncer between the app and the database. true: api / worker connect to it (DB_POOLER_HOST), so up to 70 tasks never exhaust the database connections. false (default): direct DATABASE_URL, exactly as before - this is the rollback switch."
}
variable "pgbouncer_image" {
  type        = string
  default     = ""
  description = "ECR image of the pooler: <registry>/lawbid-pgbouncer:<tag> (build it with .github/workflows/build-pgbouncer.yml). Required when db_pooler_enabled."
}
variable "pgbouncer_min_tasks" {
  type    = number
  default = 2
}
variable "pgbouncer_max_tasks" {
  type        = number
  default     = 4
  description = "CPU autoscaling ceiling of the pooler. The database budget is split by this number, so a higher ceiling means smaller pools per task."
}
variable "pgbouncer_cpu" {
  type    = number
  default = 512
}
variable "pgbouncer_memory" {
  type    = number
  default = 1024
}
variable "pgbouncer_reserve_pool_size" {
  type        = number
  default     = 3
  description = "Extra database connections per pooler task, used only when clients already waited 3 s."
}
variable "db_pooler_max_client_conn" {
  type        = number
  default     = 5000
  description = "Client connections one pooler task accepts (every app task holds up to 10)."
}
variable "pgbouncer_query_wait_timeout" {
  type    = number
  default = 30
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
    condition = var.db_pooler_enabled ? (
      var.pgbouncer_image != "" &&
      local.pgb_pool_size >= 5 &&
      local.pgb_server_connections <= local.db_pooler_budget &&
      local.pgb_max_clients_possible <= var.db_pooler_max_client_conn
      ) : (
      local.direct_pool_size * local.db_peak_tasks <= local.db_ceiling_connections
    )
    error_message = var.db_pooler_enabled ? "db_pooler_enabled = true needs: pgbouncer_image set (ECR lawbid-pgbouncer, .github/workflows/build-pgbouncer.yml); at least 5 database connections per pooler task after the reserve (pgbouncer_max_tasks too high or the database too small); and db_pooler_max_client_conn >= 10 x (api_max_tasks + worker_max_tasks) x 2." : "Even the smallest pool (3 per task) at the peak task count (api_max_tasks + worker_max_tasks, twice during a deploy) needs more connections than the database accepts (with db_autoscale_enabled: even at db_autoscale_max_class): lower api_max_tasks / worker_max_tasks, choose a bigger database_instance_class, or turn on our own pooler (db_pooler_enabled = true, docs/architecture/DB_POOLER.md)."
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
  count  = var.db_pooler_enabled ? 1 : 0
  source = "../pgbouncer"

  name                       = local.name
  vpc_id                     = module.network.vpc_id
  private_subnet_ids         = module.network.private_subnet_ids
  cluster_arn                = module.ecs.cluster_arn
  cluster_name               = module.ecs.cluster_name
  client_security_group_id   = aws_security_group.tasks.id
  database_security_group_id = var.create_database ? module.postgres[0].security_group_id : ""
  database_url_secret_arn    = module.secrets.arns["DATABASE_URL"]
  kms_key_arn                = module.kms.key_arn
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
  tags                       = local.tags
}

# What the api / worker get when the pooler is on (src/prisma/pooler-url.ts
# swaps host and port of DATABASE_URL; the secret itself is untouched).
locals {
  db_pooler_env = var.db_pooler_enabled ? {
    DB_POOLER_HOST = module.pgbouncer[0].endpoint
    DB_POOLER_PORT = tostring(module.pgbouncer[0].port)
  } : {}
}

module "ecs" {
  source                   = "../ecs"
  name                     = local.name
  readonly_root_filesystem = var.ecs_readonly_root_filesystem
  vpc_id                   = module.network.vpc_id
  private_subnet_ids       = module.network.private_subnet_ids
  tasks_security_group_id  = aws_security_group.tasks.id
  api_target_group_arn     = module.alb.api_target_group_arn
  api_ws_target_group_arn  = module.alb.api_ws_target_group_arn
  admin_target_group_arn   = module.alb.admin_target_group_arn
  api_image                = var.api_image
  admin_image              = var.admin_image
  kms_key_arn              = module.kms.key_arn
  api_env                  = merge(local.api_env, local.db_pooler_env)
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
  api_min_tasks                    = var.api_min_tasks
  admin_tasks                      = var.admin_tasks
  api_cpu                          = var.api_cpu
  api_memory                       = var.api_memory
  worker_cpu                       = var.worker_cpu
  worker_memory                    = var.worker_memory
  clamav_image                     = var.clamav_image
  cpu_architecture                 = var.cpu_architecture
  container_insights               = var.container_insights
  worker_spot                      = var.worker_spot
  api_spot                         = var.api_spot
  night_scale_down                 = var.night_scale_down
  night_min_tasks                  = var.night_min_tasks
  tags                             = local.tags

  # P1 deploy safety: rolling + alarm rollback (docs/runbooks/DEPLOY_SAFETY.md).
  deployment_alarm_rollback     = var.deploy_alarm_rollback
  api_deployment_alarm_names    = module.monitoring.api_deployment_alarm_names
  worker_deployment_alarm_names = module.monitoring.worker_deployment_alarm_names
  admin_deployment_alarm_names  = module.monitoring.admin_deployment_alarm_names

  # Same namespace as modules/monitoring (QueueWaitingTotal).
  metrics_namespace    = "LawBid/${local.name}"
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
    actions   = ["s3:ListBucket"]
    resources = [module.s3.documents_bucket_arn, module.s3.media_bucket_arn]
  }
  statement {
    actions   = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey"]
    resources = [module.kms.key_arn]
  }
  # Owner 2026-10-22 (SECURITY_TODO «KMS-wrapped keys»): the task may only
  # unwrap the message / key-store data keys, nothing else on this key.
  statement {
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.data_keys.arn]
    condition {
      test     = "StringEquals"
      variable = "kms:EncryptionContext:app"
      values   = [local.name]
    }
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

# S4-1: the infrastructure-changing calls of the admin «Масштаб / Запуск /
# Расходы» screens. rds:ModifyDBInstance alone can reset the master password
# and set backup retention to 0, so this must not sit on the role of the
# process that serves the internet.
data "aws_iam_policy_document" "ops" {
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
  dynamic "statement" {
    for_each = module.budget[*].budget_arn
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
    actions   = ["sns:Subscribe", "sns:ListSubscriptionsByTopic", "sns:Publish"]
    resources = [local.critical_topic_arn]
  }
  statement {
    actions   = ["sns:Unsubscribe"]
    resources = ["${local.critical_topic_arn}:*"]
  }
  # Owner 2026-10-24 (admin «Масштаб»): list the account's budgets (read),
  # change the limit of the production budget and delete the obsolete
  # «LawBid Monthly» one - by name, nothing else. If AWS refuses
  # DeleteBudget with only ModifyBudget, the separate DeleteBudget action
  # below (obsolete budget only) covers it.
  statement {
    actions   = ["budgets:ViewBudget"]
    resources = ["arn:aws:budgets::${data.aws_caller_identity.current.account_id}:budget/*"]
  }
  statement {
    actions = ["budgets:ModifyBudget"]
    resources = [
      "arn:aws:budgets::${data.aws_caller_identity.current.account_id}:budget/${local.name}-monthly",
      "arn:aws:budgets::${data.aws_caller_identity.current.account_id}:budget/LawBid Monthly",
    ]
  }
  statement {
    actions   = ["budgets:DeleteBudget"]
    resources = ["arn:aws:budgets::${data.aws_caller_identity.current.account_id}:budget/LawBid Monthly"]
  }
  # Owner 2026-10-24 (admin «Запуск» and «Расходы»): read-only cost data.
  # Cost Explorer has no resource-level scope; each request costs $0.01, so
  # the app asks at most every 6 hours (common/ops/spend/spend.service.ts).
  statement {
    actions   = ["ce:GetCostAndUsage", "ce:GetCostForecast", "ce:ListCostAllocationTags"]
    resources = ["*"]
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

variable "ops_role_split" {
  type        = bool
  default     = false
  description = "S4-1: move the admin scale / launch / cost permissions off the api+worker task role into a separate role `<name>-ops` that the app assumes through STS (needs ops_role_external_id). DEPLOY THE API CODE WITH OPS_ROLE_ARN SUPPORT FIRST, then turn this on (docs/runbooks/aws-guardrails.md)."
}
variable "ops_role_external_id" {
  type        = string
  default     = ""
  sensitive   = true
  description = "Shared secret the app must present when assuming the ops role (sts:ExternalId). 32+ random characters, kept in the Secrets Manager tfvars. It lives only in a Secrets Manager secret injected into the task as OPS_ROLE_EXTERNAL_ID, so stolen task credentials alone cannot assume the ops role."
  validation {
    condition     = var.ops_role_external_id == "" || length(var.ops_role_external_id) >= 32
    error_message = "ops_role_external_id must be empty (split off) or at least 32 characters."
  }
}

data "aws_iam_policy_document" "ops_trust" {
  count = var.ops_role_split ? 1 : 0
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "AWS"
      identifiers = [module.ecs.task_role_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "sts:ExternalId"
      values   = [var.ops_role_external_id]
    }
  }
}

resource "aws_iam_role" "ops" {
  count                = var.ops_role_split ? 1 : 0
  name                 = "${local.name}-ops"
  assume_role_policy   = data.aws_iam_policy_document.ops_trust[0].json
  max_session_duration = 3600
  tags                 = local.tags

  lifecycle {
    precondition {
      condition     = var.ops_role_external_id != ""
      error_message = "ops_role_split = true needs ops_role_external_id (32+ random characters)."
    }
  }
}

resource "aws_iam_role_policy" "ops" {
  count  = var.ops_role_split ? 1 : 0
  role   = aws_iam_role.ops[0].id
  policy = data.aws_iam_policy_document.ops.json
}

resource "aws_secretsmanager_secret" "ops_external_id" {
  count                   = var.ops_role_split ? 1 : 0
  name                    = "${local.name}/OPS_ROLE_EXTERNAL_ID"
  kms_key_id              = module.kms.key_arn
  recovery_window_in_days = var.ephemeral ? 0 : 30
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "ops_external_id" {
  count         = var.ops_role_split ? 1 : 0
  secret_id     = aws_secretsmanager_secret.ops_external_id[0].id
  secret_string = var.ops_role_external_id
}

resource "aws_iam_role_policy" "task" {
  role   = module.ecs.task_role_name
  policy = data.aws_iam_policy_document.task.json
}

module "budget" {
  count                  = var.ephemeral ? 0 : 1 # the account budget is not per load test
  source                 = "../budget"
  name                   = local.name
  monthly_budget_usd     = var.monthly_budget_usd
  alert_emails           = var.alert_emails
  create_anomaly_monitor = var.create_anomaly_monitor
  tags                   = local.tags

  forecast_thresholds          = var.budget_forecast_thresholds
  subscriber_sns_topic_arns    = var.budget_to_alerts_topic ? [module.monitoring.alerts_topic_arn] : []
  anomaly_threshold_usd        = var.anomaly_threshold_usd
  anomaly_existing_monitor_arn = var.anomaly_existing_monitor_arn
  anomaly_extra_emails         = var.anomaly_extra_emails
  anomaly_sns_topic_arn        = var.anomaly_to_alerts_topic ? module.monitoring.alerts_topic_arn : ""
}

module "monitoring" {
  source                        = "../monitoring"
  name                          = local.name
  alert_emails                  = var.alert_emails
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
  cluster_name                  = module.ecs.cluster_name
  api_service_name              = module.ecs.api_service_name
  worker_service_name           = module.ecs.worker_service_name
  redis_replication_group_id    = "${local.name}-redis"
  redis_replicas                = var.redis_replicas
  db_instance_id                = var.create_database ? "${local.name}-postgres" : ""
  db_max_connections            = local.db_max_connections
  acm_certificate_arns          = [var.certificate_arn]
  api_log_group                 = module.ecs.log_group_names["api"]
  worker_log_group              = module.ecs.log_group_names["worker"]
  p95_target_ms                 = var.p95_target_ms
  runbook_base_url              = var.runbook_base_url
  kms_key_arn                   = module.kms.key_arn
  # Owner 2026-10-22 (audit #4 §7): external uptime canary + SLO alarms.
  canary_url        = var.uptime_canary_enabled ? "https://${var.api_host}/health/ready" : null
  uptime_check      = var.uptime_check
  min_daily_signups = var.min_daily_signups
  tags              = local.tags
}

# Owner 2026-10-24: database size follows the load (up fast, down at night).
module "db_autoscale" {
  count            = local.db_autoscale_on ? 1 : 0
  source           = "../db-autoscale"
  name             = local.name
  db_instance_id   = local.db_identifier
  cluster_name     = module.ecs.cluster_name
  service_names    = [module.ecs.api_service_name, module.ecs.worker_service_name]
  alerts_topic_arn = module.monitoring.alerts_topic_arn
  kms_key_arn      = module.kms.key_arn
  ladder           = var.db_autoscale_ladder
  min_class        = var.db_autoscale_min_class
  max_class        = var.db_autoscale_max_class
  mode             = var.db_autoscale_mode
  tuning           = var.db_autoscale_tuning
  tags             = local.tags
}

# Owner 2026-10-24: Redis size follows the load too (modules/redis ignores
# node_type changes, so terraform apply never undoes it).
module "redis_autoscale" {
  # Not for a cluster-mode group (the Lambda would skip it anyway: cluster_mode).
  count                = var.redis_autoscale_enabled && var.redis_replicas > 0 && !local.redis_cluster_on ? 1 : 0
  source               = "../redis-autoscale"
  name                 = local.name
  replication_group_id = "${local.name}-redis"
  replicas             = var.redis_replicas
  cluster_name         = module.ecs.cluster_name
  service_names        = [module.ecs.api_service_name, module.ecs.worker_service_name]
  alerts_topic_arn     = module.monitoring.alerts_topic_arn
  kms_key_arn          = module.kms.key_arn
  min_node_type        = var.redis_autoscale_min_class
  max_node_type        = var.redis_autoscale_max_class
  mode                 = var.redis_autoscale_mode
  tuning               = var.redis_autoscale_tuning
  tags                 = local.tags
  depends_on           = [module.redis]
}

check "redis_autoscale_needs_replica" {
  assert {
    condition     = !var.redis_autoscale_enabled || var.redis_replicas > 0
    error_message = "redis_autoscale_enabled needs redis_replicas >= 1: a single Redis node is replaced with minutes of downtime on every resize, so the autoscaler is not created."
  }
}

# A read replica must keep max_connections >= its primary's, so the primary
# cannot grow alone; the autoscaler pauses (and e-mails) while replicas exist.
check "db_autoscale_vs_replicas" {
  assert {
    condition     = !local.db_autoscale_on || var.growth.rds_read_replicas == 0
    error_message = "db_autoscale_enabled and growth.rds_read_replicas > 0: the autoscaler will not resize a database that has replicas (it pauses and sends an e-mail). Size the primary and the replicas by hand, or set db_autoscale_enabled = false."
  }
}

# Security research #5 (2026-10-22), A6: CloudTrail, GuardDuty, Access
# Analyzer, password policy; findings go to the alerts topic.
module "security_baseline" {
  count                = var.ephemeral ? 0 : 1 # CloudTrail / GuardDuty / Access Analyzer are account singletons
  source               = "../security-baseline"
  name                 = local.name
  alerts_topic_arn     = module.monitoring.alerts_topic_arn
  alert_severity       = var.guardduty_alert_severity
  security_hub_enabled = var.security_hub_enabled
  tags                 = local.tags

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
  count            = var.ephemeral ? 0 : 1 # account singleton, like CloudTrail
  source           = "../aws-config"
  name             = local.name
  enabled          = var.config_enabled
  alerts_topic_arn = module.monitoring.alerts_topic_arn
  retention_days   = var.config_retention_days
  tags             = local.tags
}

# Emergency administrator role (MFA, named principals, pages on use). Free.
module "break_glass" {
  count                  = var.ephemeral ? 0 : 1
  source                 = "../break-glass"
  name                   = local.name
  enabled                = var.break_glass_enabled
  trusted_principal_arns = var.break_glass_principal_arns
  critical_topic_arn     = module.monitoring.critical_topic_arn
  tags                   = local.tags
}

# Athena over the CloudTrail bucket with saved investigation queries. ~$0 idle.
module "cloudtrail_athena" {
  count        = var.ephemeral || !var.cloudtrail_athena_enabled ? 0 : 1
  source       = "../cloudtrail-athena"
  name         = local.name
  trail_bucket = module.security_baseline[0].cloudtrail_bucket
  regions      = distinct([data.aws_region.current.name, "us-east-1"])
  tags         = local.tags
}

variable "config_enabled" {
  type        = bool
  default     = false
  description = "AWS Config recorder (6 resource types, daily) + 11 AWS-managed rules + alert on NON_COMPLIANT. About $1-4/month (approximate; $0.012 per daily item, $0.001 per rule evaluation)."
}
variable "config_retention_days" {
  type    = number
  default = 400
}
variable "break_glass_enabled" {
  type        = bool
  default     = false
  description = "Emergency administrator role (MFA, named principals, pages the critical topic). Free. Needs break_glass_principal_arns."
}
variable "break_glass_principal_arns" {
  type        = list(string)
  default     = []
  description = "Named IAM users/roles that may assume the break-glass role (with MFA)."
}
variable "cloudtrail_athena_enabled" {
  type        = bool
  default     = true
  description = "Athena workgroup, Glue table (partition projection) and saved queries over the CloudTrail bucket. ~$0 idle; $5 per TB scanned."
}
variable "anomaly_to_alerts_topic" {
  type        = bool
  default     = true
  description = "Also send each Cost Anomaly Detection finding to the alerts topic at once (free)."
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
  from = module.budget
  to   = module.budget[0]
}
moved {
  from = module.security_baseline
  to   = module.security_baseline[0]
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
