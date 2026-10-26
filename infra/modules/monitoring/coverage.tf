# Round 4 audit S4-4 (2026-10-25): alarms on the resources that fail silently.
# AWS "recommended alarms" for RDS, ECS, ALB, ACM, NAT and Service Quotas.
# Each alarm costs $0.10/month. Runbook: docs/runbooks/infra-alarms.md.

variable "acm_certificate_arns" {
  type        = list(string)
  default     = []
  description = "ACM certificates (same Region as this stack) whose expiry is watched. Empty = no expiry alarm."
}
variable "db_free_storage_alarm_gb" {
  type        = number
  default     = 10
  description = "RDS FreeStorageSpace alarm (GB). The autoscale Lambda only reads it; this alarm still warns when the Lambda is paused."
}
variable "db_free_memory_alarm_mb" {
  type        = number
  default     = 256
  description = "RDS FreeableMemory alarm (MB)."
}
variable "fargate_quota_alarm_percent" {
  type        = number
  default     = 80
  description = "Alarm when Fargate vCPU in use (On-Demand and Spot, AWS/Usage) passes this percent of the Service Quota. 0 = off."
}

locals {
  db_alarm_on = var.db_instance_id != ""
  rds_alarms = local.db_alarm_on ? {
    free-storage = {
      metric    = "FreeStorageSpace", stat = "Minimum", op = "LessThanThreshold"
      threshold = var.db_free_storage_alarm_gb * 1073741824, periods = 2, period = 300
      text      = "LawBid: В базе данных заканчивается место (осталось меньше ${var.db_free_storage_alarm_gb} ГБ). Что делать: админка → Здоровье системы → увеличить диск базы; если автоувеличение выключено — включите его. Инструкция: ${var.runbook_base_url}/infra-alarms.md (EN: RDS FreeStorageSpace below ${var.db_free_storage_alarm_gb} GB.)"
    }
    free-memory = {
      metric    = "FreeableMemory", stat = "Minimum", op = "LessThanThreshold"
      threshold = var.db_free_memory_alarm_mb * 1048576, periods = 3, period = 300
      text      = "LawBid: У базы данных почти не осталось оперативной памяти (меньше ${var.db_free_memory_alarm_mb} МБ). Что делать: админка → Здоровье системы → увеличить базу на один размер. Инструкция: ${var.runbook_base_url}/infra-alarms.md (EN: RDS FreeableMemory low.)"
    }
    cpu = {
      metric    = "CPUUtilization", stat = "Average", op = "GreaterThanThreshold"
      threshold = 85, periods = 3, period = 300
      text      = "LawBid: База данных загружена больше чем на 85 % уже 15 минут. Что делать: обычно база сама растёт на размер выше (автомасштаб); если письма идут каждый день — поднимите потолок размера базы. Инструкция: ${var.runbook_base_url}/db-contention.md (EN: RDS CPU above 85% for 15 minutes.)"
    }
    disk-queue = {
      metric    = "DiskQueueDepth", stat = "Average", op = "GreaterThanThreshold"
      threshold = 20, periods = 3, period = 300
      text      = "LawBid: Диск базы данных не успевает за запросами (очередь больше 20). Что делать: подождите 15 минут; если держится — увеличьте диск или базу (админка → Здоровье системы). Инструкция: ${var.runbook_base_url}/infra-alarms.md (EN: RDS DiskQueueDepth above 20.)"
    }
    read-latency = {
      metric    = "ReadLatency", stat = "Average", op = "GreaterThanThreshold"
      threshold = 0.05, periods = 3, period = 300
      text      = "LawBid: Чтение из базы стало медленным (больше 50 мс в среднем). Что делать: посмотрите нагрузку на базу в админке → Здоровье системы; при повторе увеличьте диск. Инструкция: ${var.runbook_base_url}/infra-alarms.md (EN: RDS ReadLatency above 50 ms.)"
    }
    write-latency = {
      metric    = "WriteLatency", stat = "Average", op = "GreaterThanThreshold"
      threshold = 0.05, periods = 3, period = 300
      text      = "LawBid: Запись в базу стала медленной (больше 50 мс в среднем). Что делать: посмотрите нагрузку на базу в админке → Здоровье системы; при повторе увеличьте диск. Инструкция: ${var.runbook_base_url}/infra-alarms.md (EN: RDS WriteLatency above 50 ms.)"
    }
  } : {}
}

resource "aws_cloudwatch_metric_alarm" "rds" {
  for_each            = local.rds_alarms
  alarm_name          = "${var.name}-db-${each.key}"
  alarm_description   = each.value.text
  comparison_operator = each.value.op
  evaluation_periods  = each.value.periods
  period              = each.value.period
  threshold           = each.value.threshold
  statistic           = each.value.stat
  metric_name         = each.value.metric
  namespace           = "AWS/RDS"
  dimensions          = { DBInstanceIdentifier = var.db_instance_id }
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

# ECS memory: the worker (ClamAV, 4 GB) is killed by the kernel, not slowed.
resource "aws_cloudwatch_metric_alarm" "service_memory" {
  for_each = {
    api    = var.api_service_name
    worker = var.worker_service_name
  }
  alarm_name          = "${var.name}-${each.key}-memory"
  alarm_description   = "LawBid: Сервер ${each.key} использует больше 85 % памяти уже 10 минут — дальше его убивает система (OOM) и он перезапускается. Что делать: ничего срочного; если письма повторяются — напишите Claude «памяти не хватает ${each.key}» (поднимем размер сервера). Инструкция: ${var.runbook_base_url}/ecs-capacity.md (EN: ${each.key} MemoryUtilization > 85% for 10 minutes.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 300
  threshold           = 85
  statistic           = "Average"
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  dimensions          = { ClusterName = var.cluster_name, ServiceName = each.value }
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

# 503 with no healthy target is generated by the load balancer itself, so the
# Target_5XX alarm never sees it.
resource "aws_cloudwatch_metric_alarm" "alb_elb_5xx" {
  alarm_name          = "${var.name}-alb-elb-5xx"
  alarm_description   = "LawBid: Входной балансировщик сам отдаёт ошибки 5xx (нет живых серверов или он перегружен). Что делать: откройте админку → Здоровье системы; если серверы падают — ${var.runbook_base_url}/api-unhealthy.md (EN: ALB HTTPCode_ELB_5XX_Count >= 10 in 5 minutes.)"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  period              = 300
  threshold           = 10
  statistic           = "Sum"
  metric_name         = "HTTPCode_ELB_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  dimensions          = { LoadBalancer = var.alb_arn_suffix }
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

# Certificate on DNS at Namecheap renews only while the validation CNAME stays.
resource "aws_cloudwatch_metric_alarm" "acm_expiry" {
  for_each            = toset(var.acm_certificate_arns)
  alarm_name          = "${var.name}-acm-expiry-${substr(sha1(each.value), 0, 8)}"
  alarm_description   = "LawBid: Сертификат HTTPS (${each.value}) истекает меньше чем через 21 день — он не продлился сам. Что делать: проверьте, что у регистратора домена на месте запись проверки (CNAME _xxx.acm-validations.aws). Без неё сайт перестанет открываться. Инструкция: ${var.runbook_base_url}/infra-alarms.md (EN: ACM DaysToExpiry < 21.)"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  period              = 86400
  threshold           = 21
  statistic           = "Minimum"
  metric_name         = "DaysToExpiry"
  namespace           = "AWS/CertificateManager"
  dimensions          = { CertificateArn = each.value }
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags
}

# NAT port exhaustion: new outbound connections (Stripe, FCM, SES) fail.
resource "aws_cloudwatch_metric_alarm" "nat_port_allocation" {
  for_each            = { for i, id in var.nat_gateway_ids : tostring(i) => id }
  alarm_name          = "${var.name}-nat-port-alloc-${each.key}"
  alarm_description   = "LawBid: Выход в интернет (NAT ${each.value}) исчерпал порты — новые исходящие запросы (платежи, push, почта) падают. Что делать: напишите Claude «NAT порты» (добавим NAT в каждую зону / эндпоинты). Инструкция: ${var.runbook_base_url}/nat-endpoints.md (EN: NAT ErrorPortAllocation > 0 for 10 minutes.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 300
  threshold           = 0
  statistic           = "Sum"
  metric_name         = "ErrorPortAllocation"
  namespace           = "AWS/NATGateway"
  dimensions          = { NatGatewayId = each.value }
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags
}

# Fargate vCPU quota (S4-12): autoscale silently capped = launch-day brownout.
# SERVICE_QUOTA() turns the usage count into a percent of the live quota.
resource "aws_cloudwatch_metric_alarm" "fargate_vcpu_quota" {
  for_each = var.fargate_quota_alarm_percent > 0 ? {
    on-demand = "Standard/OnDemand"
    spot      = "Standard/Spot"
  } : {}
  alarm_name          = "${var.name}-fargate-vcpu-${each.key}"
  alarm_description   = "LawBid: Использовано больше ${var.fargate_quota_alarm_percent} % лимита AWS на процессоры серверов (${each.key}). Дальше новые серверы не запустятся, рост нагрузки упрётся в потолок. Что делать: AWS Console → Service Quotas → AWS Fargate → попросите увеличить лимит (бесплатно, 1–3 дня). Инструкция: ${var.runbook_base_url}/ecs-capacity.md (EN: Fargate ${each.key} vCPU above ${var.fargate_quota_alarm_percent}% of quota.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = var.fargate_quota_alarm_percent
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags

  metric_query {
    id = "usage"
    metric {
      metric_name = "ResourceCount"
      namespace   = "AWS/Usage"
      period      = 300
      stat        = "Maximum"
      dimensions = {
        Type     = "Resource"
        Resource = "vCPU"
        Service  = "Fargate"
        Class    = each.value
      }
    }
  }
  metric_query {
    id          = "pct"
    expression  = "100 * usage / SERVICE_QUOTA(usage)"
    label       = "Fargate vCPU, % of quota"
    return_data = true
  }
}
