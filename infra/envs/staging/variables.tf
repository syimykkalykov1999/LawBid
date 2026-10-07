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
# Load/cost review: staging runs one NAT and skips the KMS/Secrets Manager
# interface endpoints (reachable through the NAT), prod keeps one NAT per AZ.
variable "nat_per_az" {
  type    = bool
  default = false
}
variable "interface_endpoints" {
  type    = list(string)
  default = ["ecr.api", "ecr.dkr", "logs"]
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
