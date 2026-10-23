# Load audit 6 (2026-10-23): growth switches, all off by default.
# Example (terraform.tfvars):
#   growth = { rds_read_replicas = 1 }
# Keys and the step of the growth ladder they belong to:
# modules/stack/growth.tf and docs/perf/GROWTH_LADDER_2026-10-23.md.
variable "growth" {
  type    = any
  default = {}
}
