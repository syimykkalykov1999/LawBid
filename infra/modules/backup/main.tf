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
variable "alerts_topic_arn" { type = string }
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
# silently stopped, not only a failed job. Missing data = no job = alarm.
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
  treat_missing_data  = "breaching"
  alarm_actions       = [var.alerts_topic_arn]
  ok_actions          = [var.alerts_topic_arn]
  tags                = var.tags
}

output "vault_name" { value = aws_backup_vault.main.name }
output "dr_vault_arn" { value = aws_backup_vault.dr.arn }
output "plan_id" { value = aws_backup_plan.db.id }
output "role_arn" { value = aws_iam_role.backup.arn }
