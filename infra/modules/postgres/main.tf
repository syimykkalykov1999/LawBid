# RDS for PostgreSQL 16 with automatic daily backups (docs/06 §6.1).
# Opt-in from the stack (`create_database = true`); the launch database may
# instead be any managed PostgreSQL (infra/README.md). What this adds over a
# bare instance: daily automated backups kept `backup_retention_days`,
# point-in-time recovery, encryption with our KMS key, TLS only, slow-query
# logging, deletion protection and a final snapshot; Multi-AZ when
# `multi_az` (prod). Isolated copies in a second region / account come
# from modules/backup. The restore drill that proves the backups work is
# scripts/ops/restore-drill.sh.
terraform {
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.60" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

variable "name" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "allowed_security_group_ids" { type = list(string) }
variable "kms_key_arn" { type = string }
variable "instance_class" {
  type    = string
  default = "db.t4g.medium"
}
variable "allocated_storage_gb" {
  type    = number
  default = 50
}
variable "max_allocated_storage_gb" {
  type        = number
  default     = 500
  description = "Storage grows by itself up to this size (a ceiling for the bill)."
}
variable "multi_az" {
  type        = bool
  default     = false
  description = "A standby copy in the second AZ with automatic failover (≈ 1–2 min); doubles the instance price. Prod: true (owner 2026-10-22)."
}
variable "backup_retention_days" {
  type    = number
  default = 14
  validation {
    condition     = var.backup_retention_days >= 7 && var.backup_retention_days <= 35
    error_message = "backup_retention_days: 7–35 (RDS limit 35; prod keeps at least 14)."
  }
}
variable "backup_window" {
  type        = string
  default     = "03:10-03:50"
  description = "UTC, outside the US evening peak."
}
variable "db_name" {
  type    = string
  default = "lawbid"
}
variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-postgres"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

resource "aws_security_group" "db" {
  name        = "${var.name}-postgres"
  description = "PostgreSQL from the ECS tasks only"
  vpc_id      = var.vpc_id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }
  tags = var.tags
}

resource "aws_db_parameter_group" "this" {
  name   = "${var.name}-postgres16"
  family = "postgres16"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  # Slow queries land in the log (the admin's «здоровье системы» reads them).
  parameter {
    name  = "log_min_duration_statement"
    value = "500"
  }
  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements"
    apply_method = "pending-reboot"
  }
  tags = var.tags
}

resource "random_password" "master" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "master" {
  name       = "${var.name}/postgres-master"
  kms_key_id = var.kms_key_arn
  tags       = var.tags
}

resource "aws_secretsmanager_secret_version" "master" {
  secret_id = aws_secretsmanager_secret.master.id
  secret_string = jsonencode({
    username = "lawbid_admin"
    password = random_password.master.result
    host     = aws_db_instance.this.address
    port     = 5432
    dbname   = var.db_name
  })
}

variable "log_retention_days" {
  type        = number
  default     = 30
  description = "Days the exported PostgreSQL logs are kept in CloudWatch."
}

# Scale audit 2026-10-23: when RDS exports a log it creates the CloudWatch
# group itself, with retention "never expire" - the slow-query log then
# grows (and is billed) for ever. Creating the groups first, with a
# retention, fixes that. An environment applied before this change already
# has the groups: import them once (docs/perf/SCALE_LIMITS_AUDIT_2026-10-23.md).
resource "aws_cloudwatch_log_group" "rds" {
  for_each          = toset(["postgresql", "upgrade"])
  name              = "/aws/rds/instance/${var.name}-postgres/${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
  tags              = var.tags
}

resource "aws_db_instance" "this" {
  identifier     = "${var.name}-postgres"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.instance_class

  db_name  = var.db_name
  username = "lawbid_admin"
  password = random_password.master.result

  allocated_storage     = var.allocated_storage_gb
  max_allocated_storage = var.max_allocated_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = var.kms_key_arn

  multi_az               = var.multi_az
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]
  parameter_group_name   = aws_db_parameter_group.this.name
  publicly_accessible    = false

  # Backups: a snapshot every day, the log shipped continuously (restore to
  # any second inside the retention window), tags copied to snapshots.
  backup_retention_period   = var.backup_retention_days
  backup_window             = var.backup_window
  copy_tags_to_snapshot     = true
  delete_automated_backups  = false
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.name}-postgres-final"

  auto_minor_version_upgrade            = true
  maintenance_window                    = "sun:04:30-sun:05:30"
  performance_insights_enabled          = true
  performance_insights_retention_period = 7 # free tier; longer history is billed
  performance_insights_kms_key_id       = var.kms_key_arn
  enabled_cloudwatch_logs_exports       = ["postgresql", "upgrade"]

  tags = var.tags

  depends_on = [aws_cloudwatch_log_group.rds]

  # Owner 2026-10-16: the admin («Экономика» → «Увеличить») may move the
  # database one tier up at run time; terraform apply must not undo it.
  lifecycle {
    ignore_changes = [instance_class]
  }
}

output "endpoint" { value = aws_db_instance.this.address }
output "instance_id" { value = aws_db_instance.this.identifier }
output "arn" { value = aws_db_instance.this.arn }
output "master_secret_arn" { value = aws_secretsmanager_secret.master.arn }
output "security_group_id" { value = aws_security_group.db.id }
output "backup_retention_days" { value = var.backup_retention_days }
