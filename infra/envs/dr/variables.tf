# Stage 2 SRE (Б8): inputs of the disaster-recovery stack. Values: terraform.tfvars
# (copy terraform.tfvars.example). docs/runbooks/region-dr.md.
variable "region" {
  type        = string
  default     = "us-west-2"
  description = "DR region: where the database copies, images and secrets already are."
}
variable "replica_region" {
  type        = string
  default     = "us-east-2"
  description = "Second region of the DR stack (documents copy, backup key). Not us-east-1: that is the lost one."
}
variable "azs" {
  type    = list(string)
  default = ["us-west-2a", "us-west-2b"]
}
variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}
variable "restored_database_identifier" {
  type        = string
  description = "RDS identifier of the database restored from the vault lawbid-prod-db-dr (runbook step 2), e.g. lawbid-dr-postgres."
}
variable "image_tag" {
  type        = string
  description = "Tag of the release to run (the last good prod tag: the commit SHA). Its images must be in the DR ECR (replication or runbook step 3)."
  validation {
    condition     = can(regex("^[A-Za-z0-9._-]{1,128}$", var.image_tag))
    error_message = "image_tag must be a plain image tag."
  }
}
variable "domain" { type = string }
variable "api_host" { type = string }
variable "admin_host" { type = string }
variable "app_link_base_url" { type = string }
variable "certificate_arn" {
  type        = string
  description = "ACM certificate IN THE DR REGION for api_host and admin_host (a us-east-1 certificate cannot be used here)."
}
variable "web_host" {
  type    = string
  default = ""
}
variable "web_certificate_arn" {
  type        = string
  default     = ""
  description = "ACM certificate in us-east-1 for the website (CloudFront reads certificates only there; if us-east-1 is gone the website stays on the Cloudflare cache / status page)."
}
variable "dmarc_rua" { type = string }
variable "ses_from_address" { type = string }
variable "alert_emails" { type = list(string) }
variable "min_tasks" {
  type        = number
  default     = 0
  description = "0 = nothing runs (drill: prove the plan and the start, then destroy). The real day: the prod floor (2)."
}
variable "admin_tasks" {
  type    = number
  default = 0
}
variable "growth" {
  type    = any
  default = {}
}
