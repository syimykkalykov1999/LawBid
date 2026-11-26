# C5 (THIRD_PASS_B 26.11, AWS «Permissions boundaries for IAM entities»):
# the boundary every role of this module carries when the CI pipeline manages
# it (infra/bootstrap/ci-guard.tf lets the pipeline create or extend a role
# only with this boundary on it). null = no boundary (envs without it).
variable "permissions_boundary_arn" {
  type        = string
  default     = null
  description = "ARN of the IAM permissions boundary (lawbid-<env>-ci-boundary) put on every role of this module; null = none."
}
