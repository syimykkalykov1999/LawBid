variable "region" {
  type    = string
  default = "us-east-1"
}
variable "replica_region" {
  type    = string
  default = "us-west-2"
}
variable "azs" {
  type    = list(string)
  default = ["us-east-1a", "us-east-1b"]
}
variable "vpc_cidr" {
  type    = string
  default = "10.30.0.0/16"
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
variable "stripe_price_id" {
  type    = string
  default = "" # prices live in the admin (Деньги → Цены)
}
variable "extra_secrets" {
  type        = list(string)
  default     = []
  description = "Optional env-var secrets; add a name only after its value is set in Secrets Manager."
}
variable "documents_cdn_public_key_pem" {
  type        = string
  default     = ""
  description = "PEM public key for CloudFront signed URLs on private media; the private key is the CLOUDFRONT_PRIVATE_KEY_PEM secret (extra_secrets). See docs/runbooks/DEPLOY_PROD.md."
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
# docs/06 §6.3: production sizes (5k RPS peak); raise api_max_tasks with load-test results.
variable "redis_node_type" {
  type    = string
  default = "cache.r7g.large"
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
variable "p95_target_ms" {
  type    = number
  default = 600
}
variable "nat_per_az" {
  type    = bool
  default = true
}
variable "interface_endpoints" {
  type    = list(string)
  default = ["ecr.api", "ecr.dkr", "logs", "secretsmanager", "kms"]
}
# Security review: restrict the admin host to the office/VPN ranges once known.
variable "admin_allowed_cidrs" {
  type    = list(string)
  default = []
}
variable "min_tasks" {
  type        = number
  default     = 2
  description = "Minimum api and worker tasks (autoscaling floor). 1 = launch size, 2+ = survives a lost AZ."
}
variable "container_insights" {
  type        = string
  default     = "disabled"
  description = "ECS Container Insights: disabled (saves about $30/month) or enabled (per-task graphs, turn on only to debug). The worker autoscaling and the no-running-tasks alarms do not need it."
}
variable "worker_spot" {
  type        = bool
  default     = false
  description = "Worker on Fargate Spot (one task stays on regular Fargate): up to 70 % cheaper."
}
variable "api_spot" {
  type        = bool
  default     = false
  description = "API tasks added by autoscaling run on Fargate Spot; the first stays on regular Fargate."
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

# Zero maintenance (owner 2026-10-05): e-mails at 50/80/100 % of this, and
# autoscaling is capped at the minimum when it is reached (switchable in
# admin Система → Здоровье системы).
variable "monthly_budget_usd" {
  type    = number
  default = 350 # 2026-10-22: 200 → 350, see modules/stack monthly_budget_usd
}
# --- Batch A (docs/architecture/P0_AND_COST_PLAN.md) ---
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
  type        = bool
  default     = true
  description = "false when the AWS account already has a service-level Cost Anomaly monitor (one allowed per account)."
}
# Owner 2026-10-24: our own PgBouncer (docs/architecture/DB_POOLER.md,
# runbook docs/runbooks/DB_POOLER.md). false = direct database connection.
variable "db_pooler_enabled" {
  type    = bool
  default = false
}
variable "pgbouncer_image" {
  type        = string
  default     = ""
  description = "<ECR_REGISTRY>/lawbid-pgbouncer:<tag> (workflow Build PgBouncer)."
}
variable "pgbouncer_max_tasks" {
  type    = number
  default = 4
}
# Security pass 2026-10-25 (S3-7, runbook docs/runbooks/DB_POOLER.md section
# "Verified TLS"): both keep today's behaviour until the owner flips them.
variable "pgbouncer_db_tls_mode" {
  type        = string
  default     = "require"
  description = "require | verify-full (RDS CA bundle baked into the pgbouncer image; rebuild the image first)."
}
variable "pgbouncer_client_tls_private_ca" {
  type        = bool
  default     = false
  description = "true: private CA + certificate for the pooler, verified by the api / worker."
}
variable "clamav_image" {
  type    = string
  default = "clamav/clamav:1.4"
}
# Browser beta (owner 2026-10-07): the web app's origin, for direct S3
# uploads (presigned POST) and signed GET reads. Origin only: no path.
variable "s3_cors_allowed_origins" {
  type    = list(string)
  default = ["https://syimykkalykov1999.github.io"]
}

variable "web_host" {
  type    = string
  default = ""
}
variable "web_certificate_arn" {
  type    = string
  default = ""
}
variable "web_create_certificate" {
  type    = bool
  default = false
}
variable "web_extra_hosts" {
  type    = list(string)
  default = []
}
variable "status_page_enabled" {
  type    = bool
  default = false
}
variable "status_host" {
  type    = string
  default = ""
}
variable "status_certificate_arn" {
  type    = string
  default = ""
}
variable "status_create_certificate" {
  type    = bool
  default = false
}
variable "create_database" {
  type    = bool
  default = false
}
variable "database_instance_class" {
  type    = string
  default = "db.t4g.medium"
}
variable "database_max_connections" {
  type        = number
  default     = 0
  description = "0 = estimated from database_instance_class; set it when the database is not ours."
}
variable "database_backup_retention_days" {
  type    = number
  default = 14
  validation {
    condition     = var.database_backup_retention_days >= 14 && var.database_backup_retention_days <= 35
    error_message = "Prod keeps automated backups 14–35 days (owner 2026-10-22)."
  }
}

# --- reliability (owner 2026-10-22, docs/runbooks/backups.md) -------------
variable "database_multi_az" {
  type        = bool
  default     = true
  description = "RDS Multi-AZ for a Terraform-managed database; for the existing one it is checked at plan time (warning) and switched on in the console."
}
variable "existing_database_identifier" {
  type        = string
  default     = ""
  description = "The production RDS created outside Terraform (lawbid-prod-postgres): backed up by AWS Backup and checked at plan time, never modified."
}
# --- database autoscale (owner 2026-10-24, docs/architecture/DB_AUTOSCALE.md) -----
variable "db_autoscale_enabled" {
  type        = bool
  default     = true
  description = "The database grows one size under load and shrinks one size after 3 quiet days, by itself. Works on the database named by existing_database_identifier (or create_database). Off switch without terraform: docs/runbooks/db-autoscale.md."
}
variable "db_autoscale_min_class" {
  type    = string
  default = "db.t4g.micro"
}
variable "db_autoscale_max_class" {
  type        = string
  default     = "db.r7g.xlarge"
  description = "Ceiling for the bill: ≈ $698/month with Multi-AZ. Above it the owner gets an e-mail and decides."
}
variable "db_autoscale_mode" {
  type        = string
  default     = "on"
  description = "Start value of the switch: on | dry-run (e-mails what it would do, changes nothing) | off. Later changes are made in SSM, not here."
  validation {
    condition     = contains(["on", "dry-run", "off"], var.db_autoscale_mode)
    error_message = "db_autoscale_mode: on, dry-run or off."
  }
}
variable "db_autoscale_tuning" {
  type        = map(number)
  default     = {}
  description = "Optional numbers, e.g. { up_cpu_pct = 75 } (infra/modules/db-autoscale/lambda/decision.py Config)."
}
# --- Redis autoscale (owner 2026-10-24, docs/architecture/REDIS_AUTOSCALE.md) ----
variable "redis_autoscale_enabled" {
  type        = bool
  default     = true
  description = "Redis grows one node type under load and shrinks one after 3 quiet days, by itself. Needs redis_replicas >= 1 and automatic failover. Off switch without terraform: docs/runbooks/redis-autoscale.md. After it has moved Redis, set redis_node_type to the current type before changing redis_replicas."
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
  description = "Start value of the switch: on | dry-run (e-mails what it would do, changes nothing) | off. Later changes are made in SSM, not here."
  validation {
    condition     = contains(["on", "dry-run", "off"], var.redis_autoscale_mode)
    error_message = "redis_autoscale_mode: on, dry-run or off."
  }
}
variable "redis_autoscale_tuning" {
  type        = map(number)
  default     = {}
  description = "Optional numbers, e.g. { up_cpu_pct = 75 } (infra/modules/redis-autoscale/lambda/decision.py Config)."
}
variable "backup_enabled" {
  type    = bool
  default = true
}
variable "backup_retention_days" {
  type    = number
  default = 35
}
variable "backup_copy_account_id" {
  type        = string
  default     = ""
  description = "Optional separate backup account id (12 digits). Empty = copies only to the second region (replica_region)."
  validation {
    condition     = var.backup_copy_account_id == "" || can(regex("^[0-9]{12}$", var.backup_copy_account_id))
    error_message = "backup_copy_account_id: empty or a 12-digit AWS account id."
  }
}
variable "backup_copy_vault_name" {
  type    = string
  default = "lawbid-backup-copy"
}
variable "backup_copy_region" {
  type    = string
  default = ""
}
variable "interface_endpoint_azs" {
  type    = number
  default = 0
}
variable "redis_cache_node" {
  type    = bool
  default = false
}
variable "redis_cache_node_type" {
  type    = string
  default = "cache.t4g.micro"
}
variable "worker_jobs_per_task" {
  type    = number
  default = 50
}

variable "turn_enabled" {
  type        = bool
  default     = false
  description = "coturn relay for calls (modules/turn); docs/runbooks/TURN.md."
}
variable "turn_second_enabled" {
  type        = bool
  default     = false
  description = "Second coturn in another AZ (≈ $9/month with health checks); needs turn_enabled."
}
variable "turn_instance_type" {
  type        = string
  default     = "t4g.small"
  description = "Owner 2026-10-23: t4g.small (quota 500 per server) instead of t4g.nano (100): about +$9.2/month per server (approx. us-east-1 on-demand $12.3 vs $3.1), +$18 with the second server. Sizes and quotas: modules/turn/main.tf."
}
variable "turn_total_quota" {
  type        = number
  default     = null
  description = "Override coturn total-quota per server; null = from turn_instance_type."
}
variable "turn_traffic_alarm_gb_per_day" {
  type    = number
  default = 20
}

# Owner 2026-10-22: self-hosted LiveKit SFU (docs/runbooks/LIVEKIT.md).
variable "livekit_enabled" {
  type    = bool
  default = false
}
variable "livekit_instance_type" {
  type    = string
  default = "c7g.medium"
}
variable "livekit_use_redis" {
  type    = bool
  default = true
}
variable "livekit_egress_alarm_gb_per_day" {
  type    = number
  default = 50
}

variable "uptime_check" {
  type        = string
  default     = "synthetics"
  description = "synthetics (≈ $10/month) or route53 (≈ $2/month, us-east-1 only)."
}
variable "cpu_architecture" {
  type        = string
  default     = "X86_64"
  description = "ARM64 = Graviton, ≈ 20 % cheaper Fargate. Switch only after a deploy built by the multi-arch workflow (deploy.yml) is the image tag in api_image / admin_image (docs/runbooks/DEPLOY_PROD.md)."
}

# Security research #5 (2026-10-22): WAF, cloud detector, container.
variable "waf_otp_rate_limit_per_5m" {
  type    = number
  default = 20 # raise to 60 when the per-device rules are on (waf_device_header)
}
variable "waf_bot_control_enabled" {
  type    = bool
  default = false
}
variable "waf_bot_control_block" {
  type    = bool
  default = false
}
# Scale audit 2026-10-23: a feed screen loads dozens of pictures; see waf_rate_limit_per_5m.
variable "cdn_waf_rate_limit_per_5m" {
  type    = number
  default = 10000
}
variable "security_hub_enabled" {
  type    = bool
  default = false
}
variable "guardduty_alert_severity" {
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
  description = "Rolling deploy + CloudWatch alarm rollback (docs/runbooks/DEPLOY_SAFETY.md). false = circuit breaker only."
}
variable "deploy_rollback_on_slo" {
  type        = bool
  default     = false
  description = "Also roll the api back on the FAST-burn SLO composites. Off by default (third-party dependent)."
}
variable "dmarc_policy" {
  type    = string
  default = "quarantine"
}

# Security & legal pass 2026-10-24 (docs/runbooks/SECURITY_LEGAL.md): costs are
# approximate us-east-1 list prices.
variable "securityhub_fsbp_enabled" {
  type        = bool
  default     = false
  description = "Security Hub: AWS Foundational Security Best Practices (needs security_hub_enabled). ~$5-15/month."
}
variable "inspector_enabled" {
  type        = bool
  default     = false
  description = "Amazon Inspector for ECR images. ~$1-6/month."
}
variable "unused_access_analyzer_enabled" {
  type        = bool
  default     = false
  description = "IAM Access Analyzer unused access. ~$0.20 per role/user per month."
}
variable "s3_account_block_public_access" {
  type        = bool
  default     = true
  description = "Account-wide S3 Block Public Access. Free."
}
variable "critical_api_alerts_enabled" {
  type        = bool
  default     = true
  description = "Alerts on key deletion, CloudTrail off, backup vault/lock deletion, root use. Free."
}
variable "documents_data_events" {
  type        = bool
  default     = false
  description = "CloudTrail data events on the documents bucket. ~$0.10 per 100 000 events."
}
variable "audit_logs_enabled" {
  type        = bool
  default     = false
  description = "Locked log bucket: ALB access log, documents access log, VPC flow logs. ~$2-12/month."
}
variable "audit_logs_retention_days" {
  type    = number
  default = 400
}
variable "audit_logs_object_lock" {
  type        = bool
  default     = false
  description = "S3 Object Lock on the audit log bucket (irreversible per bucket). WARNING (AWS docs, checked 2026-10-24): a bucket with Object Lock cannot receive S3 server access logs, so with this on the documents access log (modules/s3) stops being delivered. Keep false; the bucket already denies deletes by IAM and versioning keeps history."
}
variable "vpc_flow_logs_traffic" {
  type    = string
  default = "ALL"
}
variable "macie_enabled" {
  type        = bool
  default     = false
  description = "Amazon Macie monthly sensitive-data scan of the documents bucket. ~$1 per GB inspected x sampling."
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

# AWS guardrails pass 2026-10-25 (docs/runbooks/aws-guardrails.md)
variable "config_enabled" {
  type        = bool
  default     = false
  description = "AWS Config recorder + 11 managed rules. ~$1-4/month. One recorder per account and region: turn on in ONE env if prod and staging share an account."
}
variable "config_retention_days" {
  type    = number
  default = 400
}
variable "break_glass_enabled" {
  type        = bool
  default     = false
  description = "Emergency administrator role (MFA, named principals, pages on use). Free."
}
variable "break_glass_principal_arns" {
  type        = list(string)
  default     = []
  description = "Named IAM users/roles that may assume the break-glass role."
}
variable "cloudtrail_athena_enabled" {
  type        = bool
  default     = true
  description = "Athena + saved CloudTrail queries. ~$0 idle."
}
variable "anomaly_to_alerts_topic" {
  type        = bool
  default     = true
  description = "Cost Anomaly findings also to the alerts topic (free)."
}

# S4-1 (audit 2026-10-25): separate `ops` role for the admin scale / launch /
# cost calls. Order: ship the API release with OPS_ROLE_ARN support, then set
# ops_role_split = true and ops_role_external_id in the tfvars secret.
# docs/runbooks/aws-guardrails.md.
variable "ops_role_split" {
  type    = bool
  default = false
}
variable "ops_role_external_id" {
  type      = string
  default   = ""
  sensitive = true
}

variable "api_min_tasks" {
  type        = number
  default     = null
  description = "Separate api floor (null = min_tasks). 2 = one api task per AZ (S4-11)."
}

# S4-3 / S4-6 (audit 2026-10-25): see modules/stack/main.tf and
# docs/runbooks/infra-hardening.md for the owner steps.
variable "adopt_existing_database" {
  type    = bool
  default = false
}
variable "database_deletion_protection" {
  type    = bool
  default = true
}
variable "rds_cross_region_backups" {
  type    = bool
  default = false
}
variable "rds_cross_region_backup_retention_days" {
  type    = number
  default = 14
}

variable "replicate_media" {
  type        = bool
  default     = true
  description = "S4-5: copy new media objects to the replica Region (delete markers stay behind). Costs the media storage in us-west-2."
}

# S4-7 / S4-8 / S4-10 (audit 2026-10-25): load balancer and edge rules.
variable "waf_device_header" {
  type    = string
  default = "" # "x-device-id" turns on the per-device rules (+$2/month)
}
variable "waf_auth_rules_enabled" {
  type    = bool
  default = false
}
variable "waf_auth_rate_action" {
  type    = string
  default = "count"
}
variable "alb_deletion_protection" {
  type    = bool
  default = true
}
variable "alb_least_outstanding_requests" {
  type    = bool
  default = false
}
variable "alb_websocket_target_group" {
  type    = bool
  default = false
}
