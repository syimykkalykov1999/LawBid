# Observability round 12 (2026-10-25). One file for the S12 additions so the
# cost of each item is easy to find. Companion to slo.tf (journey SLIs, burn
# rate) and coverage.tf (RDS/ECS/ALB recommended alarms; the ECS
# MemoryUtilization 85 % alarm already lives THERE, S12-7 does not repeat it).
#
# Every alarm costs $0.10 a month ($0.30 for an anomaly-band alarm, $0.50 for a
# composite alarm). Runbook: docs/runbooks/infra-alarms.md and slo.md.

# --- variables --------------------------------------------------------------
variable "anomaly_alarms_enabled" {
  type        = bool
  default     = false
  description = "OFF by default (review R-48; turn on from tfvars once there is traffic to learn a band from). S12-4 / S12-13: anomaly-band alarms on signups, messages, OTP and push per hour (a DROP means silent breakage) and on failed sign-ins / OTP requests (a SPIKE means credential stuffing). 6 metrics x (anomaly $0.30 + guard $0.10 + composite $0.50) = about $5.40 a month at any scale. false = none."
}
variable "anomaly_min_daily_events" {
  type = map(number)
  default = {
    signup  = 50
    msgSent = 500
    otpSent = 50
    pushOk  = 200
  }
  description = "S12-4: a drop alarm stays silent unless the last 24 h had at least this many events of that kind (a quiet launch week is not an outage)."
}
variable "auth_spike_min_per_hour" {
  type        = number
  default     = 100
  description = "S12-13: a spike of failed sign-ins or OTP requests is reported only when the hour had at least this many (the anomaly band alone is noisy at low counts)."
}
variable "eventloop_p99_alarm_ms" {
  type        = number
  default     = 300
  description = "S12-7: Node event-loop delay p99 above this (ms) for 10 minutes = the process is saturated (earliest signal before p95 climbs). 0 = off."
}
variable "heap_ratio_alarm_percent" {
  type        = number
  default     = 85
  description = "S12-7: V8 heap in use above this share of the heap limit for 10 minutes = an out-of-memory restart is coming. 0 = off."
}
variable "availability_slo_target" {
  type        = number
  default     = 0.999
  description = "S12-9: share of API requests that must not be a 5xx (ALB target group). Burn alarms use the same 14.4x / 6x multiwindow rule as slo.tf."
}
variable "availability_min_requests" {
  type        = number
  default     = 100
  description = "S12-9: fewer requests than this in a window = no availability burn alarm (a quiet night is not an outage)."
}
variable "dashboard_enabled" {
  type        = bool
  default     = true
  description = "S12-11: one CloudWatch dashboard (SLO success rates, burn, availability, runtime). The first 3 dashboards of an account are free, then $3 a month each."
}

# --- S12-4 / S12-13: anomaly bands ------------------------------------------
locals {
  # kind low  = alarm when the hourly count falls BELOW the learned band (silent breakage);
  # kind high = alarm when it rises ABOVE the band (abuse), but only with a real volume.
  anomaly = var.anomaly_alarms_enabled ? {
    signup-low        = { metric = "SloSignup", kind = "low", floor = var.anomaly_min_daily_events["signup"], label = "регистраций", runbook = "slo.md#anomaly" }
    msgSent-low       = { metric = "SloMsgSent", kind = "low", floor = var.anomaly_min_daily_events["msgSent"], label = "отправленных сообщений", runbook = "slo.md#anomaly" }
    otpSent-low       = { metric = "SloOtpSent", kind = "low", floor = var.anomaly_min_daily_events["otpSent"], label = "SMS-кодов", runbook = "slo.md#anomaly" }
    pushOk-low        = { metric = "SloPushOk", kind = "low", floor = var.anomaly_min_daily_events["pushOk"], label = "доставленных пушей", runbook = "slo.md#anomaly" }
    authFailed-high   = { metric = "SloAuthFailed", kind = "high", floor = var.auth_spike_min_per_hour, label = "неудачных входов", runbook = "slo.md#auth-spike" }
    otpRequested-high = { metric = "SloOtpRequested", kind = "high", floor = var.auth_spike_min_per_hour, label = "запросов SMS-кода", runbook = "slo.md#auth-spike" }
  } : {}
}

resource "aws_cloudwatch_metric_alarm" "anomaly" {
  for_each            = local.anomaly
  alarm_name          = "${var.name}-anomaly-${each.key}-band"
  alarm_description   = "Anomaly band of ${each.value.metric} per hour (${each.value.kind}). Does not notify by itself: ${var.name}-anomaly-${each.key} (composite) combines it with a volume guard."
  comparison_operator = each.value.kind == "low" ? "LessThanLowerThreshold" : "GreaterThanUpperThreshold"
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold_metric_id = "band"
  # A fully silent hour has no datapoint at all (no log line): for a drop that IS the signal.
  treat_missing_data = each.value.kind == "low" ? "breaching" : "notBreaching"
  tags               = var.tags

  metric_query {
    id          = "m1"
    return_data = true
    metric {
      metric_name = each.value.metric
      namespace   = local.ns
      period      = 3600
      stat        = "Sum"
    }
  }
  metric_query {
    id          = "band"
    expression  = "ANOMALY_DETECTION_BAND(m1, 2)"
    label       = "expected range"
    return_data = true
  }
}

# Guard: low = «the last 24 h had enough events to judge» (ALARM here means too few, so
# the composite is muted); high = «this hour had enough events» (ALARM here = loud enough).
resource "aws_cloudwatch_metric_alarm" "anomaly_guard" {
  for_each            = local.anomaly
  alarm_name          = "${var.name}-anomaly-${each.key}-volume"
  alarm_description   = each.value.kind == "low" ? "Guard of ${var.name}-anomaly-${each.key}: ALARM = fewer than ${each.value.floor} ${each.value.metric} events in 24 h, so a drop is not judged." : "Guard of ${var.name}-anomaly-${each.key}: ALARM = at least ${each.value.floor} ${each.value.metric} events this hour."
  comparison_operator = each.value.kind == "low" ? "LessThanThreshold" : "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = each.value.kind == "low" ? 86400 : 3600
  statistic           = "Sum"
  metric_name         = each.value.metric
  namespace           = local.ns
  threshold           = each.value.floor
  treat_missing_data  = each.value.kind == "low" ? "breaching" : "notBreaching"
  tags                = var.tags
}

resource "aws_cloudwatch_composite_alarm" "anomaly" {
  for_each          = local.anomaly
  alarm_name        = "${var.name}-anomaly-${each.key}"
  alarm_description = each.value.kind == "low" ? "LawBid: Резко упало число ${each.value.label} в час — возможно, после обновления что-то молча сломалось (экран, SMS, push). Что делать: открыть приложение и пройти этот сценарий самому; если ломается — GitHub → Actions → «Rollback production». Инструкция: ${var.runbook_base_url}/${each.value.runbook} (EN: ${each.value.metric} per hour fell below its learned band.)" : "LawBid: Всплеск ${each.value.label} в час — похоже на подбор паролей или накрутку SMS. Что делать: админка → Безопасность → журнал входов; при атаке включить «Проверка не бот» (security.turnstile.mode) и снизить лимиты SMS. Инструкция: ${var.runbook_base_url}/${each.value.runbook} (EN: ${each.value.metric} per hour rose above its learned band.)"
  alarm_rule        = each.value.kind == "low" ? "ALARM(\"${aws_cloudwatch_metric_alarm.anomaly[each.key].alarm_name}\") AND NOT ALARM(\"${aws_cloudwatch_metric_alarm.anomaly_guard[each.key].alarm_name}\")" : "ALARM(\"${aws_cloudwatch_metric_alarm.anomaly[each.key].alarm_name}\") AND ALARM(\"${aws_cloudwatch_metric_alarm.anomaly_guard[each.key].alarm_name}\")"
  alarm_actions     = local.ops
  ok_actions        = local.ops
  tags              = var.tags
}

# --- S12-7: event loop and heap (RuntimeStatsService, namespace LawBid/Runtime) ----------
resource "aws_cloudwatch_metric_alarm" "eventloop_lag" {
  for_each            = var.eventloop_p99_alarm_ms > 0 ? toset(["api", "worker"]) : toset([])
  alarm_name          = "${var.name}-${each.key}-eventloop-lag"
  alarm_description   = "LawBid: Сервер ${each.key} не успевает обрабатывать запросы (задержка цикла событий больше ${var.eventloop_p99_alarm_ms} мс уже 10 минут). Что делать: обычно сервер добавляется сам; если держится — админка → Здоровье системы, ищите тяжёлые задачи; при повторе напишите Claude «event loop ${each.key}». Инструкция: ${var.runbook_base_url}/api-latency.md#event-loop (EN: Node event-loop delay p99 above ${var.eventloop_p99_alarm_ms} ms for 10 minutes.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 300
  threshold           = var.eventloop_p99_alarm_ms
  statistic           = "Average"
  metric_name         = "EventLoopP99Ms"
  namespace           = "LawBid/Runtime"
  dimensions          = { Service = each.key }
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "heap_ratio" {
  for_each            = var.heap_ratio_alarm_percent > 0 ? toset(["api", "worker"]) : toset([])
  alarm_name          = "${var.name}-${each.key}-heap-ratio"
  alarm_description   = "LawBid: Память сервера ${each.key} (куча Node) заполнена больше чем на ${var.heap_ratio_alarm_percent} % уже 10 минут — дальше он падает с «out of memory» и перезапускается. Что делать: ничего срочного; при повторе напишите Claude «куча ${each.key}» (поднимем память или найдём утечку). Инструкция: ${var.runbook_base_url}/ecs-capacity.md#heap (EN: V8 heap used / limit above ${var.heap_ratio_alarm_percent}% for 10 minutes; ECS MemoryUtilization is in coverage.tf.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = var.heap_ratio_alarm_percent
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags

  metric_query {
    id = "used"
    metric {
      metric_name = "HeapUsedMb"
      namespace   = "LawBid/Runtime"
      period      = 300
      stat        = "Maximum"
      dimensions  = { Service = each.key }
    }
  }
  metric_query {
    id = "limit"
    metric {
      metric_name = "HeapLimitMb"
      namespace   = "LawBid/Runtime"
      period      = 300
      stat        = "Maximum"
      dimensions  = { Service = each.key }
    }
  }
  metric_query {
    id          = "ratio"
    expression  = "IF(limit > 0, 100 * used / limit, 0)"
    label       = "heap % of limit"
    return_data = true
  }
}

# --- S12-9: availability burn rate (multiwindow, like slo.tf) ------------------------
# good = every request that is not a target 5xx (2xx, 3xx and 4xx all count as served).
locals {
  avail_windows = {
    fast_long  = { period = 3600, factor = 14.4, pair = "fast", min = var.availability_min_requests }
    fast_short = { period = 300, factor = 14.4, pair = "fast", min = max(10, floor(var.availability_min_requests / 12)) }
    slow_long  = { period = 21600, factor = 6, pair = "slow", min = var.availability_min_requests * 6 }
    slow_short = { period = 1800, factor = 6, pair = "slow", min = var.availability_min_requests }
  }
}

resource "aws_cloudwatch_metric_alarm" "availability_burn" {
  for_each            = local.avail_windows
  alarm_name          = "${var.name}-availability-${each.key}"
  alarm_description   = "Burn-rate window ${each.key} of the API availability SLO (part of ${var.name}-availability-${each.value.pair})."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = each.value.factor * (1 - var.availability_slo_target)
  treat_missing_data  = "notBreaching"
  tags                = var.tags

  metric_query {
    id = "req"
    metric {
      metric_name = "RequestCount"
      namespace   = "AWS/ApplicationELB"
      period      = each.value.period
      stat        = "Sum"
      dimensions  = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.api_target_group_arn_suffix }
    }
  }
  metric_query {
    id = "err"
    metric {
      metric_name = "HTTPCode_Target_5XX_Count"
      namespace   = "AWS/ApplicationELB"
      period      = each.value.period
      stat        = "Sum"
      dimensions  = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.api_target_group_arn_suffix }
    }
  }
  metric_query {
    id          = "rate"
    expression  = "IF(FILL(req, 0) >= ${each.value.min}, FILL(err, 0) / FILL(req, 0), 0)"
    label       = "5xx share"
    return_data = true
  }
}

resource "aws_cloudwatch_composite_alarm" "availability" {
  for_each          = toset(["fast", "slow"])
  alarm_name        = "${var.name}-availability-${each.key}"
  alarm_description = each.key == "fast" ? "LawBid: Приложение массово отдаёт ошибки 5xx (бюджет ошибок за месяц сгорает в 14 раз быстрее нормы). Что делать: обычно это неудачное обновление — оно откатывается само; не прошло за 15 минут — GitHub → Actions → «Rollback production». Инструкция: ${var.runbook_base_url}/api-5xx.md (EN: API availability fast burn: 1 h and 5 min windows both above 14.4x.)" : "LawBid: Приложение долго отдаёт небольшой процент ошибок 5xx (бюджет сгорает в 6 раз быстрее нормы, шесть часов подряд). Что делать: посмотреть в админке → Здоровье системы, какой маршрут ломается (дашборд ${var.name}-slo), не откладывать до завтра. Инструкция: ${var.runbook_base_url}/api-5xx.md (EN: API availability slow burn: 6 h and 30 min windows both above 6x.)"
  alarm_rule        = "ALARM(\"${aws_cloudwatch_metric_alarm.availability_burn["${each.key}_long"].alarm_name}\") AND ALARM(\"${aws_cloudwatch_metric_alarm.availability_burn["${each.key}_short"].alarm_name}\")"
  alarm_actions     = each.key == "fast" ? local.page : local.ops
  ok_actions        = each.key == "fast" ? local.page : local.ops
  tags              = var.tags
}

# --- S12-11: dashboard (replaces the orphaned infra/observability/grafana JSON) --------
locals {
  dash_slos = { for k, v in local.slos : k => v }
  dash_slo_metrics = flatten([
    for i, k in sort(keys(local.dash_slos)) : concat(
      [
        [local.ns, local.dash_slos[k].good, { id = "g${i}", stat = "Sum", period = 3600, visible = false }],
        [local.ns, coalesce(local.dash_slos[k].total, local.dash_slos[k].bad), { id = "o${i}", stat = "Sum", period = 3600, visible = false }],
      ],
      [[{ expression = local.dash_slos[k].total != null ? "IF(o${i} > 0, 100 * FILL(g${i}, 0) / o${i}, 100)" : "IF(FILL(g${i}, 0) + FILL(o${i}, 0) > 0, 100 * FILL(g${i}, 0) / (FILL(g${i}, 0) + FILL(o${i}, 0)), 100)", label = "${k} (цель ${format("%g", local.dash_slos[k].target * 100)}%)", id = "s${i}" }]],
    )
  ])
  dash_widget_defaults = { type = "metric", width = 12, height = 6 }
}

resource "aws_cloudwatch_dashboard" "slo" {
  count          = var.dashboard_enabled ? 1 : 0
  dashboard_name = "${var.name}-slo"
  dashboard_body = jsonencode({
    widgets = [
      {
        type       = "text", x = 0, y = 0, width = 24, height = 2
        properties = { markdown = "# LawBid — SLO, burn rate, runtime\nЗелёное = хорошо. Алярмы: composite `${var.name}-slo-*-fast|slow` и `${var.name}-availability-fast|slow`. Инструкция: ${var.runbook_base_url}/slo.md. Старые JSON-дашборды Grafana в infra/observability/grafana не подключены ни к чему." }
      },
      {
        type       = "metric", x = 0, y = 2, width = 12, height = 7
        properties = { title = "Успешность сценариев, % (за час)", region = data.aws_region.current.name, view = "timeSeries", yAxis = { left = { min = 0, max = 100 } }, metrics = local.dash_slo_metrics, period = 3600, stat = "Sum" }
      },
      {
        type = "metric", x = 12, y = 2, width = 12, height = 7
        properties = {
          title = "Доступность API: доля 5xx, % (по 5 минут)", region = data.aws_region.current.name, view = "timeSeries", period = 300, stat = "Sum"
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.alb_arn_suffix, "TargetGroup", var.api_target_group_arn_suffix, { id = "req", visible = false }],
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", var.alb_arn_suffix, "TargetGroup", var.api_target_group_arn_suffix, { id = "err", visible = false }],
            [{ expression = "IF(req > 0, 100 * err / req, 0)", label = "5xx %", id = "pct" }],
          ]
          annotations = { horizontal = [{ label = "быстрое сгорание", value = 100 * 14.4 * (1 - var.availability_slo_target) }] }
        }
      },
      {
        type = "metric", x = 0, y = 9, width = 12, height = 6
        properties = {
          title       = "Скорость ответа API (p95, секунды)", region = data.aws_region.current.name, view = "timeSeries", period = 300
          metrics     = [["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", var.alb_arn_suffix, "TargetGroup", var.api_target_group_arn_suffix, { stat = "p95" }]]
          annotations = { horizontal = [{ label = "цель", value = var.p95_target_ms / 1000 }] }
        }
      },
      {
        type = "metric", x = 12, y = 9, width = 12, height = 6
        properties = {
          title = "Задержка цикла событий Node (p99, мс)", region = data.aws_region.current.name, view = "timeSeries", period = 60, stat = "Average"
          metrics = [
            ["LawBid/Runtime", "EventLoopP99Ms", "Service", "api", { label = "api" }],
            ["LawBid/Runtime", "EventLoopP99Ms", "Service", "worker", { label = "worker" }],
          ]
          annotations = { horizontal = [{ label = "порог", value = var.eventloop_p99_alarm_ms }] }
        }
      },
      {
        type = "metric", x = 0, y = 15, width = 12, height = 6
        properties = {
          title = "Куча Node, % лимита", region = data.aws_region.current.name, view = "timeSeries", period = 60, stat = "Maximum"
          metrics = [
            ["LawBid/Runtime", "HeapUsedMb", "Service", "api", { id = "au", visible = false }],
            ["LawBid/Runtime", "HeapLimitMb", "Service", "api", { id = "al", visible = false }],
            ["LawBid/Runtime", "HeapUsedMb", "Service", "worker", { id = "wu", visible = false }],
            ["LawBid/Runtime", "HeapLimitMb", "Service", "worker", { id = "wl", visible = false }],
            [{ expression = "IF(al > 0, 100 * au / al, 0)", label = "api", id = "ar" }],
            [{ expression = "IF(wl > 0, 100 * wu / wl, 0)", label = "worker", id = "wr" }],
          ]
        }
      },
      {
        type = "alarm", x = 12, y = 15, width = 12, height = 6
        properties = {
          title  = "Главные алярмы"
          alarms = concat([for k, a in aws_cloudwatch_composite_alarm.slo : a.arn], [for k, a in aws_cloudwatch_composite_alarm.availability : a.arn])
        }
      },
    ]
  })
}

output "slo_dashboard_name" { value = one(aws_cloudwatch_dashboard.slo[*].dashboard_name) }
