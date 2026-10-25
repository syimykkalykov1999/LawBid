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
# Not included on purpose: aws:ecs:task-cpu-stress / task-network-latency.
# Fargate supports them since 2024-12, but they need an SSM-agent sidecar,
# pidMode=task and enableFaultInjection in the task definition (a change of
# the shared ECS module); see docs/runbooks/GAMEDAY.md "Later".
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "name" {
  type = string
  validation {
    condition     = can(regex("^lawbid-loadtest", var.name))
    error_message = "REFUSING: the GameDay module only runs in the load-test stack (name must start with lawbid-loadtest)."
  }
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
  region      = data.aws_region.current.name
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
  name               = "${var.name}-fis"
  assume_role_policy = data.aws_iam_policy_document.trust.json
  tags               = var.tags
}

resource "aws_iam_role_policy" "fis" {
  name   = "gameday"
  role   = aws_iam_role.fis.id
  policy = data.aws_iam_policy_document.perms.json
}

# ------------------------------------------------------------------ templates ----
locals {
  stops = [
    aws_cloudwatch_metric_alarm.api_down.arn,
    aws_cloudwatch_metric_alarm.errors_storm.arn,
  ]
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

output "template_ids" {
  value = {
    api_stop_tasks = aws_fis_experiment_template.api_stop_tasks.id
    rds_failover   = aws_fis_experiment_template.rds_failover.id
    redis_failover = aws_fis_experiment_template.redis_failover.id
  }
}
output "stop_alarm_names" {
  value = [aws_cloudwatch_metric_alarm.api_down.alarm_name, aws_cloudwatch_metric_alarm.errors_storm.alarm_name]
}
