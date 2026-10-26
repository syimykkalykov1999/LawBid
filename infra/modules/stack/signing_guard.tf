# S11-10: alert when an ECS task starts from an image without a cosign signature
# (modules/signing-guard). Off by default: enable it after the first signed
# release has run (SIGN_REQUIRED=true in GitHub), see docs/runbooks/DEPLOY_SAFETY.md.
variable "signing_guard_enabled" {
  type        = bool
  default     = false
  description = "EventBridge + Lambda: an alert on the alerts topic when a task starts from an unsigned image. Pennies per month."
}

module "signing_guard" {
  count               = var.signing_guard_enabled ? 1 : 0
  source              = "../signing-guard"
  name                = local.name
  cluster_arn         = module.ecs.cluster_arn
  alerts_topic_arn    = module.monitoring.alerts_topic_arn
  ecr_registry_host   = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.name}.amazonaws.com"
  ecr_repository_arns = [for r in ["lawbid-api", "lawbid-admin"] : "arn:aws:ecr:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:repository/${r}"]
}
