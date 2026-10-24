# Every variable has a harmless default so that `terraform destroy` (the end of
# a run, the watchdog) works with nothing but the backend settings; the
# workflow always passes the real values for apply (profiles/<profile>.tfvars
# plus the -var lines in .github/workflows/load-test.yml).

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
  default = "10.40.0.0/16" # prod 10.30, staging 10.20
}

variable "run_id" {
  type        = string
  default     = "manual"
  description = "GitHub run id; part of the state key and the RunId tag."
}
variable "created_at" {
  type        = string
  default     = "1970-01-01T00:00:00Z"
  description = "ISO time the run was created (tag CreatedAt; the watchdog destroys stacks older than 4 hours)."
}
variable "profile" {
  type    = string
  default = "smoke"
  validation {
    condition     = contains(["smoke", "m1", "m10", "calls-smoke", "calls-full"], var.profile)
    error_message = "profile: smoke, m1, m10, calls-smoke or calls-full (local runs on the Mac, not here)."
  }
}

# --- never production -------------------------------------------------------------
variable "domain" {
  type        = string
  default     = "lawbid-loadtest.invalid"
  description = ".invalid never resolves and Let's Encrypt refuses it: nothing in this stack can be mistaken for, or disturb, the real domain."
  validation {
    condition     = !contains(["lawbid.dev", "lawbid.app", "api.lawbid.dev", "api.lawbid.app"], var.domain)
    error_message = "REFUSING: the load-test stack must not use a production domain."
  }
}
variable "api_host" {
  type    = string
  default = "api.lawbid-loadtest.invalid"
  validation {
    condition     = can(regex("loadtest", var.api_host)) && !contains(["api.lawbid.dev", "api.lawbid.app"], var.api_host)
    error_message = "REFUSING: api_host must contain \"loadtest\" and must not be a production API host."
  }
}
variable "admin_host" {
  type    = string
  default = "admin.lawbid-loadtest.invalid"
  validation {
    condition     = can(regex("loadtest", var.admin_host))
    error_message = "admin_host must contain \"loadtest\"."
  }
}
variable "certificate_arn" {
  type        = string
  default     = "arn:aws:acm:us-east-1:000000000000:certificate/unset"
  description = "Any valid ACM certificate in this region (the ALB needs one for HTTPS; the generators do not verify it). Secret LOADTEST_CERTIFICATE_ARN."
}

# --- images ---------------------------------------------------------------------------
variable "api_image" {
  type    = string
  default = "unset"
}
variable "admin_image" {
  type    = string
  default = "unset"
}
# Owner 2026-10-24: the load tests run THROUGH our own PgBouncer (on by default
# here), so they prove it. Turn it off to compare with the direct connection.
variable "db_pooler_enabled" {
  type    = bool
  default = true
}
variable "pgbouncer_image" {
  type        = string
  default     = ""
  description = "<ECR_REGISTRY>/lawbid-pgbouncer:<tag>; the workflow passes it."
}
variable "clamav_image" {
  type    = string
  default = "clamav/clamav:1.4"
}
variable "cpu_architecture" {
  type    = string
  default = "X86_64"
}
variable "alert_emails" {
  type    = list(string)
  default = ["loadtest@lawbid-loadtest.invalid"]
}

# --- size (profiles/*.tfvars) --------------------------------------------------------
variable "database_instance_class" {
  type    = string
  default = "db.t4g.medium"
}
variable "redis_node_type" {
  type    = string
  default = "cache.t4g.small"
}
variable "api_max_tasks" {
  type    = number
  default = 2
  validation {
    condition     = var.api_max_tasks >= 1 && var.api_max_tasks <= 48
    error_message = "Hard cap per run: api_max_tasks 1..48 (loadtest/profiles.json limits.max_api_tasks)."
  }
}
variable "worker_max_tasks" {
  type    = number
  default = 1
  validation {
    condition     = var.worker_max_tasks >= 1 && var.worker_max_tasks <= 12
    error_message = "worker_max_tasks 1..12."
  }
}
variable "min_tasks" {
  type    = number
  default = 1
}
variable "generator_count" {
  type    = number
  default = 1
  validation {
    condition     = var.generator_count >= 1 && var.generator_count <= 6
    error_message = "Hard cap per run: generator_count 1..6 (loadtest/profiles.json limits.max_generators)."
  }
}
variable "generator_instance_type" {
  type    = string
  default = "c7g.xlarge"
}
variable "turn_second_enabled" {
  type    = bool
  default = false
}
variable "livekit_enabled" {
  type    = bool
  default = false
}
variable "growth" {
  type    = any
  default = {}
}
