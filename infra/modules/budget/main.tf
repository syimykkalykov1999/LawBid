# Zero maintenance (owner 2026-10-05): no surprise AWS bills.
# - A monthly cost budget that notifies the owner at 50 % and 80 % of the real
#   spend and when the month's forecast passes 100 % (the 100 % of the real
#   spend is the `cost_ceiling` alarm in modules/monitoring).
# - The worker reads this budget every hour (src/jobs/handlers/
#   ops-guard.job.ts): at 100 % it caps api/worker autoscaling at the
#   minimum until the next month (switch in admin Система → Здоровье
#   системы). AWS Budgets actions cannot touch ECS, so the app does it.
# - Cost Anomaly Detection: AWS's own model e-mails a daily summary when a
#   service suddenly costs more than usual (free).
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "name" { type = string }
variable "monthly_budget_usd" {
  type        = number
  description = "Monthly AWS spend the owner is fine with (USD)."
}
variable "alert_emails" { type = list(string) }
variable "anomaly_threshold_usd" {
  type        = number
  default     = 20
  description = "E-mail when an unusual cost spike is at least this many USD."
}
variable "create_anomaly_monitor" {
  type        = bool
  default     = true
  description = "AWS allows one service-level anomaly monitor per account; false when one already exists."
}
variable "forecast_thresholds" {
  type        = list(number)
  default     = [80, 100]
  description = "FORECASTED notifications (percent of the limit): an e-mail when the month is on course to pass it, before the money is spent."
}
variable "subscriber_sns_topic_arns" {
  type        = list(string)
  default     = []
  description = "SNS topics that also get the budget notifications (e.g. the alerts topic). The topic policy must allow budgets.amazonaws.com to publish."
}
variable "anomaly_extra_emails" {
  type        = list(string)
  default     = []
  description = "E-mails for a second Cost Anomaly subscription on the account's EXISTING service monitor (anomaly_existing_monitor_arn), threshold anomaly_threshold_usd."
}
variable "anomaly_existing_monitor_arn" {
  type        = string
  default     = ""
  description = "ARN of the account's existing service-level anomaly monitor (AWS creates `Default-Services-Monitor`: aws ce get-anomaly-monitors). Used when create_anomaly_monitor is false."
}
variable "anomaly_sns_topic_arn" {
  type        = string
  default     = ""
  description = "SNS topic (the alerts topic) that also gets each cost anomaly at once (IMMEDIATE subscription, free). Its policy and key must allow costalerts.amazonaws.com (modules/monitoring, modules/kms). Empty = e-mail only."
}
variable "tags" {
  type    = map(string)
  default = {}
}

locals {
  anomaly_monitor_arn = var.create_anomaly_monitor ? one(aws_ce_anomaly_monitor.services[*].arn) : var.anomaly_existing_monitor_arn

  # Dedup D-22: the SNS topic (alerts) e-mails the same addresses (and
  # reaches Slack), so a budget notification goes to the e-mails directly only
  # when no SNS topic is given; otherwise the owner got every mail twice.
  budget_emails = length(var.subscriber_sns_topic_arns) > 0 ? [] : var.alert_emails

  # Dedup D-23: with the IMMEDIATE SNS subscription on, the DAILY e-mail
  # digests of the same anomalies are not created.
  anomaly_via_sns = var.anomaly_sns_topic_arn != ""
}

resource "aws_budgets_budget" "monthly" {
  name         = "${var.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Owner 2026-10-24: the owner changes the limit in the admin («Масштаб»,
  # four-eyes-free but 2FA-protected). Terraform only sets it at creation;
  # monthly_budget_usd is the starting value, not a pin.
  lifecycle {
    ignore_changes = [limit_amount]
  }

  # Dedup D-24: 100 % of the real spend is announced by the `cost_ceiling`
  # alarm (modules/monitoring: «Бюджет AWS на месяц исчерпан», it also says the
  # autoscaling is capped), so Budgets itself only warns at 50 % and 80 %.
  dynamic "notification" {
    for_each = [50, 80]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = local.budget_emails
      subscriber_sns_topic_arns  = var.subscriber_sns_topic_arns
    }
  }

  # Forecast alerts (80 % and 100 %): the month is on course to pass the
  # ceiling. The cost-guard job (ops-guard.job.ts) reads THIS budget by name
  # (OPS_BUDGET_NAME = <name>-monthly) and scales ECS down at 100 % actual.
  dynamic "notification" {
    for_each = var.forecast_thresholds
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "FORECASTED"
      subscriber_email_addresses = local.budget_emails
      subscriber_sns_topic_arns  = var.subscriber_sns_topic_arns
    }
  }
}

resource "aws_ce_anomaly_monitor" "services" {
  count             = var.create_anomaly_monitor ? 1 : 0
  name              = "${var.name}-services"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"
  tags              = var.tags
}

resource "aws_ce_anomaly_subscription" "daily" {
  count            = var.create_anomaly_monitor && !local.anomaly_via_sns ? 1 : 0
  name             = "${var.name}-cost-anomalies"
  frequency        = "DAILY"
  monitor_arn_list = [aws_ce_anomaly_monitor.services[0].arn]

  dynamic "subscriber" {
    for_each = var.alert_emails
    content {
      type    = "EMAIL"
      address = subscriber.value
    }
  }

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = [tostring(var.anomaly_threshold_usd)]
    }
  }
  tags = var.tags
}

# The AWS default subscription (`Default-Services-Subscription`, DAILY) sits
# on the default monitor. A second subscription on the same monitor gives the
# owner's own threshold (anomaly_threshold_usd) without importing anything.
resource "aws_ce_anomaly_subscription" "extra" {
  count            = !var.create_anomaly_monitor && var.anomaly_existing_monitor_arn != "" && length(var.anomaly_extra_emails) > 0 && !local.anomaly_via_sns ? 1 : 0
  name             = "${var.name}-cost-anomalies-extra"
  frequency        = "DAILY"
  monitor_arn_list = [var.anomaly_existing_monitor_arn]

  dynamic "subscriber" {
    for_each = var.anomaly_extra_emails
    content {
      type    = "EMAIL"
      address = subscriber.value
    }
  }

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = [tostring(var.anomaly_threshold_usd)]
    }
  }
  tags = var.tags
}

# Cost Anomaly Detection -> SNS. AWS allows the SNS subscriber only with the
# IMMEDIATE frequency (one message per anomaly), so this is a separate
# subscription from the daily e-mail digest above.
resource "aws_ce_anomaly_subscription" "sns" {
  count            = var.anomaly_sns_topic_arn != "" && (var.create_anomaly_monitor || var.anomaly_existing_monitor_arn != "") ? 1 : 0
  name             = "${var.name}-cost-anomalies-sns"
  frequency        = "IMMEDIATE"
  monitor_arn_list = [local.anomaly_monitor_arn]

  subscriber {
    type    = "SNS"
    address = var.anomaly_sns_topic_arn
  }

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = [tostring(var.anomaly_threshold_usd)]
    }
  }
  tags = var.tags
}

output "budget_name" { value = aws_budgets_budget.monthly.name }
output "budget_arn" { value = aws_budgets_budget.monthly.arn }
