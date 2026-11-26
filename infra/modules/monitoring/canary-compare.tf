# Б2 (25.11, docs/dev/STAGE2_SRE_CLOUD_2026-11-25.md, дыра №3): canary vs
# control for the ECS built-in canary / linear deployment (X1).
#
# Google SRE Workbook ch. 16 "Canarying Releases": compare the canary
# population with a control population that serves the old release at the
# same time, instead of one fleet-wide threshold. With api_two_target_groups
# the api alarms add blue + green (main.tf), so one bad canary task among N
# old ones disappears in the sum. These two alarms put the two groups side by
# side (CloudWatch metric math):
#
#   5xx:  both groups >= min requests  AND  share(one) > factor x share(other) + floor
#   p95:  both groups >= min requests  AND  p95(one) > ratio x p95(other) + floor
#
# ECS moves the live traffic to the OTHER group on every deployment, so the
# canary can be either group: the larger of the two directions is compared.
# Outside a deployment only one group has traffic, the guard is 0 and the
# alarm stays OK. Both alarms are in api_deployment_alarm_names (slo.tf), so
# ECS shifts the traffic back by itself when one fires during the bake.
# Cost: about $0.80 a month (a metric math alarm bills $0.10 per metric it reads, 4 each).

variable "api_canary_compare_min_requests" {
  type        = number
  default     = 50
  description = "Б2: fewer requests than this in 5 minutes in either api target group = no comparison (a quiet group is not a verdict)."
}
variable "api_canary_compare_5xx_factor" {
  type        = number
  default     = 2
  description = "Б2: the canary's 5xx share may be up to this many times the control's (plus the floor) before the deployment is rolled back."
}
variable "api_canary_compare_5xx_floor" {
  type        = number
  default     = 0.005
  description = "Б2: extra 5xx share (0.005 = 0.5 percentage points) the canary may have over factor x control."
}
variable "api_canary_compare_p95_ratio" {
  type        = number
  default     = 1.5
  description = "Б2: the canary's p95 may be up to this many times the control's (plus the floor)."
}
variable "api_canary_compare_p95_floor_ms" {
  type        = number
  default     = 200
  description = "Б2: extra p95 (ms) the canary may have over ratio x control."
}

locals {
  cc_on  = local.api_green_on
  cc_min = var.api_canary_compare_min_requests
  # 1 while BOTH groups carry traffic (a deployment), else 0.
  cc_both = "IF(FILL(rb, 0) >= ${local.cc_min} AND FILL(rg, 0) >= ${local.cc_min}, 1, 0)"
}

resource "aws_cloudwatch_metric_alarm" "api_canary_vs_control" {
  count               = local.cc_on ? 1 : 0
  alarm_name          = "${var.name}-api-canary-vs-control"
  alarm_description   = "LawBid: Новая версия API (canary) отдаёт ошибок 5xx заметно больше, чем старая на тех же минутах (больше ${var.api_canary_compare_5xx_factor}× плюс ${var.api_canary_compare_5xx_floor * 100} п.п.). ECS сам возвращает трафик на старую версию. Что делать: ничего срочного — выкат остановлен; найти причину в логах API новой версии (поле release) и выпустить исправление. Инструкция: ${var.runbook_base_url}/slo.md#canary (EN: canary 5xx share above ${var.api_canary_compare_5xx_factor}x the control group + floor; SRE Workbook ch. 16.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = var.api_canary_compare_5xx_floor
  treat_missing_data  = "notBreaching"
  dynamic "metric_query" {
    for_each = {
      eb = { m = "HTTPCode_Target_5XX_Count", tg = local.api_tg.b }
      eg = { m = "HTTPCode_Target_5XX_Count", tg = local.api_tg.g }
      rb = { m = "RequestCount", tg = local.api_tg.b }
      rg = { m = "RequestCount", tg = local.api_tg.g }
    }
    content {
      id = metric_query.key
      metric {
        metric_name = metric_query.value.m
        namespace   = "AWS/ApplicationELB"
        period      = 300
        stat        = "Sum"
        dimensions  = { LoadBalancer = var.alb_arn_suffix, TargetGroup = metric_query.value.tg }
      }
    }
  }
  metric_query {
    id         = "sb"
    expression = "IF(FILL(rb, 0) > 0, FILL(eb, 0) / FILL(rb, 0), 0)"
    label      = "5xx share blue"
  }
  metric_query {
    id         = "sg"
    expression = "IF(FILL(rg, 0) > 0, FILL(eg, 0) / FILL(rg, 0), 0)"
    label      = "5xx share green"
  }
  metric_query {
    id         = "both"
    expression = local.cc_both
    label      = "both groups carry traffic"
  }
  metric_query {
    id          = "diff"
    expression  = "both * MAX([sg - ${var.api_canary_compare_5xx_factor} * sb, sb - ${var.api_canary_compare_5xx_factor} * sg])"
    label       = "canary 5xx share over ${var.api_canary_compare_5xx_factor}x control"
    return_data = true
  }
  alarm_actions = local.ops
  ok_actions    = local.ops
  tags          = var.tags
}

resource "aws_cloudwatch_metric_alarm" "api_canary_vs_control_p95" {
  count               = local.cc_on ? 1 : 0
  alarm_name          = "${var.name}-api-canary-vs-control-p95"
  alarm_description   = "LawBid: Новая версия API (canary) отвечает заметно медленнее старой на тех же минутах (p95 больше ${var.api_canary_compare_p95_ratio}× плюс ${var.api_canary_compare_p95_floor_ms} мс). ECS сам возвращает трафик на старую версию. Что делать: ничего срочного — выкат остановлен; смотреть медленные запросы новой версии (админка → Система → Здоровье системы). Инструкция: ${var.runbook_base_url}/slo.md#canary (EN: canary p95 above ${var.api_canary_compare_p95_ratio}x the control group + floor; SRE Workbook ch. 16.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = var.api_canary_compare_p95_floor_ms / 1000
  treat_missing_data  = "notBreaching"
  dynamic "metric_query" {
    for_each = {
      pb = { m = "TargetResponseTime", tg = local.api_tg.b, stat = "p95" }
      pg = { m = "TargetResponseTime", tg = local.api_tg.g, stat = "p95" }
      rb = { m = "RequestCount", tg = local.api_tg.b, stat = "Sum" }
      rg = { m = "RequestCount", tg = local.api_tg.g, stat = "Sum" }
    }
    content {
      id = metric_query.key
      metric {
        metric_name = metric_query.value.m
        namespace   = "AWS/ApplicationELB"
        period      = 300
        stat        = metric_query.value.stat
        dimensions  = { LoadBalancer = var.alb_arn_suffix, TargetGroup = metric_query.value.tg }
      }
    }
  }
  metric_query {
    id         = "both"
    expression = local.cc_both
    label      = "both groups carry traffic"
  }
  metric_query {
    id          = "diff"
    expression  = "both * MAX([FILL(pg, 0) - ${var.api_canary_compare_p95_ratio} * FILL(pb, 0), FILL(pb, 0) - ${var.api_canary_compare_p95_ratio} * FILL(pg, 0)])"
    label       = "canary p95 over ${var.api_canary_compare_p95_ratio}x control (s)"
    return_data = true
  }
  alarm_actions = local.ops
  ok_actions    = local.ops
  tags          = var.tags
}
