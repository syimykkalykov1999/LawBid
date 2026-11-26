# C5 (THIRD_PASS_B 26.11, High): the pipeline role could rewrite its own IAM.
# `OwnRolesOnly` allowed PutRolePolicy / DeleteRolePolicy / AttachRolePolicy /
# UpdateAssumeRolePolicy on role/lawbid-prod-*, which matched the deploy role
# itself: an inline "*" policy (PutRolePolicy has no iam:PolicyARN, so
# NoAdminPolicy never matched it) or deleting the inline policy that holds
# NeverLoseData / KeepThePrimaryDatabase meant full AWS admin for any code that
# got an OIDC token in a trusted job (Rhino Security «IAM privilege escalation
# methods»: PutRolePolicy, AttachRolePolicy, UpdateAssumeRolePolicy).
#
# The fix is the AWS IAM user guide pattern «Permissions boundaries for IAM
# entities» -> «Delegating responsibility to others using permissions
# boundaries» (statements CreateOrChangeOnlyWithBoundary, NoBoundaryPolicyEdit,
# NoBoundaryUserDelete), applied to roles:
#   1. the pipeline may create a role, or give a role a policy, ONLY when that
#      role carries the boundary below (condition iam:PermissionsBoundary);
#   2. it may never remove a boundary, nor edit the boundary or guard policies;
#   3. it may never write IAM on the bootstrap roles (the GitHub OIDC roles that
#      hold the Deny statements and the trust, and break-glass), itself included.
# Explicit Deny wins over every Allow (IAM policy evaluation logic), so the
# ReadOnly / inline / managed allows of the role cannot undo it.
# Owner applies this folder (STRICT_RULES «Только владелец»: IAM).

locals {
  ci_boundary_name = "${local.name}-ci-boundary"
  ci_boundary_arn  = "arn:aws:iam::${local.account}:policy/${local.ci_boundary_name}"
  bootstrap_role_arns = [
    for n in local.bootstrap_role_names : "arn:aws:iam::${local.account}:role/${n}"
  ]
  ci_guarded_policy_arns = [
    local.ci_boundary_arn,
    "arn:aws:iam::${local.account}:policy/${local.name}-ci-iam",
    "arn:aws:iam::${local.account}:policy/${local.name}-ci-guard",
    "arn:aws:iam::${local.account}:policy/${local.name}-infra-apply-extra",
  ]
  # Every IAM action that changes something (Get*/List*/Simulate*/Generate*
  # stay allowed: Terraform refresh and rights-gate.mjs read roles).
  iam_write_actions = [
    "iam:Add*", "iam:Attach*", "iam:Change*", "iam:Create*", "iam:Deactivate*",
    "iam:Delete*", "iam:Detach*", "iam:Enable*", "iam:PassRole", "iam:Put*",
    "iam:Remove*", "iam:Reset*", "iam:Resync*", "iam:Set*", "iam:Tag*",
    "iam:Untag*", "iam:Update*", "iam:Upload*",
  ]
}

# --- The boundary every role the pipeline creates must carry -----------------
# A boundary only caps: the role's own policies still decide what it may do.
# Everything is allowed inside it EXCEPT what would let a pipeline-made role
# escalate (any IAM write but iam:PassRole, which the ECS / Backup / Lambda
# roles use with their own iam:PassedToService condition) or lose data
# (the same list as NeverLoseData in infra-apply.tf).
data "aws_iam_policy_document" "ci_boundary" {
  # The cap: anything the role's own policies allow, except IAM writes
  # (iam:PassRole stays). The Deny statements below say the same explicitly.
  statement {
    sid         = "EverythingTheRolesOwnPoliciesAllow"
    not_actions = [for a in local.iam_write_actions : a if a != "iam:PassRole"]
    resources   = ["*"]
  }
  statement {
    sid       = "NoIamWrites"
    effect    = "Deny"
    actions   = [for a in local.iam_write_actions : a if a != "iam:PassRole"]
    resources = ["*"]
  }
  statement {
    sid    = "NoDataLossNoAccountChanges"
    effect = "Deny"
    actions = [
      "rds:DeleteDBCluster", "rds:DeleteDBClusterSnapshot",
      "s3:DeleteBucket", "s3:DeleteBucketPolicy", "s3:PutBucketPolicy",
      "kms:ScheduleKeyDeletion", "kms:DisableKey", "kms:PutKeyPolicy",
      "backup:DeleteBackupVault", "backup:DeleteRecoveryPoint", "backup:DeleteBackupPlan",
      "dynamodb:DeleteTable", "ecr:DeleteRepository",
      "elasticache:DeleteReplicationGroup", "elasticache:DeleteCacheCluster",
      "cloudtrail:StopLogging", "cloudtrail:DeleteTrail",
      "guardduty:DeleteDetector", "organizations:*", "account:Put*", "account:Delete*",
      "account:Enable*", "account:Disable*", "account:Close*",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "ci_boundary" {
  name        = local.ci_boundary_name
  description = "Permissions boundary of every role the CI pipeline creates (C5). Edited only from infra/bootstrap."
  policy      = data.aws_iam_policy_document.ci_boundary.json
}

# --- IAM rights of the pipeline roles + the guard (managed, KNOWN_ERRORS 170:
# the inline policies of one role share 10,240 characters) -------------------
data "aws_iam_policy_document" "ci_iam" {
  # Was the IAM half of `OwnRolesOnly`. Creating a role or adding rights to one
  # needs the boundary on it; PutRolePermissionsBoundary sets exactly that one
  # (the first apply after this bootstrap puts it on every existing role:
  # modules/* permissions_boundary, held by scripts/infra/rights-gate.mjs until
  # this policy exists).
  statement {
    sid = "OwnRolesWithBoundary"
    actions = [
      "iam:CreateRole", "iam:PutRolePolicy", "iam:AttachRolePolicy", "iam:PutRolePermissionsBoundary",
    ]
    resources = ["arn:aws:iam::${local.account}:role/lawbid-${var.env}-*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [local.ci_boundary_arn]
    }
  }
  # Removing rights or changing a role's settings cannot raise anything above
  # the boundary; the bootstrap roles are denied below.
  statement {
    sid = "OwnRolesOther"
    actions = [
      "iam:DeleteRole", "iam:UpdateRole", "iam:TagRole", "iam:UntagRole",
      "iam:DeleteRolePolicy", "iam:DetachRolePolicy", "iam:UpdateAssumeRolePolicy", "iam:PassRole",
    ]
    resources = ["arn:aws:iam::${local.account}:role/lawbid-${var.env}-*"]
  }
}

resource "aws_iam_policy" "ci_iam" {
  name        = "${local.name}-ci-iam"
  description = "IAM rights of the infra-apply role: only roles with the ci-boundary (C5)."
  policy      = data.aws_iam_policy_document.ci_iam.json
}

# The Deny half, on every pipeline role (deploy and infra-apply).
data "aws_iam_policy_document" "ci_guard" {
  # The AWS example's CreateOrChangeOnlyWithBoundary as a Deny: no other Allow
  # (ReadOnlyAccess, a future statement) can give these without the boundary.
  statement {
    sid       = "NothingWithoutTheBoundary"
    effect    = "Deny"
    actions   = ["iam:CreateRole", "iam:PutRolePolicy", "iam:AttachRolePolicy", "iam:PutRolePermissionsBoundary"]
    resources = ["*"]
    condition {
      test     = "StringNotEquals"
      variable = "iam:PermissionsBoundary"
      values   = [local.ci_boundary_arn]
    }
  }
  statement {
    sid       = "NeverRemoveTheBoundary"
    effect    = "Deny"
    actions   = ["iam:DeleteRolePermissionsBoundary", "iam:DeleteUserPermissionsBoundary"]
    resources = ["*"]
  }
  # AWS example NoBoundaryPolicyEdit: the boundary and these guard policies.
  statement {
    sid    = "NoGuardPolicyEdit"
    effect = "Deny"
    actions = [
      "iam:CreatePolicyVersion", "iam:DeletePolicy", "iam:DeletePolicyVersion",
      "iam:SetDefaultPolicyVersion", "iam:TagPolicy", "iam:UntagPolicy",
    ]
    resources = local.ci_guarded_policy_arns
  }
  # The bootstrap roles (deploy, build, infra-apply, ... break-glass): no IAM
  # write at all, including iam:PassRole and the trust policy.
  statement {
    sid       = "NeverTouchTheBootstrapRoles"
    effect    = "Deny"
    actions   = local.iam_write_actions
    resources = local.bootstrap_role_arns
  }
}

resource "aws_iam_policy" "ci_guard" {
  name        = "${local.name}-ci-guard"
  description = "Denies: no role without the ci-boundary, no boundary removal, no edit of the guard policies, no IAM write on the bootstrap roles (C5)."
  policy      = data.aws_iam_policy_document.ci_guard.json
}

# The deploy role only has iam:PassRole (ecs-tasks); the guard still denies it
# on the bootstrap roles. The infra-apply role gets its IAM rights from ci_iam
# only, capped by the same guard.
resource "aws_iam_role_policy_attachment" "deploy_ci_guard" {
  role       = aws_iam_role.deploy.name
  policy_arn = aws_iam_policy.ci_guard.arn
}

resource "aws_iam_role_policy_attachment" "infra_apply_ci_guard" {
  count      = var.infra_apply_enabled ? 1 : 0
  role       = aws_iam_role.infra_apply[0].name
  policy_arn = aws_iam_policy.ci_guard.arn
}

resource "aws_iam_role_policy_attachment" "infra_apply_ci_iam" {
  count      = var.infra_apply_enabled ? 1 : 0
  role       = aws_iam_role.infra_apply[0].name
  policy_arn = aws_iam_policy.ci_iam.arn
}

output "ci_boundary_arn" {
  description = "Permissions boundary of every role the pipeline creates (infra/envs/prod iam_permissions_boundary_enabled)."
  value       = aws_iam_policy.ci_boundary.arn
}
