# Break-glass (2026-10-25): an emergency administrator role for the day the
# normal way in (SSO / deploy role) is broken. Nobody uses it daily.
#   * assumed ONLY by the named principals in `trusted_principal_arns`
#     (never "the whole account"),
#   * only with MFA, and the MFA code must be fresh (`max_mfa_age_seconds`),
#   * a 1-hour session at most (the IAM minimum for max_session_duration;
#     ask for 900 s when assuming),
#   * every assumption (and every refused attempt) sends a line to the
#     critical SNS topic (the one that pages), via EventBridge on CloudTrail.
# Runbook: docs/runbooks/break-glass.md. Free; default OFF.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "name" { type = string }
variable "enabled" {
  type    = bool
  default = false
}
variable "trusted_principal_arns" {
  type        = list(string)
  default     = []
  description = "IAM users/roles allowed to assume the role (named, e.g. arn:aws:iam::123:user/owner). Required when enabled."
}
variable "critical_topic_arn" {
  type        = string
  description = "SNS topic that is told whenever the role is assumed (modules/monitoring critical topic)."
}
variable "policy_arns" {
  type        = list(string)
  default     = ["arn:aws:iam::aws:policy/AdministratorAccess"]
  description = "Managed policies of the role."
}
variable "max_session_seconds" {
  type    = number
  default = 3600
}
variable "max_mfa_age_seconds" {
  type    = number
  default = 900
}
variable "tags" {
  type    = map(string)
  default = {}
}

locals {
  on        = var.enabled ? 1 : 0
  role_name = "${var.name}-break-glass"
}

data "aws_iam_policy_document" "trust" {
  count = local.on
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "AWS"
      identifiers = var.trusted_principal_arns
    }
    condition {
      test     = "Bool"
      variable = "aws:MultiFactorAuthPresent"
      values   = ["true"]
    }
    condition {
      test     = "NumericLessThan"
      variable = "aws:MultiFactorAuthAge"
      values   = [tostring(var.max_mfa_age_seconds)]
    }
  }
}

resource "aws_iam_role" "this" {
  count                = local.on
  name                 = local.role_name
  description          = "Emergency administrator. MFA only, named principals, every use pages the owner."
  assume_role_policy   = data.aws_iam_policy_document.trust[0].json
  max_session_duration = var.max_session_seconds
  tags                 = var.tags

  lifecycle {
    precondition {
      condition     = length(var.trusted_principal_arns) > 0
      error_message = "break-glass: trusted_principal_arns must name at least one user or role."
    }
  }
}

resource "aws_iam_role_policy_attachment" "this" {
  for_each   = var.enabled ? toset(var.policy_arns) : toset([])
  role       = aws_iam_role.this[0].name
  policy_arn = each.value
}

# Every AssumeRole of this role, also a refused one (errorCode set), reaches
# the critical topic. STS events of regional endpoints appear in the region
# of the endpoint; the global endpoint is us-east-1. Run in the stack region.
resource "aws_cloudwatch_event_rule" "assumed" {
  count       = local.on
  name        = "${var.name}-break-glass-assumed"
  description = "The break-glass role was assumed (or someone tried)"
  event_pattern = jsonencode({
    source      = ["aws.sts"]
    detail-type = ["AWS API Call via CloudTrail"]
    detail = {
      eventName = ["AssumeRole"]
      requestParameters = {
        roleArn = [aws_iam_role.this[0].arn]
      }
    }
  })
  tags = var.tags
}

resource "aws_cloudwatch_event_target" "assumed" {
  count     = local.on
  rule      = aws_cloudwatch_event_rule.assumed[0].name
  target_id = "critical"
  arn       = var.critical_topic_arn
  input_transformer {
    input_paths = {
      who    = "$.detail.userIdentity.arn"
      ip     = "$.detail.sourceIPAddress"
      region = "$.region"
      error  = "$.detail.errorCode"
    }
    input_template = "\"BREAK-GLASS role used by <who> from <ip> in <region> (error, if refused: <error>). If you did not do this, treat it as an incident now (docs/runbooks/break-glass.md).\""
  }
}

output "role_arn" { value = one(aws_iam_role.this[*].arn) }
output "role_name" { value = local.role_name }
