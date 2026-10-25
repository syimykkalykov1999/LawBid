# Organization guardrails (2026-10-25) — NOT APPLIED until the owner creates
# an AWS Organization (docs/runbooks/org-accounts.md). Run this module from
# the MANAGEMENT account with a provider for it. Service control policies
# (SCPs) never grant anything: they cap what any identity in a member account
# can do, even an administrator. They do not affect the management account.
#
# Four policies, modelled on the AWS Organizations "Service control policy
# examples" (general: deny regions outside a list, prevent root user actions,
# prevent disabling CloudTrail / Config / GuardDuty, prevent IAM access-key
# creation):
#   1. protect-security-services  — no stop/delete of CloudTrail, Config,
#      GuardDuty, Access Analyzer, Security Hub, nor of the log-bucket
#      protections;
#   2. region-lock                — nothing outside `allowed_regions`, except
#      the global-service actions that AWS lists as region-less (NotAction);
#   3. no-iam-access-keys         — iam:CreateAccessKey denied except for the
#      break-glass role (modules/break-glass); people use SSO / roles;
#   4. root-lockdown              — the root user of a member account may do
#      almost nothing (MFA setup, password, billing views stay allowed).
# A target can have 5 policies attached directly, one is FullAWSAccess, so
# these four fit exactly.
#
# SAFETY: `exempt_principal_arns` (ArnLike patterns) is applied to 1-3: put
# the Terraform/deploy role there, or `terraform apply` itself (UpdateTrail,
# detector features) is refused. Start by attaching to ONE test OU.
# Cost: $0 (Organizations and SCPs are free).
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "enabled" {
  type        = bool
  default     = false
  description = "Create and attach the policies. Needs an Organization with the SCP policy type enabled."
}
variable "target_ids" {
  type        = list(string)
  default     = []
  description = "Organization root (r-xxxx), OU (ou-xxxx) or account IDs the SCPs attach to. Use a test OU first."
}
variable "allowed_regions" {
  type    = list(string)
  default = ["us-east-1", "us-west-2"]
}
variable "break_glass_role_name" {
  type        = string
  default     = "lawbid-break-glass"
  description = "Role (any path, any account) that may create IAM access keys and is exempt from the region lock and security-service rules."
}
variable "exempt_principal_arns" {
  type        = list(string)
  default     = []
  description = "ArnLike patterns exempt from policies 1-3, e.g. arn:aws:iam::*:role/lawbid-terraform-deploy. The break-glass role is always exempt."
}
variable "extra_global_actions" {
  type        = list(string)
  default     = []
  description = "More region-less actions to exempt from the region lock (a service that turns out to be global)."
}
variable "protect_security_services" {
  type    = bool
  default = true
}
variable "region_lock" {
  type    = bool
  default = true
}
variable "deny_iam_access_keys" {
  type    = bool
  default = true
}
variable "root_lockdown" {
  type    = bool
  default = true
}

locals {
  exempt = concat(
    ["arn:aws:iam::*:role/${var.break_glass_role_name}"],
    var.exempt_principal_arns,
  )
  exempt_condition = {
    ArnNotLike = { "aws:PrincipalARN" = local.exempt }
  }

  # AWS "deny all outside allowed regions" example: the actions of global /
  # us-east-1-endpoint services are NotAction'd so IAM, STS, Route 53,
  # CloudFront, Organizations, billing, support keep working. Verify the list
  # against the current AWS page before the first attach (it grows).
  global_actions = concat([
    "a4b:*", "access-analyzer:*", "account:*", "acm:*", "aws-marketplace-management:*",
    "aws-marketplace:*", "aws-portal:*", "billing:*", "budgets:*", "ce:*", "chime:*",
    "cloudfront:*", "config:*", "consolidatedbilling:*", "cur:*", "directconnect:*",
    "ec2:DescribeRegions", "ec2:DescribeTransitGateways", "ec2:DescribeVpnGateways",
    "freetier:*", "fms:*", "globalaccelerator:*", "health:*", "iam:*", "importexport:*",
    "invoicing:*", "mobileanalytics:*", "networkmanager:*", "organizations:*",
    "payments:*", "pricing:*", "route53:*", "route53domains:*", "route53-recovery-cluster:*",
    "route53-recovery-control-config:*", "route53-recovery-readiness:*",
    "s3:GetAccountPublic*", "s3:ListAllMyBuckets", "s3:ListMultiRegionAccessPoints",
    "s3:PutAccountPublic*", "shield:*", "sts:*", "support:*", "tax:*", "trustedadvisor:*",
    "waf-regional:*", "waf:*", "wafv2:*", "wellarchitected:*",
  ], var.extra_global_actions)

  protect_actions = [
    "cloudtrail:StopLogging", "cloudtrail:DeleteTrail", "cloudtrail:UpdateTrail",
    "cloudtrail:PutEventSelectors", "cloudtrail:PutInsightSelectors",
    "config:StopConfigurationRecorder", "config:DeleteConfigurationRecorder",
    "config:DeleteDeliveryChannel", "config:DeleteConfigRule", "config:DeleteEvaluationResults",
    "config:DeleteConformancePack", "config:DeleteOrganizationConfigRule",
    "guardduty:DeleteDetector", "guardduty:UpdateDetector", "guardduty:DeleteMembers",
    "guardduty:DisassociateFromMasterAccount", "guardduty:DisassociateFromAdministratorAccount",
    "guardduty:StopMonitoringMembers",
    "access-analyzer:DeleteAnalyzer",
    "securityhub:DisableSecurityHub", "securityhub:DeleteMembers",
    "securityhub:BatchDisableStandards", "securityhub:DisassociateFromAdministratorAccount",
  ]

  scp_protect = {
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyStopOrDeleteSecurityServices"
      Effect    = "Deny"
      Action    = local.protect_actions
      Resource  = "*"
      Condition = local.exempt_condition
    }]
  }

  scp_regions = {
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyOutsideAllowedRegions"
      Effect    = "Deny"
      NotAction = local.global_actions
      Resource  = "*"
      Condition = {
        StringNotEquals = { "aws:RequestedRegion" = var.allowed_regions }
        ArnNotLike      = { "aws:PrincipalARN" = local.exempt }
      }
    }]
  }

  scp_keys = {
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyIamAccessKeysExceptBreakGlass"
      Effect    = "Deny"
      Action    = ["iam:CreateAccessKey"]
      Resource  = "*"
      Condition = local.exempt_condition
    }]
  }

  # Root-only jobs that must keep working in a member account: MFA devices,
  # password, viewing the account/billing. Everything else is refused.
  scp_root = {
    Version = "2012-10-17"
    Statement = [{
      Sid    = "DenyRootUserMostActions"
      Effect = "Deny"
      NotAction = [
        "iam:CreateVirtualMFADevice", "iam:EnableMFADevice", "iam:ListMFADevices",
        "iam:ListVirtualMFADevices", "iam:ResyncMFADevice", "iam:DeactivateMFADevice",
        "iam:DeleteVirtualMFADevice", "iam:ChangePassword", "iam:GetAccountSummary",
        "iam:GetUser", "iam:ListAccountAliases", "sts:GetSessionToken",
        "account:Get*", "account:List*", "billing:Get*", "billing:View*",
        "aws-portal:View*", "support:*",
      ]
      Resource = "*"
      Condition = {
        StringLike = { "aws:PrincipalArn" = ["arn:aws:iam::*:root"] }
      }
    }]
  }

  policies = merge(
    var.protect_security_services ? { "protect-security-services" = local.scp_protect } : {},
    var.region_lock ? { "region-lock" = local.scp_regions } : {},
    var.deny_iam_access_keys ? { "no-iam-access-keys" = local.scp_keys } : {},
    var.root_lockdown ? { "root-lockdown" = local.scp_root } : {},
  )

  attachments = var.enabled ? {
    for pair in setproduct(keys(local.policies), var.target_ids) :
    "${pair[0]}/${pair[1]}" => { policy = pair[0], target = pair[1] }
  } : {}
}

resource "aws_organizations_policy" "scp" {
  for_each    = var.enabled ? local.policies : {}
  name        = "lawbid-${each.key}"
  description = "LawBid guardrail: ${each.key}"
  type        = "SERVICE_CONTROL_POLICY"
  content     = jsonencode(each.value)
}

resource "aws_organizations_policy_attachment" "scp" {
  for_each  = local.attachments
  policy_id = aws_organizations_policy.scp[each.value.policy].id
  target_id = each.value.target
}

output "policy_ids" { value = { for k, p in aws_organizations_policy.scp : k => p.id } }
