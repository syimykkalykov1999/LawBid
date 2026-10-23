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
  default = 200
}
variable "create_anomaly_monitor" {
  type        = bool
  default     = true
  description = "false when the AWS account already has a service-level Cost Anomaly monitor (one allowed per account)."
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
variable "create_database" {
  type    = bool
  default = false
}
variable "database_instance_class" {
  type    = string
  default = "db.t4g.medium"
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
variable "cdn_waf_rate_limit_per_5m" {
  type    = number
  default = 2000
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
