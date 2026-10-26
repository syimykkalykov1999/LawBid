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
variable "recovery_window_in_days" {
  type        = number
  default     = 30
  description = "Days a deleted secret can be restored. 0 = deleted at once (throw-away load-test stacks, so the same name can be created again)."
}
variable "deletion_protection" {
  type        = bool
  default     = true
  description = "Prod: true. Throw-away load-test stacks: false, otherwise terraform destroy cannot remove the database."
}
variable "skip_final_snapshot" {
  type        = bool
  default     = false
  description = "Prod: false (a final snapshot is kept). Load-test stacks: true."
}
variable "tags" {
  type    = map(string)
  default = {}
}

# --- DB ops hardening (2026-10-25, claude/db-ops-hardening) -----------------
variable "engine_version" {
  type        = string
  default     = "16"
  description = "PostgreSQL version. \"16\" = latest 16.x minor (auto minor upgrades on). To pin: set e.g. \"16.6\" (test on staging first) and the stack will not move until you change it. See docs/runbooks/db-ops.md."
}
variable "auto_minor_version_upgrade" {
  type        = bool
  default     = true
  description = "Let RDS apply minor versions in the Sunday maintenance window. Set false together with a pinned engine_version."
}
variable "rds_logical_replication" {
  type        = bool
  default     = false
  description = "rds.logical_replication = 1. Needed for shard moves and Blue/Green major upgrades. STATIC parameter: takes effect only after a REBOOT - do it in the planned Sunday Multi-AZ reboot (docs/runbooks/db-ops.md)."
}
variable "monitoring_interval" {
  type        = number
  default     = 0
  description = "RDS Enhanced Monitoring interval in seconds (0 = off, 1, 5, 10, 15, 30, 60). 60 costs a few dollars a month in CloudWatch Logs."
  validation {
    condition     = contains([0, 1, 5, 10, 15, 30, 60], var.monitoring_interval)
    error_message = "monitoring_interval must be 0, 1, 5, 10, 15, 30 or 60."
  }
}
variable "autovacuum_vacuum_scale_factor" {
  type        = number
  default     = 0.05
  description = "Instance-wide default (PostgreSQL: 0.2). A 500M-row table is vacuumed after 25M dead rows instead of 100M. The hot tables get their own, lower value from a migration (20261101300000_autovacuum_hot_tables)."
}
variable "autovacuum_analyze_scale_factor" {
  type        = number
  default     = 0.02
  description = "Instance-wide default (PostgreSQL: 0.1)."
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
    value = tostring(var.slow_query_log_ms)
  }
  # S20-3: never write the bind values ($1 = 'phone / e-mail / message id')
  # next to a slow statement; the CloudWatch export is not a place for PII.
  # Both are dynamic parameters (no reboot).
  parameter {
    name  = "log_parameter_max_length"
    value = "0"
  }
  parameter {
    name  = "log_parameter_max_length_on_error"
    value = "0"
  }
  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements"
    apply_method = "pending-reboot"
  }

  # --- autovacuum / bloat visibility (docs/runbooks/db-ops.md) -------------
  # All of these are dynamic (applied at once, no reboot).
  # Every autovacuum / autoanalyze that runs longer than 1 s is logged.
  parameter {
    name  = "log_autovacuum_min_duration"
    value = "1000"
  }
  # A query that waited on a lock longer than deadlock_timeout is logged.
  parameter {
    name  = "log_lock_waits"
    value = "1"
  }
  parameter {
    name  = "deadlock_timeout"
    value = "1000"
  }
  # Time spent in I/O shows in EXPLAIN (BUFFERS) and pg_stat_statements.
  parameter {
    name  = "track_io_timing"
    value = "1"
  }
  # Temp files over 10 MB (value in kB) mean a sort / hash spilled to disk.
  parameter {
    name  = "log_temp_files"
    value = "10240"
  }
  parameter {
    name  = "autovacuum_vacuum_scale_factor"
    value = tostring(var.autovacuum_vacuum_scale_factor)
  }
  parameter {
    name  = "autovacuum_vacuum_insert_scale_factor"
    value = tostring(var.autovacuum_vacuum_scale_factor)
  }
  parameter {
    name  = "autovacuum_analyze_scale_factor"
    value = tostring(var.autovacuum_analyze_scale_factor)
  }
  # STATIC: only when asked for, applied by the next reboot.
  dynamic "parameter" {
    for_each = var.rds_logical_replication ? [1] : []
    content {
      name         = "rds.logical_replication"
      value        = "1"
      apply_method = "pending-reboot"
    }
  }
  tags = var.tags
}

# Enhanced Monitoring needs a role RDS can assume (only when switched on).
resource "aws_iam_role" "monitoring" {
  count = var.monitoring_interval > 0 ? 1 : 0
  name  = "${var.name}-rds-monitoring"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "monitoring" {
  count      = var.monitoring_interval > 0 ? 1 : 0
  role       = aws_iam_role.monitoring[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

resource "random_password" "master" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "master" {
  name                    = "${var.name}/postgres-master"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = var.tags
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

variable "slow_query_log_ms" {
  type        = number
  default     = 500
  description = "log_min_duration_statement, milliseconds (S20-3, cost registry row aws.cloudwatch_slowlog). Raise to 2000 during a slow-database storm (ops.db_slow_log_mode auto / on in the admin tells you when) to stop the slow log from flooding CloudWatch."
  validation {
    condition     = var.slow_query_log_ms >= 100 && var.slow_query_log_ms <= 60000
    error_message = "slow_query_log_ms must be 100..60000."
  }
}
variable "log_group_class" {
  type        = string
  default     = "INFREQUENT_ACCESS"
  description = "CloudWatch log class of the RDS postgresql / upgrade logs (S20-11, cost registry row aws.cloudwatch_ia). INFREQUENT_ACCESS = half the ingest price; it has no metric filters / subscriptions, and nothing here uses them. STANDARD = old behaviour. Immutable in AWS: changing it replaces the group (its old lines are dropped)."
  validation {
    condition     = contains(["STANDARD", "INFREQUENT_ACCESS"], var.log_group_class)
    error_message = "log_group_class must be STANDARD or INFREQUENT_ACCESS."
  }
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
  log_group_class   = var.log_group_class
  kms_key_id        = var.kms_key_arn
  tags              = var.tags
}

resource "aws_db_instance" "this" {
  identifier     = "${var.name}-postgres"
  engine         = "postgres"
  engine_version = var.engine_version
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
  delete_automated_backups  = var.skip_final_snapshot
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.name}-postgres-final"

  auto_minor_version_upgrade            = var.auto_minor_version_upgrade
  monitoring_interval                   = var.monitoring_interval
  monitoring_role_arn                   = var.monitoring_interval > 0 ? aws_iam_role.monitoring[0].arn : null
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
