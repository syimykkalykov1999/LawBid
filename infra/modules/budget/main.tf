# Zero maintenance (owner 2026-10-05): no surprise AWS bills.
# - A monthly cost budget that e-mails the owner at 50 %, 80 % and 100 % of
#   the real spend and when the month's forecast passes 100 %.
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
variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_budgets_budget" "monthly" {
  name         = "${var.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = [50, 80, 100]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = var.alert_emails
    }
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.alert_emails
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
  count            = var.create_anomaly_monitor ? 1 : 0
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

output "budget_name" { value = aws_budgets_budget.monthly.name }
output "budget_arn" { value = aws_budgets_budget.monthly.arn }
