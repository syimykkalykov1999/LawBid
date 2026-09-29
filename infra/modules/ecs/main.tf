# docs/06 §6.1 / §6.3 — ECS Fargate: one image, three services (`api`,
# `worker`, `admin`), a one-off `migrate` task definition (`prisma migrate
# deploy` under the lawbid_migrator connection, run by the deploy
# pipeline before the prod rollout), CPU-target autoscaling (60 %, min 2
# tasks in 2 AZs), deployment circuit breaker with rollback, secrets
# injected from Secrets Manager (never in the task definition JSON).
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "name" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "tasks_security_group_id" {
  type        = string
  description = "Created by the stack: ALB → tasks in, everything out (shared with the Redis rule)."
}
variable "api_target_group_arn" { type = string }
variable "admin_target_group_arn" { type = string }
variable "api_image" { type = string }
variable "admin_image" { type = string }
variable "kms_key_arn" { type = string }

variable "api_env" {
  type        = map(string)
  description = "Plain (non-secret) environment for the API/worker containers."
  default     = {}
}
variable "admin_env" {
  type    = map(string)
  default = {}
}
variable "secret_arns" {
  type        = map(string)
  description = "Env var name → Secrets Manager ARN, injected into api/worker."
}
variable "migrator_database_url_secret_arn" { type = string }

variable "api_cpu" {
  type    = number
  default = 1024
}
variable "api_memory" {
  type    = number
  default = 2048
}
variable "worker_cpu" {
  type    = number
  default = 512
}
variable "worker_memory" {
  type    = number
  default = 1024
}
variable "admin_cpu" {
  type    = number
  default = 256
}
variable "admin_memory" {
  type    = number
  default = 512
}
variable "min_tasks" {
  type    = number
  default = 2
}
variable "api_max_tasks" {
  type    = number
  default = 20
}
variable "worker_max_tasks" {
  type    = number
  default = 10
}
variable "alb_resource_label" {
  type        = string
  description = "<alb arn_suffix>/<api target group arn_suffix> for ALBRequestCountPerTarget scaling."
}
variable "api_requests_per_task" {
  type    = number
  default = 200
}
variable "log_retention_days" {
  type    = number
  default = 30
}
variable "tags" {
  type    = map(string)
  default = {}
}

data "aws_region" "current" {}

resource "aws_ecs_cluster" "this" {
  name = var.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
  tags = var.tags
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE"]
  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

resource "aws_cloudwatch_log_group" "svc" {
  for_each          = toset(["api", "worker", "admin", "migrate"])
  name              = "/lawbid/${var.name}/${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
  tags              = var.tags
}

# --- IAM -----------------------------------------------------------------
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Execution role: pull the image, write logs, read the secrets at start.
resource "aws_iam_role" "execution" {
  name               = "${var.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = concat(values(var.secret_arns), [var.migrator_database_url_secret_arn])
  }
  statement {
    actions   = ["kms:Decrypt"]
    resources = [var.kms_key_arn]
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

# Task role: what the running app may do (S3 buckets, SES) — attached by
# the env with the bucket ARNs; only the role is created here.
resource "aws_iam_role" "task" {
  name               = "${var.name}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = var.tags
}

# Admin and migrate tasks carry no application permissions (security
# review): the admin only talks to the API, the migrate task only to the DB.
resource "aws_iam_role" "task_minimal" {
  name               = "${var.name}-ecs-task-minimal"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = var.tags
}

# --- task definitions ----------------------------------------------------
locals {
  api_environment = [for k, v in var.api_env : { name = k, value = v }]
  api_secrets     = [for k, arn in var.secret_arns : { name = k, valueFrom = arn }]
  log_config = { for svc in ["api", "worker", "admin", "migrate"] : svc => {
    logDriver = "awslogs"
    options = {
      awslogs-group         = aws_cloudwatch_log_group.svc[svc].name
      awslogs-region        = data.aws_region.current.name
      awslogs-stream-prefix = svc
    }
  } }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name         = "api"
    image        = var.api_image
    essential    = true
    command      = ["node", "dist/main.js"]
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    environment  = concat(local.api_environment, [{ name = "PORT", value = "3000" }, { name = "JOBS_ENABLED", value = "false" }])
    secrets      = local.api_secrets
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/health/live || exit 1"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
    stopTimeout      = 30
    logConfiguration = local.log_config["api"]
  }])
  tags = var.tags
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name             = "worker"
    image            = var.api_image
    essential        = true
    command          = ["node", "dist/worker.js"]
    environment      = local.api_environment
    secrets          = local.api_secrets
    stopTimeout      = 120
    logConfiguration = local.log_config["worker"]
  }])
  tags = var.tags
}

resource "aws_ecs_task_definition" "admin" {
  family                   = "${var.name}-admin"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.admin_cpu
  memory                   = var.admin_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task_minimal.arn
  container_definitions = jsonencode([{
    name         = "admin"
    image        = var.admin_image
    essential    = true
    portMappings = [{ containerPort = 3001, protocol = "tcp" }]
    environment  = [for k, v in var.admin_env : { name = k, value = v }]
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:3001/login >/dev/null || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 20
    }
    logConfiguration = local.log_config["admin"]
  }])
  tags = var.tags
}

# `prisma migrate deploy` under the lawbid_migrator role (docs/02 §6.3,
# docs/06 §7.3): run by the pipeline with `aws ecs run-task` before the
# prod rollout; never part of a long-running service.
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${var.name}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task_minimal.arn
  container_definitions = jsonencode([{
    name             = "migrate"
    image            = var.api_image
    essential        = true
    command          = ["npx", "prisma", "migrate", "deploy"]
    environment      = local.api_environment
    secrets          = [{ name = "DATABASE_URL", valueFrom = var.migrator_database_url_secret_arn }]
    logConfiguration = local.log_config["migrate"]
  }])
  tags = var.tags
}

# --- services --------------------------------------------------------------
resource "aws_ecs_service" "api" {
  name                              = "api"
  cluster                           = aws_ecs_cluster.this.id
  task_definition                   = aws_ecs_task_definition.api.arn
  desired_count                     = var.min_tasks
  launch_type                       = "FARGATE"
  platform_version                  = "LATEST"
  health_check_grace_period_seconds = 60
  enable_execute_command            = false
  propagate_tags                    = "SERVICE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.tasks_security_group_id]
    assign_public_ip = false
  }
  load_balancer {
    target_group_arn = var.api_target_group_arn
    container_name   = "api"
    container_port   = 3000
  }
  # Rolling, zero-downtime; automatic rollback on a failed deployment
  # (docs/06 §7.3 "автоматический откат при провале health-check").
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  lifecycle { ignore_changes = [desired_count] }
  tags = var.tags
}

resource "aws_ecs_service" "worker" {
  name                   = "worker"
  cluster                = aws_ecs_cluster.this.id
  task_definition        = aws_ecs_task_definition.worker.arn
  desired_count          = var.min_tasks
  launch_type            = "FARGATE"
  platform_version       = "LATEST"
  enable_execute_command = false
  propagate_tags         = "SERVICE"
  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.tasks_security_group_id]
    assign_public_ip = false
  }
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  lifecycle { ignore_changes = [desired_count] }
  tags = var.tags
}

resource "aws_ecs_service" "admin" {
  name                              = "admin"
  cluster                           = aws_ecs_cluster.this.id
  task_definition                   = aws_ecs_task_definition.admin.arn
  desired_count                     = 2
  launch_type                       = "FARGATE"
  platform_version                  = "LATEST"
  health_check_grace_period_seconds = 30
  propagate_tags                    = "SERVICE"
  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.tasks_security_group_id]
    assign_public_ip = false
  }
  load_balancer {
    target_group_arn = var.admin_target_group_arn
    container_name   = "admin"
    container_port   = 3001
  }
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  tags = var.tags
}

# --- autoscaling (§6.3: CPU 60 %, min 2, max per env) --------------------
resource "aws_appautoscaling_target" "svc" {
  for_each = {
    api    = { service = aws_ecs_service.api.name, max = var.api_max_tasks }
    worker = { service = aws_ecs_service.worker.name, max = var.worker_max_tasks }
  }
  service_namespace  = "ecs"
  scalable_dimension = "ecs:service:DesiredCount"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${each.value.service}"
  min_capacity       = var.min_tasks
  max_capacity       = each.value.max
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each           = aws_appautoscaling_target.svc
  name               = "${var.name}-${each.key}-cpu60"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = each.value.service_namespace
  scalable_dimension = each.value.scalable_dimension
  resource_id        = each.value.resource_id
  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

output "cluster_name" { value = aws_ecs_cluster.this.name }
output "cluster_arn" { value = aws_ecs_cluster.this.arn }
output "task_role_name" { value = aws_iam_role.task.name }
output "task_role_arn" { value = aws_iam_role.task.arn }
output "api_service_name" { value = aws_ecs_service.api.name }
output "worker_service_name" { value = aws_ecs_service.worker.name }
output "admin_service_name" { value = aws_ecs_service.admin.name }
output "migrate_task_definition_arn" { value = aws_ecs_task_definition.migrate.arn }
output "log_group_names" { value = { for k, g in aws_cloudwatch_log_group.svc : k => g.name } }

# Load review: CPU alone lags a traffic spike; requests per task scales
# out before saturation (both policies apply, the higher desired count wins).
resource "aws_appautoscaling_policy" "api_requests" {
  name               = "${var.name}-api-requests"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.svc["api"].service_namespace
  scalable_dimension = aws_appautoscaling_target.svc["api"].scalable_dimension
  resource_id        = aws_appautoscaling_target.svc["api"].resource_id
  target_tracking_scaling_policy_configuration {
    target_value       = var.api_requests_per_task
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = var.alb_resource_label
    }
  }
}
