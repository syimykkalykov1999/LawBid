# Our own database connection pooler (docs/architecture/DB_POOLER.md).
#
# A small central PgBouncer service in front of the database: every API and
# worker task opens its connections to the pooler, the pooler keeps a FIXED,
# small number of connections to PostgreSQL. 70 app tasks (or 700) never use
# more database connections than `pool_size * max_tasks` of this module.
#
#   api / worker tasks --TLS--> pgbouncer.<name>.internal (Cloud Map DNS, A records of the tasks) --TLS--> RDS
#
# * Image: ECR lawbid-pgbouncer (infra/pgbouncer, built by
#   .github/workflows/build-pgbouncer.yml, amd64 + arm64).
# * Credentials: the pooler reads the DIRECT DATABASE_URL secret (Secrets
#   Manager, injected by ECS) and builds its user list from it at start. No
#   password is in Terraform state beyond the secret's ARN.
# * Reachability: only the client security group (api / worker / migrate
#   tasks share one) reaches the pooler; only the pooler (plus the existing
#   task rule) reaches RDS.
# * Discovery: AWS Cloud Map private DNS namespace "<name>.internal", ECS
#   service registry, A records with a 10 s TTL, multivalue answers (both
#   tasks, rough load spreading). About 0.5 USD / month (the private hosted
#   zone Cloud Map creates). Trade-off: no health-checked load balancer - a
#   client may hold the address of a task that just stopped; see
#   docs/architecture/DB_POOLER.md section 2.1.
# * Capacity: tasks x (default_pool_size + reserve) <= the database budget
#   worked out by modules/stack (check "db_connection_budget").
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

data "aws_region" "current" {}

variable "name" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "cluster_arn" {
  type        = string
  description = "The stack's ECS cluster (modules/ecs)."
}
variable "cluster_name" { type = string }
variable "client_security_group_id" {
  type        = string
  description = "Security group of the api / worker tasks: the only one allowed to reach the pooler."
}
variable "database_security_group_id" {
  type        = string
  default     = ""
  description = "Security group of the database. Empty (database not created by us): add the pooler's security group to it by hand."
}
variable "database_url_secret_arn" {
  type        = string
  description = "Secrets Manager secret holding the DIRECT DATABASE_URL of the app role."
}
variable "kms_key_arn" { type = string }
variable "image" {
  type        = string
  description = "ECR image of the pooler (<registry>/lawbid-pgbouncer:<tag>)."
}
variable "cpu_architecture" {
  type    = string
  default = "ARM64"
}
variable "cpu" {
  type        = number
  default     = 512
  description = "PgBouncer is single-threaded: more than 1024 does not help, add tasks instead."
}
variable "memory" {
  type    = number
  default = 1024
}
variable "min_tasks" {
  type        = number
  default     = 2
  description = "Two tasks in two availability zones."
}
variable "max_tasks" {
  type        = number
  default     = 3
  description = "Hard ceiling of CPU autoscaling. The per-task pool is sized so that max_tasks tasks fit the database budget."
}
variable "pool_size" {
  type        = number
  description = "Server connections to the database per task (default_pool_size)."
}
variable "reserve_pool_size" {
  type    = number
  default = 3
}
variable "max_client_conn" {
  type    = number
  default = 5000
}
variable "query_wait_timeout" {
  type        = number
  default     = 30
  description = "Seconds a request may wait for a server connection before it fails."
}
variable "db_tls_mode" {
  type        = string
  default     = "require"
  description = "server_tls_sslmode towards the database: require, verify-ca or verify-full (the last two need a CA file in the image)."
}
variable "cpu_target" {
  type    = number
  default = 50
}
variable "log_retention_days" {
  type    = number
  default = 30
}
variable "metrics_namespace" {
  type        = string
  description = "CloudWatch namespace for the pool metrics (EMF lines from the container)."
}
variable "alarm_actions" {
  type    = list(string)
  default = []
}
variable "runbook_url" {
  type    = string
  default = ""
}
variable "tags" {
  type    = map(string)
  default = {}
}

locals {
  svc            = "pgbouncer"
  server_total   = var.pool_size + var.reserve_pool_size
  max_server_cap = local.server_total # max_db_connections of ONE task
}

# --- logs -------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "this" {
  name              = "/lawbid/${var.name}/${local.svc}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
  tags              = var.tags
}

# --- IAM: pull the image, write logs, read ONE secret ------------------------
data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.name}-pgbouncer-execution"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_secret" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.database_url_secret_arn]
  }
  statement {
    actions   = ["kms:Decrypt"]
    resources = [var.kms_key_arn]
  }
}

resource "aws_iam_role_policy" "execution_secret" {
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secret.json
}

# The container itself needs no AWS permission at all (metrics travel as log
# lines), so it has a task role with no policy.
resource "aws_iam_role" "task" {
  name               = "${var.name}-pgbouncer-task"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

# --- network ----------------------------------------------------------------
resource "aws_security_group" "svc" {
  name        = "${var.name}-pgbouncer"
  description = "PgBouncer tasks: app tasks in, database and AWS APIs out"
  vpc_id      = var.vpc_id
  tags        = merge(var.tags, { Name = "${var.name}-pgbouncer" })
}

resource "aws_vpc_security_group_ingress_rule" "svc_from_clients" {
  security_group_id            = aws_security_group.svc.id
  referenced_security_group_id = var.client_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "api / worker tasks"
}

resource "aws_vpc_security_group_egress_rule" "svc_to_db" {
  security_group_id = aws_security_group.svc.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 5432
  to_port           = 5432
  description       = "database (RDS accepts only security groups that are allowed on it)"
}

resource "aws_vpc_security_group_egress_rule" "svc_https" {
  security_group_id = aws_security_group.svc.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "ECR image pull, Secrets Manager, CloudWatch Logs"
}

# The database accepts the pooler.
resource "aws_vpc_security_group_ingress_rule" "db_from_pooler" {
  count                        = var.database_security_group_id == "" ? 0 : 1
  security_group_id            = var.database_security_group_id
  referenced_security_group_id = aws_security_group.svc.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "PgBouncer"
}

# --- service discovery: Cloud Map private DNS --------------------------------------
# <svc>.<name>.internal resolves (inside this VPC only) to the private IPs of
# the running pooler tasks. ECS adds a task's address when it starts and
# removes it when it stops (before the stop signal; stopTimeout 30 s outlives
# the 10 s TTL, so a cached address stays usable while the task drains).
resource "aws_service_discovery_private_dns_namespace" "this" {
  name        = "${var.name}.internal"
  description = "LawBid internal names (database pooler)"
  vpc         = var.vpc_id
  tags        = var.tags
}

resource "aws_service_discovery_service" "this" {
  name = local.svc
  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.this.id
    routing_policy = "MULTIVALUE"
    dns_records {
      type = "A"
      ttl  = 10
    }
  }
  health_check_custom_config {
    failure_threshold = 1
  }
  tags = var.tags
}

# --- task and service -----------------------------------------------------------
resource "aws_ecs_task_definition" "this" {
  family = "${var.name}-pgbouncer"
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  volume { name = "tmp" }
  container_definitions = jsonencode([{
    name         = local.svc
    image        = var.image
    essential    = true
    portMappings = [{ containerPort = 5432, protocol = "tcp" }]
    environment = [
      { name = "POOL_SIZE", value = tostring(var.pool_size) },
      { name = "RESERVE_POOL", value = tostring(var.reserve_pool_size) },
      { name = "MAX_DB_CONNECTIONS", value = tostring(local.max_server_cap) },
      { name = "MAX_CLIENT_CONN", value = tostring(var.max_client_conn) },
      { name = "QUERY_WAIT_TIMEOUT", value = tostring(var.query_wait_timeout) },
      { name = "DB_TLS_MODE", value = var.db_tls_mode },
      { name = "METRICS_NAMESPACE", value = var.metrics_namespace },
    ]
    secrets                = [{ name = "DATABASE_URL", valueFrom = var.database_url_secret_arn }]
    readonlyRootFilesystem = true
    linuxParameters        = { initProcessEnabled = true }
    mountPoints            = [{ sourceVolume = "tmp", containerPath = "/tmp", readOnly = false }]
    healthCheck = {
      command     = ["CMD-SHELL", "pg_isready -h 127.0.0.1 -p 5432 -t 3 || exit 1"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 15
    }
    # SIGINT (image STOPSIGNAL) = safe shutdown: running transactions end.
    stopTimeout = 30
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.this.name
        awslogs-region        = data.aws_region.current.name
        awslogs-stream-prefix = local.svc
      }
    }
  }])
  tags = var.tags
}

resource "aws_ecs_service" "this" {
  name             = local.svc
  cluster          = var.cluster_arn
  task_definition  = aws_ecs_task_definition.this.arn
  desired_count    = var.min_tasks
  launch_type      = "FARGATE"
  platform_version = "LATEST"
  # Never more tasks than max_tasks (each one holds pool_size + reserve
  # database connections): a deploy stops one task, then starts its
  # replacement. The remaining task(s) carry the traffic meanwhile - deploy
  # the pooler off-peak.
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 100
  enable_execute_command             = false
  propagate_tags                     = "SERVICE"
  force_new_deployment               = true

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.svc.id]
    assign_public_ip = false
  }
  service_registries {
    registry_arn = aws_service_discovery_service.this.arn
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  lifecycle { ignore_changes = [desired_count] }
  tags = var.tags
}

# --- autoscaling on CPU (the single PgBouncer thread is the first limit) ---------
resource "aws_appautoscaling_target" "this" {
  service_namespace  = "ecs"
  scalable_dimension = "ecs:service:DesiredCount"
  resource_id        = "service/${var.cluster_name}/${aws_ecs_service.this.name}"
  min_capacity       = var.min_tasks
  max_capacity       = var.max_tasks
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.name}-pgbouncer-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this.service_namespace
  scalable_dimension = aws_appautoscaling_target.this.scalable_dimension
  resource_id        = aws_appautoscaling_target.this.resource_id
  target_tracking_scaling_policy_configuration {
    target_value = var.cpu_target
    # Out fast, in very slowly: every scale-in cuts the connections of one
    # task (clients reconnect to the other one).
    scale_in_cooldown  = 900
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

# --- alarms -----------------------------------------------------------------------
locals {
  runbook = var.runbook_url == "" ? "" : " Инструкция: ${var.runbook_url}"
}

# Requests are queueing for a database connection: the pool is too small or the
# database is slow. Past query_wait_timeout they fail.
resource "aws_cloudwatch_metric_alarm" "waiting" {
  alarm_name          = "${var.name}-pgbouncer-waiting"
  alarm_description   = "LawBid: Запросы ждут свободного соединения с базой (очередь в пуле больше 20 уже 3 минуты). Что делать: админка → Здоровье системы → база на размер больше; или напишите Claude «пул соединений».${local.runbook} (EN: PgBouncer clients waiting > 20 for 3 minutes.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  period              = 60
  threshold           = 20
  statistic           = "Maximum"
  metric_name         = "ClientsWaiting"
  namespace           = var.metrics_namespace
  dimensions          = { Service = "pgbouncer" }
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "max_wait" {
  alarm_name          = "${var.name}-pgbouncer-max-wait"
  alarm_description   = "LawBid: Самый долгий запрос ждёт соединения с базой больше 5 секунд (два раза подряд).${local.runbook} (EN: PgBouncer oldest waiting client > 5 s.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 60
  threshold           = 5
  statistic           = "Maximum"
  metric_name         = "MaxWaitSeconds"
  namespace           = var.metrics_namespace
  dimensions          = { Service = "pgbouncer" }
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions
  tags                = var.tags
}

# One task holds at most server_total connections; close to that = the pool is
# the bottleneck (alarm before the queue forms).
resource "aws_cloudwatch_metric_alarm" "server_connections" {
  alarm_name          = "${var.name}-pgbouncer-server-connections"
  alarm_description   = "LawBid: Пул соединений с базой почти полон (больше 90 % на одном сервере пула, 10 минут).${local.runbook} (EN: PgBouncer server connections of one task > 90% of its cap for 10 minutes.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 5
  period              = 120
  threshold           = floor(local.server_total * 0.9)
  statistic           = "Maximum"
  metric_name         = "ServerConnections"
  namespace           = var.metrics_namespace
  dimensions          = { Service = "pgbouncer" }
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions
  tags                = var.tags
}

# Every pooler task prints its metrics every 30 s, so each task adds at least
# 2 samples a minute. No samples = no pooler task is running (or all are stuck).
resource "aws_cloudwatch_metric_alarm" "no_healthy" {
  alarm_name          = "${var.name}-pgbouncer-no-healthy"
  alarm_description   = "LawBid: Ни один сервер пула соединений не работает - приложение не достаёт базу. Что делать: вернуть прямое подключение (db_pooler_enabled = false) и применить.${local.runbook} (EN: no PgBouncer metrics for 3 minutes.)"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3
  period              = 60
  threshold           = 1
  statistic           = "SampleCount"
  metric_name         = "ServerConnections"
  namespace           = var.metrics_namespace
  dimensions          = { Service = "pgbouncer" }
  treat_missing_data  = "breaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions
  tags                = var.tags
}

# Fewer samples than min_tasks tasks produce = a task is down.
resource "aws_cloudwatch_metric_alarm" "unhealthy" {
  alarm_name          = "${var.name}-pgbouncer-unhealthy"
  alarm_description   = "LawBid: Работает меньше серверов пула соединений, чем нужно (должно быть два), уже 10 минут.${local.runbook} (EN: fewer PgBouncer tasks reporting than min_tasks for 10 minutes.)"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 10
  period              = 60
  threshold           = var.min_tasks * 2
  statistic           = "SampleCount"
  metric_name         = "ServerConnections"
  namespace           = var.metrics_namespace
  dimensions          = { Service = "pgbouncer" }
  treat_missing_data  = "breaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.alarm_actions
  tags                = var.tags
}

# --- outputs ----------------------------------------------------------------------
output "endpoint" {
  value       = "${aws_service_discovery_service.this.name}.${aws_service_discovery_private_dns_namespace.this.name}"
  description = "DNS name apps connect to (DB_POOLER_HOST); resolves to the pooler task addresses."
}
output "port" { value = 5432 }
output "security_group_id" { value = aws_security_group.svc.id }
output "service_name" { value = aws_ecs_service.this.name }
output "log_group_name" { value = aws_cloudwatch_log_group.this.name }
output "server_connections_max" {
  value       = var.max_tasks * local.server_total
  description = "Most database connections the pooler can ever hold (max_tasks x (pool + reserve))."
}
