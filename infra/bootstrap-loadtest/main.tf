# One-time setup of the AWS access for the load-test workflows
# (.github/workflows/load-test.yml and load-test-watchdog.yml), run once from
# the owner's Mac like infra/bootstrap:   terraform init && terraform apply
# Console steps around it: docs/runbooks/LOAD_TEST.md "Один раз: настройка".
#
# Two roles (OIDC, no stored AWS keys; the GitHub OIDC provider already exists
# from infra/bootstrap):
#
#   lawbid-loadtest-github    assumed ONLY by jobs of the GitHub environment
#                             `load-test` (that environment requires the owner's
#                             approval) - creates, runs and destroys the stack.
#   lawbid-loadtest-watchdog  assumed by the hourly watchdog on the main branch
#                             (a scheduled job cannot wait for an approval) -
#                             destroys stacks older than 4 hours.
#
# Least privilege where AWS allows it. Three techniques, strongest first:
#   1. name patterns: every resource this stack creates is named
#      lawbid-loadtest-... (roles, log groups, buckets, RDS, Redis, ALB,
#      WAF, secrets lawbid-loadtest/..., SSM /lawbid-loadtest/...);
#   2. tag conditions: aws:RequestTag/Project and aws:ResourceTag/Project =
#      lawbid-loadtest for services whose ids are generated (EC2, KMS,
#      CloudFront distributions);
#   3. an explicit DENY on anything tagged Project=lawbid (prod and staging).
# Not possible to limit by name or tag (AWS has no condition key): the read
# actions (Describe/List/Get), Application Auto Scaling, Route 53 health checks
# and the CloudFront helper objects (cache policies, origin access controls,
# functions, key groups). They are listed in the statements below with a
# comment so the owner can see exactly what is wide.
terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "region" {
  type    = string
  default = "us-east-1"
}
variable "replica_region" {
  type    = string
  default = "us-west-2"
}
variable "github_repo" {
  type        = string
  default     = "syimykkalykov1999/LawBid"
  description = "owner/name of the repository whose Actions may run the load test."
}
variable "github_repo_immutable" {
  type        = string
  default     = "syimykkalykov1999@91685781/LawBid@1400978845"
  description = "The repository has use_immutable_subject on: GitHub signs OIDC tokens as repo:<owner>@<owner_id>/<repo>@<repo_id>:... (gh api repos/OWNER/REPO/actions/oidc/customization/sub)."
}
variable "environment_name" {
  type        = string
  default     = "load-test"
  description = "GitHub environment (with required reviewers) the main role is bound to."
}
variable "state_bucket" {
  type    = string
  default = "lawbid-prod-tfstate"
}
variable "lock_table" {
  type    = string
  default = "lawbid-prod-tflock"
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "lawbid", Env = "loadtest-iam", ManagedBy = "terraform-bootstrap" }
  }
}

data "aws_caller_identity" "current" {}
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

locals {
  acct = data.aws_caller_identity.current.account_id
  lt   = "lawbid-loadtest"
  ptag = { "aws:ResourceTag/Project" = "lawbid-loadtest" }
  rtag = { "aws:RequestTag/Project" = "lawbid-loadtest" }
}

# ---------------------------------------------------------------- trust ----
data "aws_iam_policy_document" "trust_github" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repo}:environment:${var.environment_name}",
        "repo:${lower(var.github_repo)}:environment:${var.environment_name}",
        "repo:${var.github_repo_immutable}:environment:${var.environment_name}",
      ]
    }
  }
}

data "aws_iam_policy_document" "trust_watchdog" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repo}:ref:refs/heads/main",
        "repo:${lower(var.github_repo)}:ref:refs/heads/main",
        "repo:${var.github_repo_immutable}:ref:refs/heads/main",
      ]
    }
  }
}

resource "aws_iam_role" "github" {
  name                 = "${local.lt}-github"
  assume_role_policy   = data.aws_iam_policy_document.trust_github.json
  max_session_duration = 14400 # 4 h: the longest run (2 h) plus create and destroy
}

resource "aws_iam_role" "watchdog" {
  name                 = "${local.lt}-watchdog"
  assume_role_policy   = data.aws_iam_policy_document.trust_watchdog.json
  max_session_duration = 7200
}

# --------------------------------------------- 1. state, tagging, reading ----
data "aws_iam_policy_document" "base" {
  statement {
    sid       = "StateObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::${var.state_bucket}/loadtest/*"]
  }
  statement {
    sid       = "StateList"
    actions   = ["s3:ListBucket", "s3:GetBucketVersioning"]
    resources = ["arn:aws:s3:::${var.state_bucket}"]
  }
  statement {
    sid       = "StateLock"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
    resources = ["arn:aws:dynamodb:${var.region}:${local.acct}:table/${var.lock_table}"]
    condition {
      test     = "ForAllValues:StringLike"
      variable = "dynamodb:LeadingKeys"
      values   = ["${var.state_bucket}/loadtest/*"]
    }
  }
  statement {
    sid       = "StateEncryption"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = ["*"]
    condition {
      test     = "StringLike"
      variable = "kms:ViaService"
      values   = ["s3.${var.region}.amazonaws.com"]
    }
  }
  # Wide on purpose: AWS offers no way to limit read-only calls by tag or name.
  statement {
    sid = "ReadOnly"
    actions = [
      "tag:GetResources", "tag:GetTagKeys", "tag:GetTagValues",
      "ec2:Describe*", "ecs:Describe*", "ecs:List*",
      "elasticloadbalancing:Describe*", "rds:Describe*", "rds:ListTagsForResource",
      "elasticache:Describe*", "elasticache:ListTagsForResource",
      "kms:DescribeKey", "kms:ListAliases", "kms:ListResourceTags", "kms:GetKeyRotationStatus", "kms:GetKeyPolicy", "kms:ListKeys",
      "s3:ListAllMyBuckets", "s3:GetBucket*", "s3:GetEncryptionConfiguration", "s3:GetLifecycleConfiguration", "s3:GetReplicationConfiguration",
      "cloudfront:Get*", "cloudfront:List*", "wafv2:Get*", "wafv2:List*", "wafv2:Describe*",
      "route53:Get*", "route53:List*", "logs:Describe*", "logs:ListTagsForResource", "logs:ListTagsLogGroup",
      "cloudwatch:Describe*", "cloudwatch:Get*", "cloudwatch:List*",
      "sns:GetTopicAttributes", "sns:ListTagsForResource", "sns:ListSubscriptionsByTopic", "sns:GetSubscriptionAttributes", "sns:ListTopics",
      "iam:Get*", "iam:List*", "secretsmanager:DescribeSecret", "secretsmanager:ListSecrets", "secretsmanager:GetResourcePolicy",
      "application-autoscaling:Describe*", "application-autoscaling:ListTagsForResource",
      "ssm:GetParameter", "ssm:GetParameters", "ssm:DescribeParameters", "ssm:ListTagsForResource",
      "ssm:GetCommandInvocation", "ssm:ListCommandInvocations", "ssm:ListCommands", "ssm:DescribeInstanceInformation",
      "ecr:GetAuthorizationToken", "ecr:DescribeImages", "ecr:DescribeRepositories",
      "pi:GetResourceMetrics", "pi:DescribeDimensionKeys", "pi:GetDimensionKeyDetails",
      "acm:DescribeCertificate", "sts:GetCallerIdentity",
    ]
    resources = ["*"]
  }
}

# ------------------------------------------------------- 2. servers and network ----
data "aws_iam_policy_document" "ec2" {
  statement {
    sid       = "Ec2CreateWithTag"
    actions   = ["ec2:CreateVpc", "ec2:CreateSubnet", "ec2:CreateSecurityGroup", "ec2:CreateRouteTable", "ec2:CreateInternetGateway", "ec2:CreateNatGateway", "ec2:AllocateAddress", "ec2:CreateVpcEndpoint", "ec2:CreateVolume"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Project"
      values   = ["lawbid-loadtest"]
    }
  }
  # AWS also checks the parent objects: a new subnet or security group is
  # authorized against its VPC, a NAT gateway against its subnet and address,
  # an endpoint against its subnets, route tables and groups. Allowed only when
  # that parent is itself tagged Project=lawbid-loadtest.
  statement {
    sid     = "Ec2CreateInsideTaggedParents"
    actions = ["ec2:CreateSubnet", "ec2:CreateSecurityGroup", "ec2:CreateRouteTable", "ec2:CreateNatGateway", "ec2:CreateVpcEndpoint"]
    resources = [
      "arn:aws:ec2:*:${local.acct}:vpc/*", "arn:aws:ec2:*:${local.acct}:subnet/*", "arn:aws:ec2:*:${local.acct}:security-group/*",
      "arn:aws:ec2:*:${local.acct}:route-table/*", "arn:aws:ec2:*:${local.acct}:elastic-ip/*",
    ]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Project"
      values   = ["lawbid-loadtest"]
    }
  }
  statement {
    sid       = "Ec2RunInstancesTagged"
    actions   = ["ec2:RunInstances"]
    resources = ["arn:aws:ec2:*:${local.acct}:instance/*", "arn:aws:ec2:*:${local.acct}:volume/*", "arn:aws:ec2:*:${local.acct}:spot-instances-request/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Project"
      values   = ["lawbid-loadtest"]
    }
  }
  statement {
    sid     = "Ec2RunInstancesParts"
    actions = ["ec2:RunInstances"]
    resources = [
      "arn:aws:ec2:*::image/*", "arn:aws:ec2:*::snapshot/*",
      "arn:aws:ec2:*:${local.acct}:subnet/*", "arn:aws:ec2:*:${local.acct}:network-interface/*",
      "arn:aws:ec2:*:${local.acct}:security-group/*",
    ]
  }
  statement {
    sid       = "Ec2TagOnCreate"
    actions   = ["ec2:CreateTags"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:CreateAction"
      values   = ["CreateVpc", "CreateSubnet", "CreateSecurityGroup", "CreateRouteTable", "CreateInternetGateway", "CreateNatGateway", "AllocateAddress", "CreateVpcEndpoint", "CreateVolume", "RunInstances"]
    }
  }
  statement {
    sid = "Ec2ChangeTaggedOnly"
    actions = [
      "ec2:DeleteVpc", "ec2:DeleteSubnet", "ec2:DeleteSecurityGroup", "ec2:DeleteRouteTable", "ec2:DeleteInternetGateway",
      "ec2:DeleteNatGateway", "ec2:ReleaseAddress", "ec2:DeleteVpcEndpoints", "ec2:DeleteVolume", "ec2:TerminateInstances",
      "ec2:CreateRoute", "ec2:DeleteRoute", "ec2:AssociateRouteTable", "ec2:DisassociateRouteTable", "ec2:AttachInternetGateway",
      "ec2:DetachInternetGateway", "ec2:AssociateAddress", "ec2:DisassociateAddress", "ec2:AuthorizeSecurityGroupIngress",
      "ec2:AuthorizeSecurityGroupEgress", "ec2:RevokeSecurityGroupIngress", "ec2:RevokeSecurityGroupEgress",
      "ec2:ModifyVpcAttribute", "ec2:ModifySubnetAttribute", "ec2:ModifyInstanceAttribute", "ec2:ModifyVpcEndpoint",
      "ec2:ModifySecurityGroupRules", "ec2:UpdateSecurityGroupRuleDescriptionsIngress", "ec2:UpdateSecurityGroupRuleDescriptionsEgress",
      "ec2:ModifyInstanceMetadataOptions", "ec2:StopInstances", "ec2:CreateTags", "ec2:DeleteTags",
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Project"
      values   = ["lawbid-loadtest"]
    }
  }
  statement {
    sid       = "Ec2SpotServiceLinkedRole"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["arn:aws:iam::${local.acct}:role/aws-service-role/*"]
    condition {
      test     = "StringEquals"
      variable = "iam:AWSServiceName"
      values   = ["spot.amazonaws.com", "ecs.amazonaws.com", "elasticache.amazonaws.com", "rds.amazonaws.com", "autoscaling.amazonaws.com", "ecs.application-autoscaling.amazonaws.com", "elasticloadbalancing.amazonaws.com"]
    }
  }
}

# --------------------------------------- 2b. containers, balancer, logs, alarms ----
data "aws_iam_policy_document" "runtime" {
  statement {
    sid       = "EcsByName"
    actions   = ["ecs:*"]
    resources = ["arn:aws:ecs:*:${local.acct}:*/${local.lt}", "arn:aws:ecs:*:${local.acct}:*/${local.lt}/*", "arn:aws:ecs:*:${local.acct}:task-definition/${local.lt}-*:*"]
  }
  statement {
    sid       = "EcsTaskDefinitions"
    actions   = ["ecs:RegisterTaskDefinition", "ecs:DeregisterTaskDefinition", "ecs:DeleteTaskDefinitions"]
    resources = ["*"] # task definitions have no resource-level permission when registering
  }
  statement {
    sid       = "ElbByName"
    actions   = ["elasticloadbalancing:*"]
    resources = ["arn:aws:elasticloadbalancing:*:${local.acct}:*/${local.lt}*", "arn:aws:elasticloadbalancing:*:${local.acct}:*/*/${local.lt}*/*"]
  }
  statement {
    sid       = "ElbAddTagsOnCreate"
    actions   = ["elasticloadbalancing:AddTags"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "elasticloadbalancing:CreateAction"
      values   = ["CreateLoadBalancer", "CreateTargetGroup"]
    }
  }
  # Application Auto Scaling has no resource-level or tag permissions.
  statement {
    sid       = "AutoScalingWide"
    actions   = ["application-autoscaling:RegisterScalableTarget", "application-autoscaling:DeregisterScalableTarget", "application-autoscaling:PutScalingPolicy", "application-autoscaling:DeleteScalingPolicy", "application-autoscaling:PutScheduledAction", "application-autoscaling:DeleteScheduledAction", "application-autoscaling:TagResource"]
    resources = ["*"]
  }
  statement {
    sid       = "LogsByName"
    actions   = ["logs:*"]
    resources = ["arn:aws:logs:*:${local.acct}:log-group:*${local.lt}*", "arn:aws:logs:*:${local.acct}:log-group:*${local.lt}*:*"]
  }
  statement {
    sid       = "AlarmsByName"
    actions   = ["cloudwatch:PutMetricAlarm", "cloudwatch:PutCompositeAlarm", "cloudwatch:DeleteAlarms", "cloudwatch:TagResource", "cloudwatch:UntagResource", "cloudwatch:EnableAlarmActions", "cloudwatch:DisableAlarmActions"]
    resources = ["arn:aws:cloudwatch:*:${local.acct}:alarm:${local.lt}-*"]
  }
  # PutCompositeAlarm is authorized against alarm:* (it reads the child alarms).
  # The deny policy forbids touching lawbid-prod-* / lawbid-staging-* alarms.
  statement {
    sid       = "CompositeAlarmsWide"
    actions   = ["cloudwatch:PutCompositeAlarm"]
    resources = ["*"]
  }
  statement {
    sid       = "SnsByName"
    actions   = ["sns:*"]
    resources = ["arn:aws:sns:*:${local.acct}:${local.lt}-*"]
  }
  statement {
    sid       = "SsmParametersByName"
    actions   = ["ssm:PutParameter", "ssm:DeleteParameter", "ssm:AddTagsToResource", "ssm:RemoveTagsFromResource", "ssm:GetParameter*"]
    resources = ["arn:aws:ssm:*:${local.acct}:parameter/${local.lt}/*"]
  }
  statement {
    sid       = "AmiParameter"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:*::parameter/aws/service/ami-amazon-linux-latest/*"]
  }
  statement {
    sid       = "RunCommandOnTaggedBoxes"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ec2:*:${local.acct}:instance/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Project"
      values   = ["lawbid-loadtest"]
    }
  }
  statement {
    sid       = "RunCommandDocument"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ssm:*::document/AWS-RunShellScript"]
  }
  statement {
    sid       = "StopOwnRunCommand"
    actions   = ["ssm:CancelCommand"]
    resources = ["*"]
  }
}

# ---------------------------------------------------------------- 3. data ----
data "aws_iam_policy_document" "data" {
  statement {
    sid       = "RdsByName"
    actions   = ["rds:*"]
    resources = ["arn:aws:rds:*:${local.acct}:db:${local.lt}-*", "arn:aws:rds:*:${local.acct}:subgrp:${local.lt}-*", "arn:aws:rds:*:${local.acct}:pg:${local.lt}-*", "arn:aws:rds:*:${local.acct}:snapshot:${local.lt}-*", "arn:aws:rds:*:${local.acct}:og:${local.lt}-*"]
  }
  statement {
    sid       = "ElastiCacheByName"
    actions   = ["elasticache:*"]
    resources = ["arn:aws:elasticache:*:${local.acct}:replicationgroup:${local.lt}-*", "arn:aws:elasticache:*:${local.acct}:cluster:${local.lt}-*", "arn:aws:elasticache:*:${local.acct}:subnetgroup:${local.lt}-*", "arn:aws:elasticache:*:${local.acct}:parametergroup:${local.lt}-*", "arn:aws:elasticache:*:${local.acct}:snapshot:${local.lt}-*"]
  }
  statement {
    sid       = "KmsCreateWithTag"
    actions   = ["kms:CreateKey", "kms:TagResource"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Project"
      values   = ["lawbid-loadtest"]
    }
  }
  statement {
    sid       = "KmsUseTaggedKeys"
    actions   = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:CreateGrant", "kms:RevokeGrant", "kms:PutKeyPolicy", "kms:EnableKeyRotation", "kms:ScheduleKeyDeletion", "kms:CreateAlias", "kms:DeleteAlias", "kms:UpdateAlias", "kms:UntagResource"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Project"
      values   = ["lawbid-loadtest"]
    }
  }
  statement {
    sid       = "KmsAliasByName"
    actions   = ["kms:CreateAlias", "kms:DeleteAlias", "kms:UpdateAlias"]
    resources = ["arn:aws:kms:*:${local.acct}:alias/${local.lt}", "arn:aws:kms:*:${local.acct}:alias/${local.lt}-*"]
  }
  statement {
    sid       = "SecretsByName"
    actions   = ["secretsmanager:*"]
    resources = ["arn:aws:secretsmanager:*:${local.acct}:secret:${local.lt}/*"]
  }
  statement {
    sid       = "SecretsRandom"
    actions   = ["secretsmanager:GetRandomPassword"]
    resources = ["*"]
  }
  statement {
    sid       = "S3BucketsByName"
    actions   = ["s3:*"]
    resources = ["arn:aws:s3:::${local.lt}-*", "arn:aws:s3:::${local.lt}-*/*"]
  }
  statement {
    sid       = "S3ReplicationRolePass"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${local.acct}:role/${local.lt}-*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["s3.amazonaws.com", "ecs-tasks.amazonaws.com", "ec2.amazonaws.com", "monitoring.rds.amazonaws.com", "events.amazonaws.com"]
    }
  }
}

# --------------------------------------------- 4. edge, identity, deny ----
data "aws_iam_policy_document" "edge" {
  statement {
    sid       = "CloudFrontDistributionsTagged"
    actions   = ["cloudfront:CreateDistribution", "cloudfront:CreateDistributionWithTags", "cloudfront:TagResource"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Project"
      values   = ["lawbid-loadtest"]
    }
  }
  statement {
    sid       = "CloudFrontChangeTagged"
    actions   = ["cloudfront:UpdateDistribution", "cloudfront:DeleteDistribution", "cloudfront:UntagResource", "cloudfront:CreateInvalidation"]
    resources = ["arn:aws:cloudfront::${local.acct}:distribution/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Project"
      values   = ["lawbid-loadtest"]
    }
  }
  # WIDE: these CloudFront objects cannot be tagged or limited by name in IAM.
  statement {
    sid = "CloudFrontHelperObjectsWide"
    actions = [
      "cloudfront:CreateOriginAccessControl", "cloudfront:UpdateOriginAccessControl", "cloudfront:DeleteOriginAccessControl",
      "cloudfront:CreateCachePolicy", "cloudfront:UpdateCachePolicy", "cloudfront:DeleteCachePolicy",
      "cloudfront:CreateResponseHeadersPolicy", "cloudfront:UpdateResponseHeadersPolicy", "cloudfront:DeleteResponseHeadersPolicy",
      "cloudfront:CreateFunction", "cloudfront:UpdateFunction", "cloudfront:DeleteFunction", "cloudfront:PublishFunction",
      "cloudfront:CreateKeyGroup", "cloudfront:UpdateKeyGroup", "cloudfront:DeleteKeyGroup",
      "cloudfront:CreatePublicKey", "cloudfront:UpdatePublicKey", "cloudfront:DeletePublicKey",
      "cloudfront:CreateKeyValueStore", "cloudfront:UpdateKeyValueStore", "cloudfront:DeleteKeyValueStore",
      "cloudfront:DescribeFunction", "cloudfront:GetFunction", "cloudfront:DescribeKeyValueStore",
    ]
    resources = ["*"]
  }
  statement {
    sid       = "WafByName"
    actions   = ["wafv2:*"]
    resources = ["arn:aws:wafv2:*:${local.acct}:*/webacl/${local.lt}-*/*", "arn:aws:wafv2:*:${local.acct}:*/ipset/${local.lt}-*/*", "arn:aws:wafv2:*:${local.acct}:*/managedruleset/*", "arn:aws:wafv2:*:${local.acct}:regional/webacl/${local.lt}-*/*"]
  }
  statement {
    sid       = "WafAssociate"
    actions   = ["wafv2:AssociateWebACL", "wafv2:DisassociateWebACL"]
    resources = ["arn:aws:elasticloadbalancing:*:${local.acct}:loadbalancer/app/${local.lt}*"]
  }
  # WIDE: Route 53 health checks (the TURN boxes' checks) have no name or tag condition.
  statement {
    sid       = "Route53HealthChecksWide"
    actions   = ["route53:CreateHealthCheck", "route53:DeleteHealthCheck", "route53:UpdateHealthCheck", "route53:ChangeTagsForResource"]
    resources = ["*"]
  }
  statement {
    sid       = "IamByName"
    actions   = ["iam:CreateRole", "iam:DeleteRole", "iam:UpdateRole", "iam:TagRole", "iam:UntagRole", "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:UpdateAssumeRolePolicy", "iam:CreatePolicy", "iam:DeletePolicy", "iam:CreatePolicyVersion", "iam:DeletePolicyVersion", "iam:TagPolicy", "iam:CreateInstanceProfile", "iam:DeleteInstanceProfile", "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile", "iam:TagInstanceProfile"]
    resources = ["arn:aws:iam::${local.acct}:role/${local.lt}-*", "arn:aws:iam::${local.acct}:policy/${local.lt}-*", "arn:aws:iam::${local.acct}:instance-profile/${local.lt}-*"]
  }
  statement {
    sid       = "PassOnlyLoadTestRoles"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${local.acct}:role/${local.lt}-*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com", "ec2.amazonaws.com", "ecs.amazonaws.com", "application-autoscaling.amazonaws.com", "rds.amazonaws.com", "vpc-flow-logs.amazonaws.com"]
    }
  }
}

# Belt and braces: whatever the allow statements say, nothing tagged
# Project=lawbid (production, staging) can be touched by these roles.
data "aws_iam_policy_document" "deny_prod" {
  statement {
    sid       = "NeverTouchProdAlarms"
    effect    = "Deny"
    actions   = ["cloudwatch:PutMetricAlarm", "cloudwatch:PutCompositeAlarm", "cloudwatch:DeleteAlarms", "cloudwatch:DisableAlarmActions", "cloudwatch:SetAlarmState"]
    resources = ["arn:aws:cloudwatch:*:${local.acct}:alarm:lawbid-prod-*", "arn:aws:cloudwatch:*:${local.acct}:alarm:lawbid-staging-*"]
  }
  statement {
    sid       = "NeverTouchProductionOrStaging"
    effect    = "Deny"
    actions   = ["ec2:*", "ecs:*", "rds:*", "elasticache:*", "elasticloadbalancing:*", "kms:*", "secretsmanager:*", "cloudfront:*", "wafv2:*", "sns:*", "s3:*", "logs:*", "ssm:*"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Project"
      values   = ["lawbid"]
    }
  }
}

locals {
  documents = {
    base    = data.aws_iam_policy_document.base.json
    ec2     = data.aws_iam_policy_document.ec2.json
    runtime = data.aws_iam_policy_document.runtime.json
    data    = data.aws_iam_policy_document.data.json
    edge    = data.aws_iam_policy_document.edge.json
    deny    = data.aws_iam_policy_document.deny_prod.json
  }
  roles = { github = aws_iam_role.github.name, watchdog = aws_iam_role.watchdog.name }
  attachments = {
    for pair in setproduct(keys(local.roles), keys(local.documents)) :
    "${pair[0]}-${pair[1]}" => { role = local.roles[pair[0]], doc = pair[1] }
  }
}

resource "aws_iam_policy" "p" {
  for_each = local.documents
  name     = "${local.lt}-${each.key}"
  policy   = each.value
}

resource "aws_iam_role_policy_attachment" "p" {
  for_each   = local.attachments
  role       = each.value.role
  policy_arn = aws_iam_policy.p[each.value.doc].arn
}

output "github_role_arn" {
  value       = aws_iam_role.github.arn
  description = "GitHub secret AWS_LOADTEST_ROLE (environment load-test)."
}
output "watchdog_role_arn" {
  value       = aws_iam_role.watchdog.arn
  description = "GitHub secret AWS_LOADTEST_WATCHDOG_ROLE (repository secret)."
}
