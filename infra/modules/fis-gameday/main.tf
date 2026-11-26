# AWS FIS GameDay for the LOAD-TEST stack only (docs/runbooks/GAMEDAY.md).
#
# Three experiment templates, started by loadtest/scripts/gameday.sh in the
# middle of a load test (load-test.yml, input `gameday`):
#   api-stop-tasks   aws:ecs:stop-task on half of the API tasks (PERCENT)
#   rds-failover     aws:rds:reboot-db-instances forceFailover=true (needs Multi-AZ)
#   redis-failover   aws:elasticache:replicationgroup-interrupt-az-power
#
# Safety: the module refuses any name that is not lawbid-loadtest*; the service
# role can only touch resources of THIS stack (ARNs below) and the stop
# conditions are two CloudWatch alarms: all API targets unhealthy, or more than
# half of the requests failing for 3 minutes. A stop condition ends the
# experiment at once and FIS rolls the action back.
#
# Item 20 (X3 + D7, 25.11): the same module also serves STAGING (envs/staging,
# gameday_enabled) with two more templates, off by default so the load-test
# stack is unchanged:
#   api-latency      aws:ecs:task-network-latency on the API tasks; needs the
#                    ECS module's fault_injection_enabled (SSM sidecar,
#                    pidMode=task, enableFaultInjection), as in the AWS guide.
#   az-power         the FIS scenario library "AZ Availability: Power
#                    Interruption", reduced to the actions that apply to our
#                    stack (Fargate ECS has no instances to stop; the guide
#                    says Fargate is not covered by the scenario).
# Extra stop condition on staging: the existing «users see errors» alarm
# (monitoring api-5xx-ratio). docs/runbooks/chaos-and-restore-drills.md.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.72" }
  }
}

variable "name" {
  type = string
  validation {
    condition     = can(regex("^lawbid-(loadtest|staging)", var.name)) && !can(regex("prod", var.name))
    error_message = "REFUSING: the GameDay module only runs in the load-test or staging stack (name must start with lawbid-loadtest or lawbid-staging, never prod)."
  }
}
variable "extra_stop_alarm_arns" {
  type        = list(string)
  default     = []
  description = "Existing CloudWatch alarms that also stop every experiment (FIS allows 5 stop conditions; 2 are this module's own)."
  validation {
    condition     = length(var.extra_stop_alarm_arns) <= 3
    error_message = "FIS allows at most 5 stop conditions per template (2 are this module's own)."
  }
}
variable "rds_failover_enabled" {
  type        = bool
  default     = true
  description = "forceFailover needs a Multi-AZ database; false on a single-AZ staging (the template is not created)."
}
variable "api_latency_enabled" {
  type        = bool
  default     = false
  description = "The API latency template (needs the ECS module's fault_injection_enabled)."
}
variable "api_latency_ms" {
  type    = number
  default = 200
}
variable "api_latency_duration" {
  type    = string
  default = "PT5M"
}
variable "api_latency_tasks_percent" {
  type    = number
  default = 50
}
variable "az_impairment_enabled" {
  type        = bool
  default     = false
  description = "The AZ power-interruption template (scenario library)."
}
variable "vpc_id" {
  type    = string
  default = ""
}
variable "impaired_az" {
  type        = string
  default     = ""
  description = "Availability Zone the AZ template takes down, e.g. us-east-1a."
}
variable "az_power_duration" {
  type        = string
  default     = "PT30M"
  description = "Scenario default: 30 minutes of interruption (ElastiCache nodes in the AZ stay down)."
}
variable "az_network_duration" {
  type        = string
  default     = "PT2M"
  description = "Scenario default: subnet connectivity is cut for 2 minutes (while DNS moves away from the zone)."
}
variable "cluster_name" { type = string }
variable "api_service_name" { type = string }
variable "db_instance_id" { type = string }
variable "redis_replication_group_id" { type = string }
variable "alb_arn_suffix" { type = string }
variable "api_target_group_arn_suffix" { type = string }
variable "tags" {
  type    = map(string)
  default = {}
}
variable "stop_tasks_percent" {
  type    = number
  default = 50
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  acct        = data.aws_caller_identity.current.account_id
  region      = data.aws_region.current.region
  cluster_arn = "arn:aws:ecs:${local.region}:${local.acct}:cluster/${var.cluster_name}"
  db_arn      = "arn:aws:rds:${local.region}:${local.acct}:db:${var.db_instance_id}"
  redis_arn   = "arn:aws:elasticache:${local.region}:${local.acct}:replicationgroup:${var.redis_replication_group_id}"
}

# ----------------------------------------------------------- stop conditions ----
resource "aws_cloudwatch_metric_alarm" "api_down" {
  alarm_name          = "${var.name}-gameday-api-down"
  alarm_description   = "FIS stop condition: no healthy API target left."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HealthyHostCount"
  dimensions          = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.api_target_group_arn_suffix }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "notBreaching"
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "errors_storm" {
  alarm_name          = "${var.name}-gameday-5xx-storm"
  alarm_description   = "FIS stop condition: more than half of the requests fail for 3 minutes."
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  threshold           = 50
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  metric_query {
    id          = "pct"
    expression  = "100 * errs / MAX([errs, reqs, 1])"
    label       = "5xx percent"
    return_data = true
  }
  metric_query {
    id = "errs"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_ELB_5XX_Count"
      dimensions  = { LoadBalancer = var.alb_arn_suffix }
      period      = 60
      stat        = "Sum"
    }
  }
  metric_query {
    id = "reqs"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "RequestCount"
      dimensions  = { LoadBalancer = var.alb_arn_suffix }
      period      = 60
      stat        = "Sum"
    }
  }
  tags = var.tags
}

# ---------------------------------------------------------------- service role ----
data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["fis.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.acct]
    }
    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:fis:${local.region}:${local.acct}:experiment/*"]
    }
  }
}

data "aws_iam_policy_document" "perms" {
  statement {
    sid       = "StopTasksOfThisCluster"
    actions   = ["ecs:StopTask"]
    resources = ["arn:aws:ecs:${local.region}:${local.acct}:task/${var.cluster_name}/*"]
  }
  statement {
    sid       = "ReadEcs"
    actions   = ["ecs:DescribeTasks", "ecs:ListTasks"]
    resources = ["*"]
  }
  statement {
    sid       = "ResolveTargetsByTag"
    actions   = ["tag:GetResources"]
    resources = ["*"]
  }
  statement {
    sid       = "RebootThisDatabase"
    actions   = ["rds:RebootDBInstance"]
    resources = [local.db_arn]
  }
  statement {
    sid       = "ReadRds"
    actions   = ["rds:DescribeDBInstances"]
    resources = ["*"]
  }
  statement {
    sid       = "InterruptThisRedis"
    actions   = ["elasticache:InterruptClusterAzPower"]
    resources = [local.redis_arn, "arn:aws:elasticache:${local.region}:${local.acct}:cluster:${var.redis_replication_group_id}-*"]
  }
  statement {
    sid       = "ReadRedis"
    actions   = ["elasticache:DescribeReplicationGroups"]
    resources = ["*"]
  }
  statement {
    sid       = "ReadStopConditionAlarms"
    actions   = ["cloudwatch:DescribeAlarms"]
    resources = ["*"]
  }
}

resource "aws_iam_role" "fis" {
  permissions_boundary = var.permissions_boundary_arn
  name                 = "${var.name}-fis"
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  tags                 = var.tags
}

resource "aws_iam_role_policy" "fis" {
  name   = "gameday"
  role   = aws_iam_role.fis.id
  policy = data.aws_iam_policy_document.perms.json
}

# ------------------------------------------------------------------ templates ----
locals {
  stops = concat([
    aws_cloudwatch_metric_alarm.api_down.arn,
    aws_cloudwatch_metric_alarm.errors_storm.arn,
  ], var.extra_stop_alarm_arns)
}

resource "aws_fis_experiment_template" "api_stop_tasks" {
  description = "GameDay: stop ${var.stop_tasks_percent}% of the API tasks (ECS must start replacements, ALB must drain)"
  role_arn    = aws_iam_role.fis.arn

  dynamic "stop_condition" {
    for_each = local.stops
    content {
      source = "aws:cloudwatch:alarm"
      value  = stop_condition.value
    }
  }
  action {
    name      = "stop-api-tasks"
    action_id = "aws:ecs:stop-task"
    target {
      key   = "Tasks"
      value = "api-tasks"
    }
  }
  target {
    name           = "api-tasks"
    resource_type  = "aws:ecs:task"
    selection_mode = "PERCENT(${var.stop_tasks_percent})"
    parameters = {
      cluster = local.cluster_arn
      service = var.api_service_name
    }
  }
  tags = merge(var.tags, { Name = "${var.name}-api-stop-tasks" })
}

resource "aws_fis_experiment_template" "rds_failover" {
  count       = var.rds_failover_enabled ? 1 : 0
  description = "GameDay: reboot the database with failover to the standby (Multi-AZ)"
  role_arn    = aws_iam_role.fis.arn

  dynamic "stop_condition" {
    for_each = local.stops
    content {
      source = "aws:cloudwatch:alarm"
      value  = stop_condition.value
    }
  }
  action {
    name      = "reboot-with-failover"
    action_id = "aws:rds:reboot-db-instances"
    parameter {
      key   = "forceFailover"
      value = "true"
    }
    target {
      key   = "DBInstances"
      value = "db"
    }
  }
  target {
    name           = "db"
    resource_type  = "aws:rds:db"
    selection_mode = "ALL"
    resource_arns  = [local.db_arn]
  }
  tags = merge(var.tags, { Name = "${var.name}-rds-failover" })
}

resource "aws_fis_experiment_template" "redis_failover" {
  description = "GameDay: cut the power of an Availability Zone of the Redis group (the replica is promoted)"
  role_arn    = aws_iam_role.fis.arn

  dynamic "stop_condition" {
    for_each = local.stops
    content {
      source = "aws:cloudwatch:alarm"
      value  = stop_condition.value
    }
  }
  action {
    name      = "interrupt-az-power"
    action_id = "aws:elasticache:replicationgroup-interrupt-az-power"
    parameter {
      key   = "duration"
      value = "PT3M"
    }
    target {
      key   = "ReplicationGroups"
      value = "redis"
    }
  }
  target {
    name           = "redis"
    resource_type  = "aws:elasticache:replicationgroup"
    selection_mode = "ALL"
    resource_arns  = [local.redis_arn]
  }
  tags = merge(var.tags, { Name = "${var.name}-redis-failover" })
}

moved {
  from = aws_fis_experiment_template.rds_failover
  to   = aws_fis_experiment_template.rds_failover[0]
}

# ------------------------------------------- staging: API latency (X3) ----
# AWS FIS guide "Use the AWS FIS aws:ecs:task actions": experiment-role
# permissions ecs:DescribeTasks, ssm:SendCommand, ssm:ListCommands,
# ssm:CancelCommand; the action reference adds ecs:DescribeContainerInstances,
# ec2:DescribeInstances, ec2:DescribeSubnets. Network actions on Fargate need
# useEcsFaultInjectionEndpoints = true.
data "aws_iam_policy_document" "latency" {
  count = var.api_latency_enabled ? 1 : 0
  statement {
    sid     = "RunTheFisLatencyDocumentOnRegisteredTasks"
    actions = ["ssm:SendCommand"]
    resources = [
      "arn:aws:ssm:${local.region}::document/AWSFIS-Run-Network-Latency-ECS",
      "arn:aws:ssm:${local.region}:${local.acct}:managed-instance/*",
    ]
  }
  statement {
    sid       = "FollowAndCancelCommands"
    actions   = ["ssm:ListCommands", "ssm:CancelCommand"]
    resources = ["*"]
  }
  statement {
    sid       = "ResolveTasks"
    actions   = ["ecs:DescribeContainerInstances", "ec2:DescribeInstances", "ec2:DescribeSubnets"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "latency" {
  count  = var.api_latency_enabled ? 1 : 0
  name   = "gameday-latency"
  role   = aws_iam_role.fis.id
  policy = data.aws_iam_policy_document.latency[0].json
}

resource "aws_fis_experiment_template" "api_latency" {
  count       = var.api_latency_enabled ? 1 : 0
  description = "GameDay: ${var.api_latency_ms} ms extra network latency on ${var.api_latency_tasks_percent}% of the API tasks for ${var.api_latency_duration} (timeouts, retries, p95)"
  role_arn    = aws_iam_role.fis.arn

  dynamic "stop_condition" {
    for_each = local.stops
    content {
      source = "aws:cloudwatch:alarm"
      value  = stop_condition.value
    }
  }
  action {
    name      = "api-network-latency"
    action_id = "aws:ecs:task-network-latency"
    parameter {
      key   = "duration"
      value = var.api_latency_duration
    }
    parameter {
      key   = "delayMilliseconds"
      value = tostring(var.api_latency_ms)
    }
    parameter {
      key   = "jitterMilliseconds"
      value = "10"
    }
    parameter {
      key   = "sources"
      value = "ALL"
    }
    parameter {
      key   = "installDependencies"
      value = "true"
    }
    parameter {
      key   = "useEcsFaultInjectionEndpoints"
      value = "true"
    }
    target {
      key   = "Tasks"
      value = "api-tasks"
    }
  }
  target {
    name           = "api-tasks"
    resource_type  = "aws:ecs:task"
    selection_mode = "PERCENT(${var.api_latency_tasks_percent})"
    parameters = {
      cluster = local.cluster_arn
      service = var.api_service_name
    }
  }
  log_configuration {
    log_schema_version = 2
    cloudwatch_logs_configuration {
      log_group_arn = "${aws_cloudwatch_log_group.experiments[0].arn}:*"
    }
  }
  tags = merge(var.tags, { Name = "${var.name}-api-latency" })
}

# ----------------------------------- staging: AZ power interruption (X3) ----
# FIS scenario library "AZ Availability: Power Interruption"
# (fis/latest/userguide/az-availability-scenario.html, read 25.11.2026).
# Kept, as in the scenario: Pause-network-connectivity (all subnets of the
# AZ, scope all, PT2M), Pause-ElastiCache (interrupt-az-power, PT30M),
# Failover-RDS (our database is an instance, not a cluster, so the instance
# form aws:rds:reboot-db-instances forceFailover, the same RDS permission
# the scenario policy grants), emptyTargetResolutionMode = skip, log schema
# 2. Left out: EC2 / ASG / EBS / ARC / S3 Express actions (we have none of
# those; Fargate ECS is not covered by the scenario: the tasks in the zone
# lose their network, the ALB marks them unhealthy and ECS replaces them).
data "aws_subnets" "impaired" {
  count = var.az_impairment_enabled ? 1 : 0
  filter {
    name   = "vpc-id"
    values = [var.vpc_id]
  }
  filter {
    name   = "availability-zone"
    values = [var.impaired_az]
  }
}

locals {
  impaired_subnet_arns = var.az_impairment_enabled ? [for id in data.aws_subnets.impaired[0].ids : "arn:aws:ec2:${local.region}:${local.acct}:subnet/${id}"] : []
}

# The scenario's permission policy, the parts for the kept actions.
data "aws_iam_policy_document" "az" {
  count = var.az_impairment_enabled ? 1 : 0
  statement {
    actions   = ["ec2:CreateTags"]
    resources = ["arn:aws:ec2:*:*:network-acl/*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:CreateAction"
      values   = ["CreateNetworkAcl"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/managedByFIS"
      values   = ["true"]
    }
  }
  statement {
    actions   = ["ec2:CreateNetworkAcl"]
    resources = ["arn:aws:ec2:*:*:network-acl/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/managedByFIS"
      values   = ["true"]
    }
  }
  statement {
    actions   = ["ec2:CreateNetworkAclEntry", "ec2:DeleteNetworkAcl"]
    resources = ["arn:aws:ec2:*:*:network-acl/*", "arn:aws:ec2:*:*:vpc/*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/managedByFIS"
      values   = ["true"]
    }
  }
  statement {
    # Only this stack's VPC (the scenario allows any).
    actions   = ["ec2:CreateNetworkAcl"]
    resources = ["arn:aws:ec2:${local.region}:${local.acct}:vpc/${var.vpc_id}"]
  }
  statement {
    actions   = ["ec2:DescribeVpcs", "ec2:DescribeManagedPrefixLists", "ec2:DescribeSubnets", "ec2:DescribeNetworkAcls", "ec2:GetManagedPrefixListEntries"]
    resources = ["*"]
  }
  statement {
    # Only the subnets of the impaired zone of this stack (the scenario allows any).
    actions   = ["ec2:ReplaceNetworkAclAssociation"]
    resources = concat(local.impaired_subnet_arns, ["arn:aws:ec2:*:*:network-acl/*"])
  }
}

resource "aws_iam_role_policy" "az" {
  count  = var.az_impairment_enabled ? 1 : 0
  name   = "gameday-az-power"
  role   = aws_iam_role.fis.id
  policy = data.aws_iam_policy_document.az[0].json
}

# Experiment log (FIS log schema 2): the drill record cites it.
resource "aws_cloudwatch_log_group" "experiments" {
  count             = var.az_impairment_enabled || var.api_latency_enabled ? 1 : 0
  name              = "/aws/fis/${var.name}"
  retention_in_days = 400
  tags              = var.tags
}

data "aws_iam_policy_document" "logs" {
  count = var.az_impairment_enabled || var.api_latency_enabled ? 1 : 0
  statement {
    sid       = "AllowFISExperimentLoggingActionsCloudwatch"
    actions   = ["logs:CreateLogDelivery", "logs:PutResourcePolicy", "logs:DescribeResourcePolicies", "logs:DescribeLogGroups"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "logs" {
  count  = var.az_impairment_enabled || var.api_latency_enabled ? 1 : 0
  name   = "gameday-logs"
  role   = aws_iam_role.fis.id
  policy = data.aws_iam_policy_document.logs[0].json
}

resource "aws_fis_experiment_template" "az_power" {
  count       = var.az_impairment_enabled ? 1 : 0
  description = "GameDay: AZ Availability: Power Interruption in ${var.impaired_az} (FIS scenario library, reduced to our stack)"
  role_arn    = aws_iam_role.fis.arn

  dynamic "stop_condition" {
    for_each = local.stops
    content {
      source = "aws:cloudwatch:alarm"
      value  = stop_condition.value
    }
  }

  action {
    name      = "Pause-network-connectivity"
    action_id = "aws:network:disrupt-connectivity"
    parameter {
      key   = "duration"
      value = var.az_network_duration
    }
    parameter {
      key   = "scope"
      value = "all"
    }
    target {
      key   = "Subnets"
      value = "Subnet"
    }
  }
  action {
    name      = "Pause-ElastiCache"
    action_id = "aws:elasticache:replicationgroup-interrupt-az-power"
    parameter {
      key   = "duration"
      value = var.az_power_duration
    }
    target {
      key   = "ReplicationGroups"
      value = "ElastiCache-Cluster"
    }
  }
  dynamic "action" {
    for_each = var.rds_failover_enabled ? [1] : []
    content {
      name      = "Failover-RDS"
      action_id = "aws:rds:reboot-db-instances"
      parameter {
        key   = "forceFailover"
        value = "true"
      }
      target {
        key   = "DBInstances"
        value = "RDS-Instance"
      }
    }
  }

  target {
    name           = "Subnet"
    resource_type  = "aws:ec2:subnet"
    selection_mode = "ALL"
    resource_arns  = local.impaired_subnet_arns
  }
  target {
    name           = "ElastiCache-Cluster"
    resource_type  = "aws:elasticache:replicationgroup"
    selection_mode = "ALL"
    resource_arns  = [local.redis_arn]
    parameters     = { availabilityZoneIdentifier = var.impaired_az }
  }
  dynamic "target" {
    for_each = var.rds_failover_enabled ? [1] : []
    content {
      name           = "RDS-Instance"
      resource_type  = "aws:rds:db"
      selection_mode = "ALL"
      resource_arns  = [local.db_arn]
    }
  }

  experiment_options {
    account_targeting            = "single-account"
    empty_target_resolution_mode = "skip"
  }
  log_configuration {
    log_schema_version = 2
    cloudwatch_logs_configuration {
      log_group_arn = "${aws_cloudwatch_log_group.experiments[0].arn}:*"
    }
  }
  tags = merge(var.tags, { Name = "${var.name}-az-power" })

  lifecycle {
    precondition {
      condition     = var.vpc_id != "" && var.impaired_az != ""
      error_message = "az_impairment_enabled needs vpc_id and impaired_az."
    }
  }
}

output "template_ids" {
  value = {
    api_stop_tasks = aws_fis_experiment_template.api_stop_tasks.id
    rds_failover   = one(aws_fis_experiment_template.rds_failover[*].id)
    redis_failover = aws_fis_experiment_template.redis_failover.id
    api_latency    = one(aws_fis_experiment_template.api_latency[*].id)
    az_power       = one(aws_fis_experiment_template.az_power[*].id)
  }
}
output "experiment_log_group" { value = one(aws_cloudwatch_log_group.experiments[*].name) }
output "stop_alarm_names" {
  value = [aws_cloudwatch_metric_alarm.api_down.alarm_name, aws_cloudwatch_metric_alarm.errors_storm.alarm_name]
}
