# docs/06 §6.1 / §6.3 — ECS Fargate: one image, three services (`api`,
# `worker`, `admin`), a one-off `migrate` task definition (`prisma migrate
# deploy` under the lawbid_migrator connection, run by the deploy
# pipeline before the prod rollout), CPU-target autoscaling (60 %, min 2
# tasks in 2 AZs; plus requests per task for the api and waiting jobs per
# task for the worker), deployment circuit breaker with rollback, secrets
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
variable "api_ws_target_group_arn" {
  type        = string
  default     = ""
  description = "S4-7: second target group (sticky, /socket.io only) the api service also registers in. Empty = none."
}
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
variable "clamav_image" {
  type        = string
  default     = "clamav/clamav:1.4"
  description = "Antivirus sidecar of the worker (uploads stay «pending» without it)."
}
variable "clamav_memory" {
  type        = number
  default     = 2560
  description = "MiB reserved for clamd inside the worker task (signatures ≈ 1.2 GB, twice that while reloading)."
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
variable "api_min_tasks" {
  type        = number
  default     = null
  description = "S4-11: separate floor for the api service (null = min_tasks). 2 puts one api task in each AZ (Fargate spreads only when count >= 2) so a lost AZ, Spot stop or deploy leaves one running."
}
variable "admin_tasks" {
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
variable "cpu_architecture" {
  type        = string
  default     = "X86_64"
  description = "X86_64 or ARM64 (Graviton: about 20 % cheaper per vCPU on Fargate). Switch to ARM64 only after the api, admin and worker images are built for linux/arm64."
  validation {
    condition     = contains(["X86_64", "ARM64"], var.cpu_architecture)
    error_message = "cpu_architecture must be X86_64 or ARM64."
  }
}
variable "container_insights" {
  type        = string
  default     = "disabled"
  description = "ECS Container Insights: disabled (default, saves about $30/month) or enabled (per-task CPU/memory/network graphs for debugging, AWS/ECS/ContainerInsights). Autoscaling and alarms do not depend on it."
  validation {
    condition     = contains(["disabled", "enabled", "enhanced"], var.container_insights)
    error_message = "container_insights must be disabled, enabled or enhanced."
  }
}
variable "worker_spot" {
  type        = bool
  default     = false
  description = "Run the worker on Fargate Spot (up to 70 % cheaper): one task stays on regular Fargate, the rest are split half on regular Fargate, half on Spot (weight 1:1). Safe for the queue: an interrupted job is retried."
}
variable "api_spot" {
  type        = bool
  default     = false
  description = "Run extra API tasks on Fargate Spot (up to 70 % cheaper): the first task stays on regular Fargate (base 1), tasks added by autoscaling are split half regular, half Spot (weight 1:1; ECS does not fall back to regular Fargate when Spot has no capacity, so half of the new tasks always start). A Spot interruption gives 2 minutes: the ALB drains the task and the app reconnects through the other tasks."
}
variable "night_scale_down" {
  type        = bool
  default     = false
  description = "Quiet hours: lower the minimum task count of api and worker on a schedule and restore it in the morning."
}
variable "night_min_tasks" {
  type    = number
  default = 1
}
variable "night_start_cron" {
  type        = string
  default     = "cron(0 7 * * ? *)"
  description = "UTC; 07:00 UTC is 03:00 US Eastern, outside the US peak."
}
variable "night_end_cron" {
  type    = string
  default = "cron(0 12 * * ? *)"
}
variable "alb_resource_label" {
  type        = string
  description = "<alb arn_suffix>/<api target group arn_suffix> for ALBRequestCountPerTarget scaling."
}
variable "api_requests_per_task" {
  type    = number
  default = 200
}
variable "metrics_namespace" {
  type        = string
  default     = ""
  description = "CloudWatch namespace of the app metrics (LawBid/<name>, modules/monitoring); holds QueueWaitingTotal. Empty = worker scales on CPU only."
}
variable "worker_jobs_per_task" {
  type        = number
  default     = 50
  description = "Queue-depth scaling of the worker: target waiting jobs per running worker task. 0 = CPU only."
}
variable "log_retention_days" {
  type    = number
  default = 30
}
# Security research #5 (2026-10-22), A8: `readonlyRootFilesystem` on the
# api / worker / admin / migrate containers (not the ClamAV sidecar, which
# updates its signature database on disk). Each writable path is an
# ephemeral task volume (Fargate has no tmpfs): /tmp for the API and the
# worker (heartbeat file, sharp / pdf temp files), the Next.js cache for
# the admin, /tmp and the npm cache for the migrate task. Off = the old
# behaviour, if a release ever needs to write somewhere new.
variable "readonly_root_filesystem" {
  type    = bool
  default = true
}
variable "deployment_alarm_rollback" {
  type        = bool
  default     = true
  description = <<-EOT
    P1 deploy safety (2026-10-24): ECS rolling deployment + CloudWatch alarm
    rollback. While a release rolls out (and during the bake time ECS derives
    from the alarms' periods) ECS watches the alarms below; the first one that
    goes OK -> ALARM fails the deployment and rolls back to the last
    completed one. Works together with the deployment circuit breaker (either
    one can fail the rollout). false = circuit breaker only (the old
    behaviour). Changing it is an in-place UpdateService (no replacement).
  EOT
}
variable "api_deployment_alarm_names" {
  type        = list(string)
  default     = []
  description = "Alarms watched while the api rolls out (ALB 5xx ratio, p95, unhealthy hosts, optionally SLO composites). Empty = no alarm rollback for the api."
}
variable "worker_deployment_alarm_names" {
  type        = list(string)
  default     = []
  description = "Alarms watched while the worker rolls out. Empty = circuit breaker only."
}
variable "admin_deployment_alarm_names" {
  type        = list(string)
  default     = []
  description = "Alarms watched while the admin rolls out. Empty = circuit breaker only."
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
    value = var.container_insights
  }
  tags = var.tags
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

resource "aws_cloudwatch_log_group" "svc" {
  for_each          = toset(["api", "worker", "clamav", "admin", "migrate"])
  name              = "/lawbid/${var.name}/${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
  tags              = var.tags
}

# Cleanup (AWS cleanup audit 2026-10-23): Container Insights writes its
# per-task performance events to /aws/ecs/containerinsights/<cluster>/performance,
# a group AWS creates by itself with "never expire". Set the retention with the
# AWS CLI (create if missing, then put-retention-policy): works whether or not
# the group exists yet. A failure only warns.
resource "terraform_data" "insights_log_retention" {
  triggers_replace = [aws_ecs_cluster.this.name, var.log_retention_days, var.container_insights]
  provisioner "local-exec" {
    on_failure = continue
    # Insights off (default): nothing writes the group any more, skip (an
    # old group keeps the retention it already has).
    command = <<-EOT
      if [ "${var.container_insights}" != "disabled" ]; then
        G="/aws/ecs/containerinsights/${aws_ecs_cluster.this.name}/performance"
        aws logs create-log-group --region ${data.aws_region.current.name} --log-group-name "$G" 2>/dev/null || true
        aws logs put-retention-policy --region ${data.aws_region.current.name} --log-group-name "$G" --retention-in-days ${var.log_retention_days}
      fi
    EOT
  }
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
  # Scale audit 2026-10-23: Node sizes its heap at about a quarter of the
  # container memory (1 GiB API task = a 256 MB heap) and the image sets no
  # limit at run time, so a busy task hit "heap out of memory" with most of
  # its RAM unused. The V8 heap is set to 70 % of what the container owns
  # (the rest is buffers: image processing, sockets, native code). The
  # worker task shares its memory with the ClamAV sidecar.
  heap_mb = {
    api    = floor(var.api_memory * 0.7)
    worker = floor(max(var.worker_memory - var.clamav_memory, 512) * 0.7)
    admin  = floor(var.admin_memory * 0.7)
  }
  node_options = { for k, mb in local.heap_mb : k => { name = "NODE_OPTIONS", value = "--max-old-space-size=${mb}" } }
  api_secrets  = [for k, arn in var.secret_arns : { name = k, valueFrom = arn }]
  log_config = { for svc in ["api", "worker", "clamav", "admin", "migrate"] : svc => {
    logDriver = "awslogs"
    options = {
      awslogs-group         = aws_cloudwatch_log_group.svc[svc].name
      awslogs-region        = data.aws_region.current.name
      awslogs-stream-prefix = svc
    }
  } }
}

resource "aws_ecs_task_definition" "api" {
  family = "${var.name}-api"
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  volume { name = "tmp" }
  container_definitions = jsonencode([{
    name         = "api"
    image        = var.api_image
    essential    = true
    command      = ["node", "dist/src/main.js"]
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    environment  = concat(local.api_environment, [{ name = "PORT", value = "3000" }, { name = "JOBS_ENABLED", value = "false" }, local.node_options["api"]])
    secrets      = local.api_secrets
    # Security research #5 (2026-10-22), A8: the container's file system is
    # read-only; only the volumes below are writable. `init` reaps zombies
    # and forwards signals.
    readonlyRootFilesystem = var.readonly_root_filesystem
    linuxParameters        = { initProcessEnabled = true }
    mountPoints            = [{ sourceVolume = "tmp", containerPath = "/tmp", readOnly = false }]
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/health/live || exit 1"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
    # Owner 2026-10-23 («связь пропала»): on SIGTERM the API sends every
    # socket `server:going-away` with a random 0-20 s retry and serves the
    # existing ones until they leave (up to ~35 s, realtime.gateway.ts
    # drainBudgetMs). SIGKILL must come after that: 60 s (Fargate max 120).
    # Keep >= the ALB deregistration_delay of the api target group.
    stopTimeout      = 60
    logConfiguration = local.log_config["api"]
  }])
  tags = var.tags
}

resource "aws_ecs_task_definition" "worker" {
  family = "${var.name}-worker"
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  volume { name = "tmp" }
  container_definitions = jsonencode([{
    name      = "worker"
    image     = var.api_image
    essential = true
    command   = ["node", "dist/src/worker.js"]
    # Uploads are scanned by the clamd sidecar below (same task, localhost):
    # without a scanner every photo/document stays scan_status=pending.
    environment = concat(local.api_environment, [{ name = "CLAMAV_HOST", value = "127.0.0.1" }, local.node_options["worker"]])
    secrets     = local.api_secrets
    # Security research #5 (2026-10-22), A8: the container's file system is
    # read-only; only the volumes below are writable. `init` reaps zombies
    # and forwards signals.
    readonlyRootFilesystem = var.readonly_root_filesystem
    linuxParameters        = { initProcessEnabled = true }
    mountPoints            = [{ sourceVolume = "tmp", containerPath = "/tmp", readOnly = false }]
    dependsOn              = [{ containerName = "clamav", condition = "HEALTHY" }]
    stopTimeout            = 120
    # Zero maintenance (owner 2026-10-05): the worker touches this file every
    # 30 s while its job loop runs (src/jobs/jobs.runner.ts); a hung or
    # stopped worker is replaced by ECS without anybody noticing.
    healthCheck = {
      command     = ["CMD-SHELL", "find /tmp/lawbid-worker-heartbeat -mmin -2 | grep -q . || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 120
    }
    logConfiguration = local.log_config["worker"]
    }, {
    # Official ClamAV image: freshclam downloads the signatures at start
    # and every 2 h, clamd listens on 3310. Essential: a dead scanner
    # replaces the whole task.
    name              = "clamav"
    image             = var.clamav_image
    essential         = true
    memoryReservation = var.clamav_memory
    healthCheck = {
      command     = ["CMD-SHELL", "clamdcheck.sh"]
      interval    = 30
      timeout     = 10
      retries     = 10
      startPeriod = 300
    }
    logConfiguration = local.log_config["clamav"]
  }])
  tags = var.tags
}

resource "aws_ecs_task_definition" "admin" {
  family = "${var.name}-admin"
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.admin_cpu
  memory                   = var.admin_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task_minimal.arn
  volume { name = "tmp" }
  volume { name = "next-cache" }
  container_definitions = jsonencode([{
    name         = "admin"
    image        = var.admin_image
    essential    = true
    portMappings = [{ containerPort = 3001, protocol = "tcp" }]
    environment  = concat([for k, v in var.admin_env : { name = k, value = v }], [local.node_options["admin"]])
    # Security research #5 (2026-10-22), A8: the container's file system is
    # read-only; only the volumes below are writable. `init` reaps zombies
    # and forwards signals.
    readonlyRootFilesystem = var.readonly_root_filesystem
    linuxParameters        = { initProcessEnabled = true }
    mountPoints = [
      { sourceVolume = "tmp", containerPath = "/tmp", readOnly = false },
      # apps/admin/Dockerfile: WORKDIR /app, the standalone server at
      # apps/admin/server.js; Next writes its fetch / image cache here.
      { sourceVolume = "next-cache", containerPath = "/app/apps/admin/.next/cache", readOnly = false },
    ]
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
  volume { name = "tmp" }
  container_definitions = jsonencode([{
    name      = "migrate"
    image     = var.api_image
    essential = true
    command   = ["npx", "prisma", "migrate", "deploy"]
    # npx / Prisma want a writable cache and home: both under /tmp.
    # No DB_POOLER_*: `prisma migrate` must reach the database directly
    # (docs/architecture/DB_POOLER.md).
    environment = concat([for e in local.api_environment : e if !startswith(e.name, "DB_POOLER_")], [
      { name = "HOME", value = "/tmp" },
      { name = "npm_config_cache", value = "/tmp/npm-cache" },
      { name = "npm_config_update_notifier", value = "false" },
      { name = "CHECKPOINT_DISABLE", value = "1" },
    ])
    secrets = [{ name = "DATABASE_URL", valueFrom = var.migrator_database_url_secret_arn }]
    # Security research #5 (2026-10-22), A8: the container's file system is
    # read-only; only the volumes below are writable. `init` reaps zombies
    # and forwards signals.
    readonlyRootFilesystem = var.readonly_root_filesystem
    linuxParameters        = { initProcessEnabled = true }
    mountPoints            = [{ sourceVolume = "tmp", containerPath = "/tmp", readOnly = false }]
    logConfiguration       = local.log_config["migrate"]
  }])
  tags = var.tags
}

# --- services --------------------------------------------------------------
resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = coalesce(var.api_min_tasks, var.min_tasks)
  launch_type     = var.api_spot ? null : "FARGATE"
  # Needed for api_spot / worker_spot: adding or removing a capacity provider
  # strategy on a running service makes the AWS provider REPLACE the service
  # (downtime) unless force_new_deployment is true; with it the change is an
  # in-place UpdateService and a normal rolling deployment.
  force_new_deployment              = true
  platform_version                  = "LATEST"
  health_check_grace_period_seconds = 60
  enable_execute_command            = false
  propagate_tags                    = "SERVICE"

  dynamic "capacity_provider_strategy" {
    for_each = var.api_spot ? { FARGATE = { base = 1, weight = 1 }, FARGATE_SPOT = { base = 0, weight = 1 } } : {}
    content {
      capacity_provider = capacity_provider_strategy.key
      base              = capacity_provider_strategy.value.base
      weight            = capacity_provider_strategy.value.weight
    }
  }

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
  dynamic "load_balancer" {
    for_each = var.api_ws_target_group_arn == "" ? [] : [var.api_ws_target_group_arn]
    content {
      target_group_arn = load_balancer.value
      container_name   = "api"
      container_port   = 3000
    }
  }
  # Rolling, zero-downtime; automatic rollback on a failed deployment
  # (docs/06 §7.3 "автоматический откат при провале health-check").
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  # P1 deploy safety: roll back on alarms too (see var.deployment_alarm_rollback).
  dynamic "alarms" {
    for_each = var.deployment_alarm_rollback && length(var.api_deployment_alarm_names) > 0 ? [1] : []
    content {
      alarm_names = var.api_deployment_alarm_names
      enable      = true
      rollback    = true
    }
  }
  lifecycle { ignore_changes = [desired_count] }
  tags = merge(var.tags, { Component = "api" })
}

resource "aws_ecs_service" "worker" {
  name            = "worker"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.min_tasks
  launch_type     = var.worker_spot ? null : "FARGATE"
  # Needed for api_spot / worker_spot: adding or removing a capacity provider
  # strategy on a running service makes the AWS provider REPLACE the service
  # (downtime) unless force_new_deployment is true; with it the change is an
  # in-place UpdateService and a normal rolling deployment.
  force_new_deployment   = true
  platform_version       = "LATEST"
  enable_execute_command = false
  propagate_tags         = "SERVICE"
  dynamic "capacity_provider_strategy" {
    for_each = var.worker_spot ? { FARGATE = { base = 1, weight = 1 }, FARGATE_SPOT = { base = 0, weight = 1 } } : {}
    content {
      capacity_provider = capacity_provider_strategy.key
      base              = capacity_provider_strategy.value.base
      weight            = capacity_provider_strategy.value.weight
    }
  }
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
  # P1 deploy safety: roll back on alarms too (see var.deployment_alarm_rollback).
  dynamic "alarms" {
    for_each = var.deployment_alarm_rollback && length(var.worker_deployment_alarm_names) > 0 ? [1] : []
    content {
      alarm_names = var.worker_deployment_alarm_names
      enable      = true
      rollback    = true
    }
  }
  lifecycle { ignore_changes = [desired_count] }
  tags = merge(var.tags, { Component = "worker" })
}

resource "aws_ecs_service" "admin" {
  name                              = "admin"
  cluster                           = aws_ecs_cluster.this.id
  task_definition                   = aws_ecs_task_definition.admin.arn
  desired_count                     = var.admin_tasks
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
  # P1 deploy safety: roll back on alarms too (see var.deployment_alarm_rollback).
  dynamic "alarms" {
    for_each = var.deployment_alarm_rollback && length(var.admin_deployment_alarm_names) > 0 ? [1] : []
    content {
      alarm_names = var.admin_deployment_alarm_names
      enable      = true
      rollback    = true
    }
  }
  tags = merge(var.tags, { Component = "admin" })
}

# --- autoscaling (§6.3: CPU 60 %, min var.min_tasks, max per env) --------------------
resource "aws_appautoscaling_target" "svc" {
  for_each = {
    api    = { service = aws_ecs_service.api.name, max = var.api_max_tasks }
    worker = { service = aws_ecs_service.worker.name, max = var.worker_max_tasks }
  }
  service_namespace  = "ecs"
  scalable_dimension = "ecs:service:DesiredCount"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${each.value.service}"
  min_capacity       = each.key == "api" ? coalesce(var.api_min_tasks, var.min_tasks) : var.min_tasks
  max_capacity       = each.value.max

  # Owner 2026-10-16: var.*_max_tasks is the hard cap. The running ceiling
  # is moved by the app (economy.guard job, RegisterScalableTarget) from
  # the revenue rule; terraform apply must not reset it to the cap. The
  # first creation still uses the cap, the job lowers it within 5 minutes.
  lifecycle {
    ignore_changes = [max_capacity]
  }
}

# --- quiet hours (opt-in): fewer tasks at night, back in the morning --------
# A scheduled action moves only the minimum; the CPU and request policies
# above still add tasks if night traffic needs them. While the night minimum
# is active `terraform plan` shows the target's min_capacity as drift; it is
# restored by the morning action.
resource "aws_appautoscaling_scheduled_action" "night_down" {
  for_each           = var.night_scale_down ? { for k, t in aws_appautoscaling_target.svc : k => t if t.min_capacity > var.night_min_tasks } : {}
  name               = "${var.name}-${each.key}-night-down"
  service_namespace  = each.value.service_namespace
  scalable_dimension = each.value.scalable_dimension
  resource_id        = each.value.resource_id
  schedule           = var.night_start_cron
  timezone           = "UTC"
  scalable_target_action {
    min_capacity = var.night_min_tasks
  }
}

resource "aws_appautoscaling_scheduled_action" "morning_up" {
  for_each           = var.night_scale_down ? { for k, t in aws_appautoscaling_target.svc : k => t if t.min_capacity > var.night_min_tasks } : {}
  name               = "${var.name}-${each.key}-morning-up"
  service_namespace  = each.value.service_namespace
  scalable_dimension = each.value.scalable_dimension
  resource_id        = each.value.resource_id
  schedule           = var.night_end_cron
  timezone           = "UTC"
  scalable_target_action {
    min_capacity = each.value.min_capacity
  }
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each           = aws_appautoscaling_target.svc
  name               = "${var.name}-${each.key}-cpu60"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = each.value.service_namespace
  scalable_dimension = each.value.scalable_dimension
  resource_id        = each.value.resource_id
  target_tracking_scaling_policy_configuration {
    target_value = 60
    # Out fast (60 s), in slowly (10 min): no flapping on short spikes.
    # Owner 2026-10-23: every scale-in is a deploy for the sockets on the
    # stopped task (they drain, see stopTimeout), so scale-in is slow on
    # purpose; do not shorten scale_in_cooldown. Peak hours: raise
    # min_tasks with a scheduled action (the night_end_cron pattern above)
    # instead of letting the policy shrink the service before the peak.
    scale_in_cooldown  = 600
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
output "api_service_arn" { value = aws_ecs_service.api.id }
output "worker_service_arn" { value = aws_ecs_service.worker.id }
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
    scale_in_cooldown  = 600
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = var.alb_resource_label
    }
  }
}

# Owner 2026-10-22 (load audit #10): the worker also scales on queue depth.
# CPU stays low while jobs wait on Stripe / FCM / ClamAV, so CPU alone never
# adds a worker for a backlog. Metric: QueueWaitingTotal (one line a minute
# from the worker's ops.metrics job, log metric filter in modules/monitoring)
# divided by the running worker tasks: the AWS "backlog per task" pattern.
# Running tasks = SampleCount of LawBid/Runtime HeapUsedMb {Service=worker}:
# each running worker writes one such line a minute (RuntimeStatsService), so
# the sample count per minute is the task count (checked against ECS/
# ContainerInsights RunningTaskCount on 2026-10-24: same value, 1 or 2 during
# deploys). Free; replaces Container Insights (about $30/month). A late line
# can show one extra sample for a minute: the ratio dips for that minute only,
# scale-out stays fast, scale-in has a 10 minute cooldown. Caveat: the metric
# has no cluster dimension, so a second environment in the same account (the
# load-test stack) adds to the count while it runs. The CPU policy above stays; with two target
# tracking policies the larger desired count wins.
# https://docs.aws.amazon.com/autoscaling/application/userguide/application-auto-scaling-target-tracking-metric-math.html
resource "aws_appautoscaling_policy" "worker_queue" {
  count              = var.worker_jobs_per_task > 0 && var.metrics_namespace != "" ? 1 : 0
  name               = "${var.name}-worker-queue"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.svc["worker"].service_namespace
  scalable_dimension = aws_appautoscaling_target.svc["worker"].scalable_dimension
  resource_id        = aws_appautoscaling_target.svc["worker"].resource_id
  target_tracking_scaling_policy_configuration {
    target_value       = var.worker_jobs_per_task
    scale_in_cooldown  = 600
    scale_out_cooldown = 60
    customized_metric_specification {
      metrics {
        id          = "waiting"
        label       = "Waiting jobs, all consumed queues"
        return_data = false
        metric_stat {
          metric {
            metric_name = "QueueWaitingTotal"
            namespace   = var.metrics_namespace
          }
          stat = "Maximum"
        }
      }
      metrics {
        id          = "tasks"
        label       = "Running worker tasks"
        return_data = false
        metric_stat {
          metric {
            metric_name = "HeapUsedMb"
            namespace   = "LawBid/Runtime"
            dimensions {
              name  = "Service"
              value = "worker"
            }
          }
          stat = "SampleCount"
        }
      }
      metrics {
        id          = "per_task"
        label       = "Waiting jobs per worker task"
        expression  = "waiting / tasks"
        return_data = true
      }
    }
  }
}
