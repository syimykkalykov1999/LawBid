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
  default = "10.20.0.0/16"
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
# docs/06 §6.2: staging is the reduced-size copy.
variable "redis_node_type" {
  type    = string
  default = "cache.t4g.small"
}
variable "redis_replicas" {
  type    = number
  default = 1
}
variable "api_max_tasks" {
  type    = number
  default = 4
}
variable "worker_max_tasks" {
  type    = number
  default = 2
}
variable "p95_target_ms" {
  type    = number
  default = 600
}
# Load/cost review: staging runs one NAT and skips the KMS interface
# endpoint (reachable through the NAT), prod keeps one NAT per AZ. Owner
# 2026-10-22: Secrets Manager joins ECR and logs (same set as prod launch),
# all in the first AZ only (half the hourly price).
variable "nat_per_az" {
  type    = bool
  default = false
}
variable "interface_endpoints" {
  type    = list(string)
  default = ["ecr.api", "ecr.dkr", "logs", "secretsmanager"]
}
variable "interface_endpoint_azs" {
  type    = number
  default = 1
}

# Reliability (owner 2026-10-22): staging stays cheap — no Multi-AZ, no
# AWS Backup plan; worker queue-depth scaling is on so it is tested here
# before prod.
variable "database_multi_az" {
  type    = bool
  default = false
}
variable "db_autoscale_enabled" {
  type        = bool
  default     = false
  description = "Database autoscale (docs/architecture/DB_AUTOSCALE.md). Off in staging: single-AZ, a resize would be minutes of downtime."
}
variable "redis_autoscale_enabled" {
  type        = bool
  default     = false
  description = "Redis autoscale (docs/architecture/REDIS_AUTOSCALE.md). Off in staging."
}
variable "backup_enabled" {
  type    = bool
  default = false
}
variable "worker_jobs_per_task" {
  type    = number
  default = 50
}
variable "admin_allowed_cidrs" {
  type    = list(string)
  default = []
}
variable "min_tasks" {
  type        = number
  default     = 2
  description = "Minimum api and worker tasks (autoscaling floor). 1 = launch size, 2+ = survives a lost AZ."
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
variable "cpu_architecture" {
  type    = string
  default = "X86_64"
}
variable "monthly_budget_usd" {
  type    = number
  default = 50
}
variable "create_anomaly_monitor" {
  type        = bool
  default     = true
  description = "false when the AWS account already has a service-level Cost Anomaly monitor (one allowed per account)."
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

# Security research #5 (2026-10-22): WAF, cloud detector, container.
variable "waf_otp_rate_limit_per_5m" {
  type    = number
  default = 20
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
variable "dmarc_policy" {
  type    = string
  default = "quarantine"
}
variable "extra_secrets" {
  type        = list(string)
  default     = []
  description = "Optional env-var secrets; add a name only after its value is set in Secrets Manager."
}
variable "documents_cdn_public_key_pem" {
  type        = string
  default     = ""
  description = "PEM public key for CloudFront signed URLs on private media (see envs/prod)."
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
  type    = bool
  default = false
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
