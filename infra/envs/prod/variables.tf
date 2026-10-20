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
}

variable "turn_enabled" {
  type        = bool
  default     = false
  description = "coturn relay for calls (modules/turn); docs/runbooks/TURN.md."
}
