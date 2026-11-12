# Owner 2026-10-26: infra switches from the admin (docs/runbooks/
# infra-from-admin.md). The workflow `infra-apply.yml` runs `terraform plan`
# and `terraform apply` on prod with the EXISTING OIDC deploy role. This file
# gives that role what the apply needs, and only when the owner turns it on:
#
#   infra_apply_enabled = true   ->  terraform apply in infra/bootstrap (owner)
#
# What it adds to `lawbid-prod-github-deploy`:
#   * trust for jobs in the GitHub environment `infra-apply` (main.tf);
#   * AWS ReadOnlyAccess (Terraform reads every resource it manages);
#   * read/write of the prod state + lock, the prod tfvars backup;
#   * create / change / delete in the services the WHITELISTED switches touch
#     (apps/api/src/common/ops/infra-switches.ts): WAF, GuardDuty, Security Hub,
#     Inspector, Config, Macie, CloudTrail/Athena/Glue, logs, alarms, Synthetics,
#     Route 53 health checks, NAT / VPC endpoints / flow logs, ECS services,
#     the read replica, OpenSearch, S3 replication, Lambda (canary), roles
#     named lawbid-prod-*;
#   * an explicit DENY on everything that loses data or hands out keys:
#     deleting the primary database, any bucket, KMS key, backup vault or its
#     recovery points, secret, DynamoDB table, Redis, ECR repository; IAM
#     users / access keys; attaching AdministratorAccess. A Deny wins over any
#     Allow, so even a wrong plan cannot do these.
# Risk: while deploy_trust_main_branch = true, every main-branch workflow that
# assumes the deploy role gets these rights too; set it to false once all of
# them declare `environment: production` (docs/runbooks/infra-hardening.md).

variable "infra_apply_enabled" {
  type        = bool
  default     = false
  description = "Let the infra-apply workflow (environment infra-apply) plan and apply prod with the deploy role. Off until the owner finishes the steps in docs/runbooks/infra-from-admin.md."
}

resource "aws_iam_role_policy_attachment" "deploy_infra_readonly" {
  count      = var.infra_apply_enabled ? 1 : 0
  role       = aws_iam_role.deploy.name
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
      values = ["s3.${var.region}.amazonaws.com", "rds.${var.region}.amazonaws.com", "es.${var.region}.amazonaws.com", "logs.${var.region}.amazonaws.com", "secretsmanager.${var.region}.amazonaws.com"]
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
    ]
  }
  statement {
    # 2026-11-10: switches that bring their own secret (PgBouncer TLS:
    # lawbid-prod/pgbouncer-tls) create and write it. Prod names only;
    # deleting a secret stays denied below.
    sid     = "SwitchSecretsWrite"
    actions = ["secretsmanager:CreateSecret", "secretsmanager:PutSecretValue", "secretsmanager:UpdateSecret", "secretsmanager:TagResource", "secretsmanager:UntagResource"]
    resources = [
      "arn:aws:secretsmanager:*:${local.account}:secret:lawbid-${var.env}/*",
      "arn:aws:secretsmanager:*:${local.account}:secret:lawbid-${var.env}-db*/*",
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
      "lambda:*", "events:*", "sns:*", "cloudfront:GetDistribution*", "cloudfront:UpdateDistribution",
      "cloudfront:TagResource", "servicediscovery:*", "ssm:PutParameter", "ssm:AddTagsToResource",
    ]
    resources = ["*"]
  }
  statement {
    sid = "OwnRolesOnly"
    actions = [
      "iam:CreateRole", "iam:DeleteRole", "iam:UpdateRole", "iam:TagRole", "iam:UntagRole",
      "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:AttachRolePolicy", "iam:DetachRolePolicy",
      "iam:UpdateAssumeRolePolicy", "iam:PassRole",
    ]
    resources = ["arn:aws:iam::${local.account}:role/lawbid-${var.env}-*"]
  }
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
  role   = aws_iam_role.deploy.name
  policy = data.aws_iam_policy_document.deploy_infra_apply.json
}
