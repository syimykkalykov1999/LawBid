# AWS Backup for the database (Well-Architected REL09: back up, keep the
# copies isolated, REL13: plan for disaster recovery). Owner 2026-10-22:
# a daily snapshot of the RDS instance in this region, copied the same day
# to a vault in a second region (aws.replica, us-west-2 for prod) and,
# optionally, to a vault in a separate backup account. RDS's own automated
# backups (point-in-time restore, `backup_retention_period`) stay on; this
# plan adds isolated daily copies on top of them. Continuous backup through
# AWS Backup stays off on purpose: it would take over the instance's own
# retention setting.
#
# Alarms: a failed / aborted / expired backup or copy job (EventBridge →
# the alerts topic) and «no completed backup in 24 h» (CloudWatch,
# AWS/Backup).
#
# https://docs.aws.amazon.com/aws-backup/latest/devguide/cross-region-backup.html
# https://docs.aws.amazon.com/aws-backup/latest/devguide/create-cross-account-backup.html
# https://docs.aws.amazon.com/aws-backup/latest/devguide/cloudwatch.html
terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.60"
      configuration_aliases = [aws.replica]
    }
  }
}

variable "name" { type = string }
variable "resource_arns" {
  type        = list(string)
  description = "RDS instance ARNs to back up (the Terraform-managed one or the existing production instance)."
}
variable "kms_key_arn" {
  type        = string
  description = "CMK of the main-region vault."
}
variable "replica_kms_key_arn" {
  type        = string
  description = "CMK of the second-region vault."
}
variable "schedule" {
  type        = string
  default     = "cron(0 6 * * ? *)"
  description = "UTC. At least an hour away from the RDS backup window (03:10-03:50) and maintenance window (Sun 04:30-05:30): AWS Backup fails a job that starts inside or an hour before them."
}
variable "retention_days" {
  type    = number
  default = 35
}
variable "copy_retention_days" {
  type    = number
  default = 35
}
variable "copy_account_vault_arn" {
  type        = string
  default     = ""
  description = "ARN of a vault in a separate backup account (same AWS Organization, cross-account backup turned on). Empty = no cross-account copy."
}
variable "vault_lock_mode" {
  type        = string
  default     = "off"
  description = "Backup Vault Lock on both vaults. off | governance (cannot be undone by the backup role; an administrator with the right permission still can) | compliance (after `vault_lock_cooling_off_days` NOBODY, not even AWS support or the root user, can delete a recovery point early or remove the lock: ransomware and a stolen administrator cannot erase the backups). Start with governance; compliance is irreversible."
  validation {
    condition     = contains(["off", "governance", "compliance"], var.vault_lock_mode)
    error_message = "vault_lock_mode must be off, governance or compliance."
  }
}
variable "vault_lock_cooling_off_days" {
  type        = number
  default     = 7
  description = "Compliance mode only (3-36500): days during which the lock can still be removed. After this it is permanent."
}
variable "vault_lock_min_retention_days" {
  type        = number
  default     = 7
  description = "No recovery point may be deleted before it is this old (must not exceed retention_days)."
}
variable "vault_lock_max_retention_days" {
  type        = number
  default     = 400
  description = "No recovery point may be kept longer than this (must be at least retention_days)."
}
variable "alerts_topic_arn" { type = string }
variable "backup_age_missing_data" {
  type        = string
  default     = "breaching"
  description = "How the 24 h backup-age alarm treats a day with no data. breaching = a stopped plan alarms (the safe steady state). notBreaching = use ONLY between the first apply and the first completed backup job, so the alarm cannot fire falsely before a recovery point exists; switch back to breaching afterwards (docs/runbooks/restore-drill.md)."
  validation {
    condition     = contains(["breaching", "notBreaching", "ignore", "missing"], var.backup_age_missing_data)
    error_message = "backup_age_missing_data must be breaching, notBreaching, ignore or missing."
  }
}
variable "critical_topic_arn" {
  type        = string
  default     = ""
  description = "SNS topic that rings a phone. A failed restore test goes here; empty = the alerts topic."
}

# --- monthly restore test (WP-G 2026-10-25) --------------------------------
# AWS Backup's managed "restore testing": once a month it restores the newest
# recovery point of the vault into a temporary database, records status and
# duration (the RTO), and deletes the copy when the validation window ends.
# Nothing of ours runs, nothing to maintain. Cost: a restore-test fee plus a
# db.t4g.micro for about an hour, cents per month.
# https://docs.aws.amazon.com/aws-backup/latest/devguide/restore-testing.html
variable "restore_test_enabled" {
  type        = bool
  default     = true
  description = "Monthly automatic restore test of the newest backup (AWS Backup restore testing)."
}
variable "restore_test_schedule" {
  type        = string
  default     = "cron(0 14 1 * ? *)"
  description = "UTC. The 1st of the month at 14:00: eight hours after the nightly backup (06:00), outside the Sunday maintenance window."
}
variable "restore_test_db_subnet_group" {
  type        = string
  default     = ""
  description = "DB subnet group for the temporary database (the production one). Empty = AWS picks the default VPC, which does not exist here and would fail."
}
variable "restore_test_security_group_ids" {
  type        = list(string)
  default     = []
  description = "VPC security groups of the temporary database (the production database's)."
}
variable "restore_test_db_class" {
  type    = string
  default = "db.t4g.micro"
}
variable "restore_test_validation_hours" {
  type        = number
  default     = 1
  description = "Hours the restored copy lives before AWS Backup deletes it (1-168). No custom validation runs; completion and time are the proof."
}

variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_backup_vault" "main" {
  name        = "${var.name}-db"
  kms_key_arn = var.kms_key_arn
  tags        = var.tags
}

resource "aws_backup_vault" "dr" {
  provider    = aws.replica
  name        = "${var.name}-db-dr"
  kms_key_arn = var.replica_kms_key_arn
  tags        = var.tags
}

# Immutable backups (SOC 2 availability, ransomware): once the lock is in
# compliance mode the copies cannot be shortened or erased by anyone until
# they expire. Free; the storage of the copies is what is billed.
resource "aws_backup_vault_lock_configuration" "main" {
  count               = var.vault_lock_mode == "off" ? 0 : 1
  backup_vault_name   = aws_backup_vault.main.name
  min_retention_days  = var.vault_lock_min_retention_days
  max_retention_days  = var.vault_lock_max_retention_days
  changeable_for_days = var.vault_lock_mode == "compliance" ? var.vault_lock_cooling_off_days : null
}

resource "aws_backup_vault_lock_configuration" "dr" {
  count               = var.vault_lock_mode == "off" ? 0 : 1
  provider            = aws.replica
  backup_vault_name   = aws_backup_vault.dr.name
  min_retention_days  = var.vault_lock_min_retention_days
  max_retention_days  = var.vault_lock_max_retention_days
  changeable_for_days = var.vault_lock_mode == "compliance" ? var.vault_lock_cooling_off_days : null
}

resource "aws_backup_plan" "db" {
  name = "${var.name}-db-daily"

  rule {
    rule_name         = "daily"
    target_vault_name = aws_backup_vault.main.name
    schedule          = var.schedule
    start_window      = 60
    completion_window = 360
    lifecycle {
      delete_after = var.retention_days
    }
    # Second region: survives the loss of the main region.
    copy_action {
      destination_vault_arn = aws_backup_vault.dr.arn
      lifecycle {
        delete_after = var.copy_retention_days
      }
    }
    # Separate account: survives a compromised or closed main account.
    dynamic "copy_action" {
      for_each = var.copy_account_vault_arn == "" ? [] : [var.copy_account_vault_arn]
      content {
        destination_vault_arn = copy_action.value
        lifecycle {
          delete_after = var.copy_retention_days
        }
      }
    }
  }
  tags = var.tags
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["backup.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backup" {
  name               = "${var.name}-backup"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "backup" {
  for_each = toset([
    "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup",
    "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores",
  ])
  role       = aws_iam_role.backup.name
  policy_arn = each.value
}

resource "aws_backup_selection" "db" {
  name         = "${var.name}-db"
  plan_id      = aws_backup_plan.db.id
  iam_role_arn = aws_iam_role.backup.arn
  resources    = var.resource_arns
}

# --- alarms --------------------------------------------------------------
# A failed, aborted or expired job is an e-mail within minutes.
resource "aws_cloudwatch_event_rule" "job_failed" {
  name        = "${var.name}-backup-failed"
  description = "AWS Backup: backup or copy job did not complete"
  event_pattern = jsonencode({
    source        = ["aws.backup"]
    "detail-type" = ["Backup Job State Change", "Copy Job State Change"]
    detail        = { state = ["FAILED", "ABORTED", "EXPIRED"] }
  })
  tags = var.tags
}

resource "aws_cloudwatch_event_target" "job_failed" {
  rule      = aws_cloudwatch_event_rule.job_failed.name
  target_id = "alerts"
  arn       = var.alerts_topic_arn
  input_transformer {
    input_paths = { kind = "$.detail-type", state = "$.detail.state" }
    # Plain Russian for the owner, like every other alarm.
    input_template = "\"LawBid: резервная копия базы не сделана (<kind>: <state>). Что делать: AWS Backup → Jobs → посмотреть причину; обычно следующая ночь проходит сама. Два дня подряд — docs/runbooks/backup-failed.md\""
  }
}

# Nothing completed in a day (the schedule is daily): catches a plan that
# silently stopped, not only a failed job. Missing data = no job = alarm (backup_age_missing_data).
resource "aws_cloudwatch_metric_alarm" "backup_age" {
  alarm_name          = "${var.name}-db-backup-age"
  alarm_description   = "LawBid: за последние сутки нет ни одной готовой резервной копии базы. Что делать: AWS Backup → Jobs, инструкция docs/runbooks/backup-failed.md (EN: no completed AWS Backup job for the database in 24 h.)"
  namespace           = "AWS/Backup"
  metric_name         = "NumberOfBackupJobsCompleted"
  dimensions          = { ResourceType = "RDS", BackupVaultName = aws_backup_vault.main.name }
  statistic           = "Sum"
  period              = 86400
  evaluation_periods  = 1
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = var.backup_age_missing_data
  alarm_actions       = [var.alerts_topic_arn]
  ok_actions          = [var.alerts_topic_arn]
  tags                = var.tags
}

resource "aws_backup_restore_testing_plan" "db" {
  count                        = var.restore_test_enabled ? 1 : 0
  name                         = "${replace(var.name, "-", "_")}_db_monthly"
  schedule_expression          = var.restore_test_schedule
  schedule_expression_timezone = "UTC"
  start_window_hours           = 4

  recovery_point_selection {
    algorithm             = "LATEST_WITHIN_WINDOW"
    include_vaults        = [aws_backup_vault.main.arn]
    recovery_point_types  = ["SNAPSHOT"]
    selection_window_days = 7
  }
  tags = var.tags
}

resource "aws_backup_restore_testing_selection" "db" {
  count                     = var.restore_test_enabled ? 1 : 0
  name                      = "${replace(var.name, "-", "_")}_db"
  restore_testing_plan_name = aws_backup_restore_testing_plan.db[0].name
  protected_resource_type   = "RDS"
  protected_resource_arns   = var.resource_arns
  iam_role_arn              = aws_iam_role.backup.arn
  validation_window_hours   = var.restore_test_validation_hours

  # Same network as production (private, no public address), smallest
  # class, single AZ. List values are JSON-array strings (AWS docs).
  restore_metadata_overrides = merge(
    {
      dbInstanceClass    = var.restore_test_db_class
      multiAz            = "false"
      publiclyAccessible = "false"
    },
    var.restore_test_db_subnet_group == "" ? {} : { dbSubnetGroupName = var.restore_test_db_subnet_group },
    length(var.restore_test_security_group_ids) == 0 ? {} : { vpcSecurityGroupIds = jsonencode(var.restore_test_security_group_ids) },
  )
}

# A restore test that did not complete rings the phone: a backup nobody can
# restore is not a backup (Well-Architected REL09-BP04).
resource "aws_cloudwatch_event_rule" "restore_test_failed" {
  count       = var.restore_test_enabled ? 1 : 0
  name        = "${var.name}-restore-test-failed"
  description = "AWS Backup restore test did not complete"
  event_pattern = jsonencode({
    source        = ["aws.backup"]
    "detail-type" = ["Restore Job State Change"]
    detail = {
      status                = ["FAILED", "ABORTED", "EXPIRED"]
      restoreTestingPlanArn = [{ exists = true }]
    }
  })
  tags = var.tags
}

resource "aws_cloudwatch_event_target" "restore_test_failed" {
  count     = var.restore_test_enabled ? 1 : 0
  rule      = aws_cloudwatch_event_rule.restore_test_failed[0].name
  target_id = "critical"
  arn       = var.critical_topic_arn == "" ? var.alerts_topic_arn : var.critical_topic_arn
  input_transformer {
    input_paths    = { status = "$.detail.status", job = "$.detail.restoreJobId" }
    input_template = "\"LawBid: ежемесячная проверка восстановления базы НЕ прошла (<status>, задача <job>). Копия может не подняться. Что делать: AWS Backup → Jobs → Restore jobs → причина; затем docs/runbooks/restore-drill.md и сообщите Claude «учебное восстановление упало».\""
  }
}

output "vault_name" { value = aws_backup_vault.main.name }
output "dr_vault_arn" { value = aws_backup_vault.dr.arn }
output "plan_id" { value = aws_backup_plan.db.id }
output "role_arn" { value = aws_iam_role.backup.arn }
