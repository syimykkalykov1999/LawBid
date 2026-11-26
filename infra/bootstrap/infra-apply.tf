# Owner 2026-10-26: infra switches from the admin (docs/runbooks/
# infra-from-admin.md). The workflow `infra-apply.yml` runs `terraform plan`
# and `terraform apply` on prod with its OWN OIDC role (C4, 26.11; until then
# it was the deploy role). This file gives that role what the apply needs, and
# only when the owner turns it on:
#
#   infra_apply_enabled = true   ->  terraform apply in infra/bootstrap (owner)
#
# What `lawbid-prod-github-infra-apply` gets:
#   * trust ONLY for jobs of infra-apply.yml on main in the GitHub environment
#     `infra-apply` (below);
#   * the deploy role's own document (it rolls services, runs migrations);
#   * role writes only for roles with the ci-boundary, never the bootstrap
#     roles (ci-guard.tf, C5);
#   * AWS ReadOnlyAccess (Terraform reads every resource it manages);
#   * read/write of the prod state + lock, the prod tfvars backup;
#   * create / change / delete in the services the WHITELISTED switches touch
#     (apps/api/src/common/ops/infra-switches.ts): WAF, GuardDuty, Security Hub,
#     Inspector, Config, Macie, CloudTrail/Athena/Glue, logs, alarms, Synthetics,
#     Route 53 health checks, NAT / VPC endpoints / flow logs, ECS services,
#     the read replica, OpenSearch, S3 replication, Lambda (canary);
#   * an explicit DENY on everything that loses data or hands out keys:
#     deleting the primary database, any bucket, KMS key, backup vault or its
#     recovery points, secret, DynamoDB table, Redis, ECR repository; IAM
#     users / access keys; attaching AdministratorAccess. A Deny wins over any
#     Allow, so even a wrong plan cannot do these.
# The old risk (every main-branch workflow on the deploy role also held these
# rights) is gone with the split: the deploy role keeps only release rights.

variable "infra_apply_enabled" {
  type        = bool
  default     = false
  description = "Let the infra-apply workflow (environment infra-apply) plan and apply prod with the deploy role. Off until the owner finishes the steps in docs/runbooks/infra-from-admin.md."
}

# C4 (THIRD_PASS_B 26.11): the infra-apply rights had lived on the deploy role,
# so every main-branch job that could assume it (image builds, web deploy,
# self-check ...) held them too. They are on their own role now, trusted ONLY
# for jobs of infra-apply.yml on main in the GitHub environment `infra-apply`.
# The workflow reads secret AWS_INFRA_APPLY_ROLE_PROD (terraform output
# infra_apply_role_arn), falling back to AWS_DEPLOY_ROLE_PROD.
data "aws_iam_policy_document" "infra_apply_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [for r in local.repo_spellings : "repo:${r}:environment:infra-apply"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:job_workflow_ref"
      values   = [for r in local.repo_spellings : "${r}/.github/workflows/infra-apply.yml@refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "infra_apply" {
  count                = var.infra_apply_enabled ? 1 : 0
  name                 = "${local.name}-github-infra-apply"
  assume_role_policy   = data.aws_iam_policy_document.infra_apply_trust.json
  max_session_duration = var.deploy_max_session_seconds
  lifecycle {
    precondition {
      condition     = length(jsonencode(jsondecode(data.aws_iam_policy_document.infra_apply_trust.json))) <= 2048
      error_message = "The infra-apply role trust policy is longer than AWS allows (2048 characters, ACLSizePerRole)."
    }
  }
}

output "infra_apply_role_arn" {
  description = "Repository secret AWS_INFRA_APPLY_ROLE_PROD (infra-apply.yml)."
  value       = var.infra_apply_enabled ? aws_iam_role.infra_apply[0].arn : null
}

resource "aws_iam_role_policy_attachment" "deploy_infra_readonly" {
  count      = var.infra_apply_enabled ? 1 : 0
  role       = aws_iam_role.infra_apply[0].name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

data "aws_iam_policy_document" "deploy_infra_apply" {
  statement {
    sid       = "StateReadWrite"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:GetBucketLocation"]
    resources = [aws_s3_bucket.tfstate.arn, "${aws_s3_bucket.tfstate.arn}/${var.env}/*"]
  }
  statement {
    sid       = "StateLock"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:DescribeTable"]
    resources = [aws_dynamodb_table.tflock.arn]
  }
  statement {
    sid       = "StateKms"
    actions   = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey", "kms:DescribeKey", "kms:CreateGrant"]
    resources = ["*"]
    condition {
      test     = "StringLike"
      variable = "kms:ViaService"
      # 2026-11-10: + secretsmanager. Every plan reads the prod secrets the
      # state manages (postgres-master, REDIS_URL, …), encrypted with the
      # prod key; without it each plan failed «Access to KMS is not allowed».
      # 12.11 (KNOWN_ERRORS 107): + kinesis and elasticache (the events stream
      # and the cache Redis encrypt with the prod key) and RDS in any region
      # (cross-region backups use the replica key in the second region).
      values = ["s3.${var.region}.amazonaws.com", "rds.*.amazonaws.com", "es.${var.region}.amazonaws.com", "logs.${var.region}.amazonaws.com", "secretsmanager.${var.region}.amazonaws.com", "secretsmanager.${var.dr_region}.amazonaws.com", "kinesis.${var.region}.amazonaws.com", "elasticache.${var.region}.amazonaws.com"]
    }
  }
  statement {
    sid     = "ProdSecretsRead"
    actions = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    # 11.11: a second database server (aws.db_shards) keeps its master
    # secret under lawbid-<env>-db<N>/ (KNOWN_ERRORS 100).
    resources = [
      "arn:aws:secretsmanager:*:${local.account}:secret:lawbid-${var.env}/*",
      "arn:aws:secretsmanager:*:${local.account}:secret:lawbid-${var.env}-db*/*",
      # 12.11: the cache Redis keeps its URL under lawbid-<env>-cache/.
      "arn:aws:secretsmanager:*:${local.account}:secret:lawbid-${var.env}-cache/*",
    ]
  }
  statement {
    # 2026-11-10: switches that bring their own secret (PgBouncer TLS:
    # lawbid-prod/pgbouncer-tls) create and write it. Prod names only;
    # deleting a secret stays denied below.
    sid = "SwitchSecretsWrite"
    # Stage 2 SRE (Б8): + the replica of every secret in the DR region
    # (secrets_replica_enabled; KNOWN_ERRORS 100: a new module is checked
    # against this role's rights before release).
    actions = ["secretsmanager:CreateSecret", "secretsmanager:PutSecretValue", "secretsmanager:UpdateSecret", "secretsmanager:TagResource", "secretsmanager:UntagResource", "secretsmanager:ReplicateSecretToRegions"]
    resources = [
      "arn:aws:secretsmanager:*:${local.account}:secret:lawbid-${var.env}/*",
      "arn:aws:secretsmanager:*:${local.account}:secret:lawbid-${var.env}-db*/*",
      # 12.11: the cache Redis keeps its URL under lawbid-<env>-cache/.
      "arn:aws:secretsmanager:*:${local.account}:secret:lawbid-${var.env}-cache/*",
    ]
  }
  statement {
    # Owner 2026-11-12 («Авто» removes an EMPTY extra database server; the
    # API and plan-guard check emptiness): its final snapshot, its subnet and
    # parameter groups and its master secret (30-day recovery window).
    sid = "RemoveEmptyExtraServer"
    actions = [
      "rds:CreateDBSnapshot", "rds:DeleteDBSubnetGroup", "rds:DeleteDBParameterGroup",
      "secretsmanager:DeleteSecret",
    ]
    resources = [
      "arn:aws:rds:*:${local.account}:db:${local.name}-db*-postgres",
      "arn:aws:rds:*:${local.account}:snapshot:${local.name}-db*-postgres-final-*",
      "arn:aws:rds:*:${local.account}:subgrp:${local.name}-db*",
      "arn:aws:rds:*:${local.account}:pg:${local.name}-db*",
      "arn:aws:secretsmanager:*:${local.account}:secret:lawbid-${var.env}-db*/*",
    ]
  }
  statement {
    # 12.11 (KNOWN_ERRORS 107, IAM simulator): switches that failed on «Вкл»:
    # the events stream (Kinesis), the cache Redis (ElastiCache create; its
    # delete stays denied below), the own LiveKit server (EC2 + its instance
    # profile).
    sid = "SwitchGaps"
    actions = [
      "kinesis:CreateStream", "kinesis:DeleteStream", "kinesis:StartStreamEncryption",
      "kinesis:AddTagsToStream", "kinesis:RemoveTagsFromStream", "kinesis:IncreaseStreamRetentionPeriod",
      "kinesis:DecreaseStreamRetentionPeriod", "kinesis:UpdateStreamMode", "kinesis:UpdateShardCount",
      "elasticache:CreateReplicationGroup", "elasticache:ModifyReplicationGroup",
      "elasticache:CreateCacheSubnetGroup", "elasticache:ModifyCacheSubnetGroup", "elasticache:DeleteCacheSubnetGroup",
      "elasticache:CreateCacheParameterGroup", "elasticache:ModifyCacheParameterGroup", "elasticache:DeleteCacheParameterGroup",
      "elasticache:AddTagsToResource", "elasticache:RemoveTagsFromResource",
      "ec2:RunInstances", "ec2:TerminateInstances", "ec2:StopInstances", "ec2:StartInstances",
      "ec2:ModifyInstanceAttribute",
    ]
    resources = ["*"]
  }
  statement {
    sid = "OwnInstanceProfiles"
    actions = [
      "iam:CreateInstanceProfile", "iam:DeleteInstanceProfile", "iam:AddRoleToInstanceProfile",
      "iam:RemoveRoleFromInstanceProfile", "iam:TagInstanceProfile", "iam:UntagInstanceProfile",
    ]
    resources = ["arn:aws:iam::${local.account}:instance-profile/lawbid-${var.env}-*"]
  }
  statement {
    sid = "SwitchServices"
    actions = [
      "wafv2:*", "guardduty:*", "securityhub:*", "inspector2:*", "config:*", "macie2:*",
      "cloudtrail:*", "athena:*", "glue:*", "logs:*", "cloudwatch:*", "synthetics:*",
      "route53:CreateHealthCheck", "route53:UpdateHealthCheck", "route53:DeleteHealthCheck",
      "route53:ChangeTagsForResource",
      # 10.11: the pooler's private DNS name (Cloud Map namespace creates a
      # private hosted zone) and the database parameters a switch may change.
      "route53:CreateHostedZone", "route53:DeleteHostedZone", "route53:ChangeResourceRecordSets",
      "route53:AssociateVPCWithHostedZone", "route53:DisassociateVPCFromHostedZone", "route53:GetChange",
      "rds:ModifyDBParameterGroup",
      "ec2:*NatGateway*", "ec2:AllocateAddress", "ec2:ReleaseAddress", "ec2:AssociateAddress",
      "ec2:DisassociateAddress", "ec2:*Route", "ec2:*RouteTable*", "ec2:*VpcEndpoint*",
      "ec2:*FlowLogs", "ec2:*SecurityGroup*", "ec2:CreateTags", "ec2:DeleteTags",
      "ecs:*", "application-autoscaling:*", "elasticloadbalancing:*",
      "rds:CreateDBInstanceReadReplica", "rds:CreateDBInstance", "rds:ModifyDBInstance",
      # 11.11: a second database server brings its own subnet and parameter
      # groups (module postgres_shard; KNOWN_ERRORS 100).
      "rds:CreateDBSubnetGroup", "rds:ModifyDBSubnetGroup", "rds:CreateDBParameterGroup",
      "rds:DeleteDBInstance", "rds:AddTagsToResource", "rds:RemoveTagsFromResource",
      "rds:StartDBInstanceAutomatedBackupsReplication", "rds:StopDBInstanceAutomatedBackupsReplication",
      # 12.11: the Redis replication group's own settings (daily snapshot);
      # without it every apply stopped with AccessDenied (KNOWN_ERRORS 105).
      "elasticache:ModifyReplicationGroup",
      "es:*", "s3:PutReplicationConfiguration", "s3:PutBucket*", "s3:CreateBucket",
      "s3:PutLifecycleConfiguration", "s3:PutEncryptionConfiguration", "s3:PutObject",
      "lambda:*", "events:*",
      # 13.11 (KNOWN_ERRORS 126): the db/redis autoscale night schedules are
      # EventBridge SCHEDULER (not events:*); UpdateSchedule was AccessDenied.
      "scheduler:GetSchedule", "scheduler:UpdateSchedule", "scheduler:CreateSchedule",
      "scheduler:DeleteSchedule", "scheduler:TagResource", "scheduler:ListTagsForResource", "sns:*", "cloudfront:GetDistribution*", "cloudfront:UpdateDistribution",
      "cloudfront:TagResource", "servicediscovery:*", "ssm:PutParameter", "ssm:AddTagsToResource",
      # 25.11 (Б9): the unused-access analyzer and the cost allocation tags are
      # created by Terraform now; without these the apply stops with AccessDenied.
      "access-analyzer:CreateAnalyzer", "access-analyzer:DeleteAnalyzer", "access-analyzer:UpdateAnalyzer",
      "access-analyzer:TagResource", "access-analyzer:UntagResource",
      "ce:UpdateCostAllocationTagsStatus",
      # 26.11 (S10, owner: «включить»): the DNS Firewall of the app VPC and its
      # query log (modules/dns-firewall). Until this bootstrap is applied,
      # scripts/infra/rights-gate.mjs keeps dns_firewall_enabled off in the plan.
      "route53resolver:*Firewall*", "route53resolver:*ResolverQueryLogConfig*",
      "route53resolver:TagResource", "route53resolver:UntagResource", "route53resolver:ListTagsForResource",
      # rights-gate.mjs asks IAM whether this role may create a part before the
      # plan includes it (ReadOnlyAccess covers it too; explicit for clarity).
      "iam:SimulatePrincipalPolicy",
    ]
    resources = ["*"]
  }
  # C5 (26.11): the former `OwnRolesOnly` (role writes on role/lawbid-prod-*)
  # lives in ci-guard.tf now: only roles with the ci-boundary, never the
  # bootstrap roles (this one included).
  statement {
    sid       = "ServiceLinkedRoles"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["arn:aws:iam::${local.account}:role/aws-service-role/*"]
  }
  statement {
    sid    = "NeverLoseData"
    effect = "Deny"
    actions = [
      "rds:DeleteDBCluster", "rds:DeleteDBSnapshot", "rds:DeleteDBClusterSnapshot",
      "s3:DeleteBucket", "s3:DeleteBucketPolicy",
      "kms:ScheduleKeyDeletion", "kms:DisableKey",
      "backup:DeleteBackupVault", "backup:DeleteRecoveryPoint", "backup:DeleteBackupPlan",
      "dynamodb:DeleteTable",
      "elasticache:DeleteReplicationGroup", "elasticache:DeleteCacheCluster",
      "ecr:DeleteRepository",
      "iam:CreateUser", "iam:CreateAccessKey", "iam:CreateLoginProfile",
    ]
    resources = ["*"]
  }
  statement {
    # Secrets are never deleted, except the master secret of an empty extra
    # database server that is being removed (statement above).
    sid           = "KeepSecrets"
    effect        = "Deny"
    actions       = ["secretsmanager:DeleteSecret"]
    not_resources = ["arn:aws:secretsmanager:*:${local.account}:secret:lawbid-${var.env}-db*/*"]
  }
  statement {
    # Only the read replicas (…-postgres-replica-N) may be deleted.
    sid     = "KeepThePrimaryDatabase"
    effect  = "Deny"
    actions = ["rds:DeleteDBInstance"]
    # 11.11 (owner «да»): also the read copies of the extra database servers
    # (…-db<N>-postgres-replica-N). Never a server itself.
    not_resources = [
      "arn:aws:rds:*:${local.account}:db:${local.name}-postgres-replica-*",
      "arn:aws:rds:*:${local.account}:db:${local.name}-db*-postgres-replica-*",
      # 12.11 (owner «да кнч»): an extra server itself, only when empty.
      "arn:aws:rds:*:${local.account}:db:${local.name}-db*-postgres",
    ]
  }
  statement {
    sid       = "NoAdminPolicy"
    effect    = "Deny"
    actions   = ["iam:AttachRolePolicy", "iam:PutRolePolicy"]
    resources = ["*"]
    condition {
      test     = "ArnLike"
      variable = "iam:PolicyARN"
      values   = ["arn:aws:iam::aws:policy/AdministratorAccess", "arn:aws:iam::aws:policy/IAMFullAccess", "arn:aws:iam::aws:policy/PowerUserAccess"]
    }
  }
}

resource "aws_iam_role_policy" "deploy_infra_apply" {
  count  = var.infra_apply_enabled ? 1 : 0
  name   = "infra-apply"
  role   = aws_iam_role.infra_apply[0].name
  policy = data.aws_iam_policy_document.deploy_infra_apply.json
}

# The infra-apply workflow also rolls services, runs the migrate task and
# writes the deploy SSM parameters (pooler-roll.sh, run-migrations.sh) with the
# rights it had as the deploy role: the same document, so nothing it did
# before is lost by the split. Inline total = today's deploy role (KNOWN_ERRORS
# 170: inline policies of one role share 10,240 characters; the role writes
# went to the managed ci-iam, so it is smaller than before).
resource "aws_iam_role_policy" "infra_apply_deploy" {
  count  = var.infra_apply_enabled ? 1 : 0
  name   = "deploy"
  role   = aws_iam_role.infra_apply[0].name
  policy = data.aws_iam_policy_document.deploy.json
}

# 15.11 (KNOWN_ERRORS 170): the inline «infra-apply» policy hit the IAM limit
# («Maximum policy size of 10240 bytes exceeded for role», PutRolePolicy 409:
# all inline policies of one role share 10,240 characters). Newer rights live
# in a customer managed policy attached to the same role (its own 6,144-char
# limit; up to 10 managed policies per role — AWS IAM quotas). Denies in the
# inline policy still win (explicit deny overrides any allow).
data "aws_iam_policy_document" "deploy_infra_apply_extra" {
  # Owner 15.11 «делай обновы сейчас» (admin switch aws.postgres_major,
  # scripts/infra/rds-major-upgrade.sh): AWS RDS Blue/Green. Actions exactly
  # as the AWS user guide «Authorizing access to Amazon RDS blue/green
  # deployment operations» lists them for create + switchover (AddTags,
  # CreateDBInstanceReadReplica, ModifyDBInstance are above), plus the one
  # reboot that applies rds.logical_replication. Resources "*": the guide says
  # green copies get internal names, so name patterns cannot be used. NOT
  # granted: DeleteBlueGreenDeployment; and KeepThePrimaryDatabase below still
  # denies deleting the primary and the old «…-old1» (the way back).
  statement {
    sid = "DatabaseMajorUpgradeBlueGreen"
    actions = [
      "rds:CreateBlueGreenDeployment", "rds:SwitchoverBlueGreenDeployment",
      "rds:DescribeBlueGreenDeployments", "rds:PromoteReadReplica", "rds:RebootDBInstance",
    ]
    resources = ["*"]
  }
  # 15.11 (KNOWN_ERRORS 159): the web module's CloudFront Function
  # (seo_index); UpdateFunction was 403 and stopped the owner's 2FA apply.
  # Only our own functions.
  statement {
    sid = "OwnCloudFrontFunctions"
    actions = [
      "cloudfront:DescribeFunction", "cloudfront:GetFunction", "cloudfront:UpdateFunction",
      "cloudfront:PublishFunction", "cloudfront:CreateFunction", "cloudfront:DeleteFunction",
    ]
    resources = ["arn:aws:cloudfront::${local.account}:function/lawbid-${var.env}-*"]
  }
  # 25.11 (pack F, KNOWN_ERRORS 159 rule): the web module's response headers
  # policies (the app's CSP gets the FlutterFire loader hashes). Their ARNs
  # end in a random id, so they can not be narrowed by name.
  statement {
    sid = "WebResponseHeadersPolicies"
    actions = [
      "cloudfront:GetResponseHeadersPolicy", "cloudfront:GetResponseHeadersPolicyConfig",
      "cloudfront:UpdateResponseHeadersPolicy", "cloudfront:CreateResponseHeadersPolicy",
    ]
    resources = ["arn:aws:cloudfront::${local.account}:response-headers-policy/*"]
  }
}

resource "aws_iam_policy" "deploy_infra_apply_extra" {
  count  = var.infra_apply_enabled ? 1 : 0
  name   = "lawbid-${var.env}-infra-apply-extra"
  policy = data.aws_iam_policy_document.deploy_infra_apply_extra.json
}

resource "aws_iam_role_policy_attachment" "deploy_infra_apply_extra" {
  count      = var.infra_apply_enabled ? 1 : 0
  role       = aws_iam_role.infra_apply[0].name
  policy_arn = aws_iam_policy.deploy_infra_apply_extra[0].arn
}
