# C5 + C4 (THIRD_PASS_B 26.11): the pipeline roles can not change themselves
# or the roles that hold the Deny statements, every role they create or extend
# needs the ci-boundary, and each OIDC role trusts only its own workflow files.
# terraform test with mock providers: no AWS, no state.
#   terraform -chdir=infra/bootstrap init -backend=false
#   terraform -chdir=infra/bootstrap test
# The mocked policy documents render "{}", so the asserts read the statements
# as written (the same inputs AWS receives as JSON).

mock_provider "aws" {
  override_during = plan
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}", minified_json = "{}" }
  }
}
mock_provider "aws" {
  override_during = plan
  alias           = "dr"
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}", minified_json = "{}" }
  }
}
mock_provider "aws" {
  override_during = plan
  alias           = "replica"
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}", minified_json = "{}" }
  }
}

variables {
  infra_apply_enabled = true
}

# imports.tf adopts live resources; a mock provider can not import, so the
# imported resources are overridden (terraform test docs, override_resource).
override_resource {
  override_during = plan
  target          = aws_s3_bucket.tfstate
  values          = { arn = "arn:aws:s3:::lawbid-prod-tfstate", id = "lawbid-prod-tfstate", bucket = "lawbid-prod-tfstate" }
}
override_resource {
  override_during = plan
  target          = aws_s3_bucket_versioning.tfstate
}
override_resource {
  override_during = plan
  target          = aws_s3_bucket_server_side_encryption_configuration.tfstate
}
override_resource {
  override_during = plan
  target          = aws_s3_bucket_public_access_block.tfstate
}
override_resource {
  override_during = plan
  target          = aws_dynamodb_table.tflock
  values          = { arn = "arn:aws:dynamodb:us-east-1:123456789012:table/lawbid-prod-tflock" }
}
override_resource {
  override_during = plan
  target          = aws_ecr_repository.app
  values          = { arn = "arn:aws:ecr:us-east-1:123456789012:repository/lawbid-app" }
}
override_resource {
  override_during = plan
  target          = aws_acm_certificate.app
}
override_resource {
  override_during = plan
  target          = aws_iam_openid_connect_provider.github
  values          = { arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" }
}
override_resource {
  override_during = plan
  target          = aws_iam_role.deploy
  values          = { name = "lawbid-prod-github-deploy", arn = "arn:aws:iam::123456789012:role/lawbid-prod-github-deploy" }
}
override_resource {
  override_during = plan
  target          = aws_iam_role_policy.deploy
  values          = { id = "lawbid-prod-github-deploy:deploy", name = "deploy", name_prefix = "", policy = "{}", role = "lawbid-prod-github-deploy" }
}

run "pipeline_roles_cannot_touch_the_bootstrap_roles" {
  command = plan
  plan_options {
    # Not aws_iam_role_policy.deploy: a mock provider can not import it (imports.tf).
    target = [
      data.aws_iam_policy_document.ci_guard, data.aws_iam_policy_document.ci_iam, data.aws_iam_policy_document.ci_boundary,
      data.aws_iam_policy_document.deploy_infra_apply, data.aws_iam_policy_document.deploy_infra_apply_extra,
      data.aws_iam_policy_document.deploy, data.aws_iam_policy_document.build, data.aws_iam_policy_document.deploy_trust,
      data.aws_iam_policy_document.infra_apply_trust, data.aws_iam_policy_document.build_trust, aws_iam_role_policy_attachment.deploy_ci_guard,
      aws_iam_role_policy_attachment.infra_apply_ci_guard, aws_iam_role_policy.deploy_infra_apply,
      aws_iam_role_policy_attachment.deploy_infra_readonly, aws_iam_role_policy_attachment.deploy_infra_apply_extra,
    ]
  }

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.ci_guard.statement : alltrue([
        contains(s.resources, "arn:aws:iam::123456789012:role/lawbid-prod-github-deploy"),
        contains(s.resources, "arn:aws:iam::123456789012:role/lawbid-prod-github-infra-apply"),
        contains(s.resources, "arn:aws:iam::123456789012:role/lawbid-prod-github-build"),
        contains(s.resources, "arn:aws:iam::123456789012:role/lawbid-prod-break-glass"),
        alltrue([for a in ["iam:Put*", "iam:Delete*", "iam:Attach*", "iam:Detach*", "iam:Update*", "iam:PassRole", "iam:Tag*"] : contains(s.actions, a)]),
      ]) if s.sid == "NeverTouchTheBootstrapRoles" && s.effect == "Deny"
    ]) && length([for s in data.aws_iam_policy_document.ci_guard.statement : s if s.sid == "NeverTouchTheBootstrapRoles" && s.effect == "Deny"]) == 1
    error_message = "The guard denies every IAM write (PutRolePolicy, DeleteRolePolicy, AttachRolePolicy, UpdateAssumeRolePolicy, PassRole ...) on the deploy, infra-apply, build and break-glass roles."
  }

  assert {
    condition     = aws_iam_role_policy_attachment.deploy_ci_guard.role == "lawbid-prod-github-deploy" && aws_iam_role_policy_attachment.infra_apply_ci_guard[0].role == "lawbid-prod-github-infra-apply"
    error_message = "The guard is attached to both pipeline roles that hold IAM rights."
  }

  assert {
    condition = length([
      for s in data.aws_iam_policy_document.ci_guard.statement : s
      if s.sid == "NoGuardPolicyEdit" && s.effect == "Deny" &&
      contains(s.resources, "arn:aws:iam::123456789012:policy/lawbid-prod-ci-boundary") &&
      contains(s.resources, "arn:aws:iam::123456789012:policy/lawbid-prod-ci-guard") &&
      contains(s.actions, "iam:CreatePolicyVersion") && contains(s.actions, "iam:SetDefaultPolicyVersion")
    ]) == 1
    error_message = "The boundary and the guard policies can not be rewritten by the pipeline (AWS example NoBoundaryPolicyEdit)."
  }

  assert {
    condition     = length([for s in data.aws_iam_policy_document.ci_guard.statement : s if s.effect == "Deny" && contains(s.actions, "iam:DeleteRolePermissionsBoundary")]) == 1
    error_message = "A boundary can never be removed."
  }
}

run "roles_only_with_the_boundary" {
  command = plan
  plan_options {
    # Not aws_iam_role_policy.deploy: a mock provider can not import it (imports.tf).
    target = [
      data.aws_iam_policy_document.ci_guard, data.aws_iam_policy_document.ci_iam, data.aws_iam_policy_document.ci_boundary,
      data.aws_iam_policy_document.deploy_infra_apply, data.aws_iam_policy_document.deploy_infra_apply_extra,
      data.aws_iam_policy_document.deploy, data.aws_iam_policy_document.build, data.aws_iam_policy_document.deploy_trust,
      data.aws_iam_policy_document.infra_apply_trust, data.aws_iam_policy_document.build_trust, aws_iam_role_policy_attachment.deploy_ci_guard,
      aws_iam_role_policy_attachment.infra_apply_ci_guard, aws_iam_role_policy.deploy_infra_apply,
      aws_iam_role_policy_attachment.deploy_infra_readonly, aws_iam_role_policy_attachment.deploy_infra_apply_extra,
    ]
  }

  assert {
    condition = length([
      for s in data.aws_iam_policy_document.ci_guard.statement : s
      if s.sid == "NothingWithoutTheBoundary" && s.effect == "Deny" &&
      alltrue([for a in ["iam:CreateRole", "iam:PutRolePolicy", "iam:AttachRolePolicy", "iam:PutRolePermissionsBoundary"] : contains(s.actions, a)]) &&
      length([for c in s.condition : c if c.test == "StringNotEquals" && c.variable == "iam:PermissionsBoundary" && contains(c.values, "arn:aws:iam::123456789012:policy/lawbid-prod-ci-boundary")]) == 1
    ]) == 1
    error_message = "Creating a role or giving it a policy is denied unless the role carries lawbid-prod-ci-boundary."
  }

  assert {
    condition = length([
      for s in data.aws_iam_policy_document.ci_iam.statement : s
      if s.sid == "OwnRolesWithBoundary" &&
      length([for c in s.condition : c if c.test == "StringEquals" && c.variable == "iam:PermissionsBoundary"]) == 1
    ]) == 1
    error_message = "The role-writing Allow carries the boundary condition."
  }

  # No other Allow in the infra-apply documents grants role policy writes
  # (the old OwnRolesOnly is gone from the inline policy).
  assert {
    condition = length(flatten([
      for s in concat(data.aws_iam_policy_document.deploy_infra_apply.statement, data.aws_iam_policy_document.deploy_infra_apply_extra.statement, data.aws_iam_policy_document.deploy.statement) : [
        for a in s.actions : a if can(regex("^iam:(Create|Put|Attach|Delete|Detach|Update)Role", a)) || a == "iam:UpdateAssumeRolePolicy" || a == "iam:*"
      ] if s.effect != "Deny"
    ])) == 0
    error_message = "Role writes are granted only by ci-iam (with the boundary)."
  }

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.ci_boundary.statement :
      contains(s.actions, "iam:Put*") && contains(s.actions, "iam:Create*") && !contains(s.actions, "iam:PassRole")
      if s.sid == "NoIamWrites" && s.effect == "Deny"
    ])
    error_message = "Roles inside the boundary can not write IAM (iam:PassRole stays for ECS / Backup / Lambda)."
  }

  # Every existing Deny of the infra-apply policy is kept.
  assert {
    condition = alltrue([
      for sid in ["NeverLoseData", "KeepSecrets", "KeepThePrimaryDatabase", "NoAdminPolicy"] :
      length([for s in data.aws_iam_policy_document.deploy_infra_apply.statement : s if s.sid == sid && s.effect == "Deny"]) == 1
    ])
    error_message = "NeverLoseData, KeepSecrets, KeepThePrimaryDatabase and NoAdminPolicy stay."
  }
}

run "each_oidc_role_trusts_only_its_workflow_files" {
  command = plan
  plan_options {
    # Not aws_iam_role_policy.deploy: a mock provider can not import it (imports.tf).
    target = [
      data.aws_iam_policy_document.ci_guard, data.aws_iam_policy_document.ci_iam, data.aws_iam_policy_document.ci_boundary,
      data.aws_iam_policy_document.deploy_infra_apply, data.aws_iam_policy_document.deploy_infra_apply_extra,
      data.aws_iam_policy_document.deploy, data.aws_iam_policy_document.build, data.aws_iam_policy_document.deploy_trust,
      data.aws_iam_policy_document.infra_apply_trust, data.aws_iam_policy_document.build_trust, aws_iam_role_policy_attachment.deploy_ci_guard,
      aws_iam_role_policy_attachment.infra_apply_ci_guard, aws_iam_role_policy.deploy_infra_apply,
      aws_iam_role_policy_attachment.deploy_infra_readonly, aws_iam_role_policy_attachment.deploy_infra_apply_extra,
    ]
  }

  assert {
    condition = sort(local.deploy_workflow_refs) == sort(flatten([
      for f in ["deploy.yml", "rollback.yml", "web-deploy.yml", "seo-deploy.yml", "self-check.yml"] : [
        "syimykkalykov1999/LawBid/.github/workflows/${f}@refs/heads/main",
        "syimykkalykov1999/lawbid/.github/workflows/${f}@refs/heads/main",
        "syimykkalykov1999@91685781/LawBid@1400978845/.github/workflows/${f}@refs/heads/main",
      ]
    ]))
    error_message = "The deploy role trusts exactly its five workflow files on main (no `*` for the file)."
  }

  assert {
    condition     = length([for r in concat(local.deploy_workflow_refs, local.build_workflow_refs) : r if strcontains(r, "workflows/*")]) == 0
    error_message = "No wildcard workflow file."
  }

  assert {
    condition = length([
      for s in data.aws_iam_policy_document.deploy_trust.statement : s
      if length([for c in s.condition : c if c.variable == "token.actions.githubusercontent.com:sub" && length([for v in c.values : v if strcontains(v, "infra-apply")]) > 0]) > 0
    ]) == 0
    error_message = "The deploy role no longer trusts the infra-apply environment."
  }

  assert {
    condition = alltrue(flatten([
      for s in data.aws_iam_policy_document.infra_apply_trust.statement : [
        for c in s.condition : (
          c.variable == "token.actions.githubusercontent.com:sub" ? alltrue([for v in c.values : endswith(v, ":environment:infra-apply")]) :
          c.variable == "token.actions.githubusercontent.com:job_workflow_ref" ? alltrue([for v in c.values : endswith(v, "/.github/workflows/infra-apply.yml@refs/heads/main")]) : true
        )
      ]
    ]))
    error_message = "The infra-apply role trusts only infra-apply.yml on main in the infra-apply environment."
  }

  assert {
    condition     = length(local.build_workflow_refs) == 9 && alltrue([for r in local.build_workflow_refs : can(regex("/(deploy|build-pgbouncer|mirror-clamav)\\.yml@refs/heads/main$", r))])
    error_message = "The build role trusts only deploy.yml, build-pgbouncer.yml and mirror-clamav.yml."
  }

  assert {
    condition = alltrue(flatten([
      for s in data.aws_iam_policy_document.build.statement : [for a in s.actions : startswith(a, "ecr:")]
    ]))
    error_message = "The build role can only use ECR."
  }

  assert {
    condition = length(flatten([
      for s in data.aws_iam_policy_document.deploy.statement : [for a in s.actions : a if a == "ecr:PutImage" || a == "ecr:InitiateLayerUpload"]
    ])) == 0
    error_message = "The deploy role no longer pushes images."
  }

  assert {
    condition     = aws_iam_role_policy.deploy_infra_apply[0].role == "lawbid-prod-github-infra-apply" && aws_iam_role_policy_attachment.deploy_infra_readonly[0].role == "lawbid-prod-github-infra-apply" && aws_iam_role_policy_attachment.deploy_infra_apply_extra[0].role == "lawbid-prod-github-infra-apply"
    error_message = "The infra-apply rights live on the infra-apply role, not on the deploy role."
  }
}
