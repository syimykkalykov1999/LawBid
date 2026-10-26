# Load audit 6 (2026-10-23): growth switches, all off by default.
# Example (terraform.tfvars):
#   growth = { rds_read_replicas = 1 }
# Keys and the step of the growth ladder they belong to:
# modules/stack/growth.tf and docs/perf/GROWTH_LADDER_2026-10-23.md.
variable "growth" {
  type    = any
  default = {}
}

# Owner 2026-10-26: infra switches from the admin. The admin writes growth
# keys (rds_read_replicas, opensearch_enabled) into growth.auto.tfvars.json
# under this name; they are merged OVER `growth` from terraform.tfvars, so a
# growth line kept there is not lost. Whitelist + JSON schema:
# apps/api/src/common/ops/infra-switches.ts, growth.auto.tfvars.schema.json.
variable "growth_switches" {
  type    = any
  default = {}
}
