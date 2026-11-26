# Б6 (25.11, docs/dev/STAGE2_SRE_CLOUD_2026-11-25.md, gaps №10 and №11; with
# G7 / G8 of docs/dev/STAGE2_ARCH_PERF_2026-11-25.md): service level as the
# PERSON sees it, and the four golden signals of the CDN surfaces.
#
#  1. Client SLIs: the app and the website count the six SLO flows (sign-in,
#     feed, chat send, payment, call, opening a push) after their own retries
#     and send them as opt-in anonymous usage events; the API writes one
#     `{metric:"slo_client"}` line a minute (apps/api/src/modules/analytics/
#     client-sli-metrics.service.ts). Burn-rate alarms `<env>-slo-client-<flow>`
#     use the slow pair of the SRE Workbook recipe (6x over 6 h AND 30 min,
#     like slo.tf); mail only: a phone-side signal is noisier than the server's.
#  2. Core Web Vitals of real visits (web-vitals 6.2.3, Apache-2.0): alarm
#     when fewer than 75 % of the visits are «good» — web.dev's rule «the
#     75th percentile is good».
#  3. CloudFront (AWS Recommended Alarms for CloudFront): 5xxErrorRate on every
#     distribution (web, media, documents), OriginLatency p95 where the
#     additional metrics are on (web is subscribed here; media and documents in
#     modules/s3; media keeps its own S8-6 average alarm), and a multiwindow
#     availability burn of the website (fast pair pages, like the API's).
#
# Cost when on: 20 metric-filter metrics ($6) + 18 client burn alarms and
# composites ($4.20) + 3 web-vitals alarms + 3-6 CloudFront alarms + 4 web
# availability alarms and 2 composites (~$2.50) + web additional metrics
# (~$0.10) ≈ $13 a month at any traffic.

variable "user_side_slo_enabled" {
  type        = bool
  default     = true
  description = "Б6: client SLI burn alarms (slo-client-*), the web-vitals alarms and the website availability burn. false = none (the CloudFront 5xx / origin latency alarms stay)."
}
variable "client_slo_targets" {
  description = "Б6: share of the six flows that must work for the person (after the app's retries; 4xx and offline phones are not counted)."
  type = object({
    login   = optional(number, 0.98)
    feed    = optional(number, 0.95) # ok AND within client.sli_feed_slow_ms
    message = optional(number, 0.98) # ok AND within client.sli_message_slow_ms
    pay     = optional(number, 0.95)
    call    = optional(number, 0.95)
    push    = optional(number, 0.95)
  })
  default = {}
}
variable "client_slo_min_events" {
  type        = number
  default     = 20
  description = "Б6: fewer client events than this in a window = no client burn alarm."
}
variable "web_vitals_good_share" {
  type        = number
  default     = 0.75
  description = "Б6 / G8: alarm when fewer visits than this share have a «good» LCP / INP / CLS over 6 hours (web.dev: p75 must be good)."
}
variable "web_vitals_min_samples" {
  type        = number
  default     = 100
  description = "Б6 / G8: fewer rated visits than this in 6 hours = no web-vitals alarm."
}
variable "cloudfront_5xx_rate_percent" {
  type        = number
  default     = 5
  description = "Б6: CloudFront 5xxErrorRate (%) that alarms when it holds for 5 minutes (AWS Recommended Alarms for CloudFront). 0 = no alarm."
}
variable "cloudfront_origin_latency_p95_ms" {
  type        = number
  default     = 3000
  description = "Б6: CloudFront OriginLatency p95 (ms) that alarms when it holds for 15 minutes (needs the additional metrics). 0 = no alarm."
}
variable "cdn_additional_metrics" {
  type        = bool
  default     = false
  description = "Б6: CloudFront additional metrics are on (stack: var.cdn_additional_metrics in us-east-1): subscribes the WEB distribution too and adds OriginLatency alarms for web and documents."
}
variable "web_availability_slo_target" {
  type        = number
  default     = 0.999
  description = "Б6: share of website requests (CloudFront web distribution) that must not be a 5xx."
}
variable "web_availability_min_requests" {
  type        = number
  default     = 100
  description = "Б6: fewer website requests than this in a window = no website availability burn alarm."
}

locals {
  us_on = var.user_side_slo_enabled
  client_counters = {
    loginOk  = "SloClientLoginOk"
    loginBad = "SloClientLoginBad"
    feedOk   = "SloClientFeedOk"
    feedBad  = "SloClientFeedBad"
    msgOk    = "SloClientMsgOk"
    msgBad   = "SloClientMsgBad"
    payOk    = "SloClientPayOk"
    payBad   = "SloClientPayBad"
    callOk   = "SloClientCallOk"
    callBad  = "SloClientCallBad"
    pushOk   = "SloClientPushOk"
    pushBad  = "SloClientPushBad"
    lcpGood  = "WebVitalLcpGood"
    lcpAll   = "WebVitalLcpAll"
    inpGood  = "WebVitalInpGood"
    inpAll   = "WebVitalInpAll"
    clsGood  = "WebVitalClsGood"
    clsAll   = "WebVitalClsAll"
    ttfbGood = "WebVitalTtfbGood"
    ttfbAll  = "WebVitalTtfbAll"
  }
  client_slos = {
    login = {
      good = "SloClientLoginOk", bad = "SloClientLoginBad", target = var.client_slo_targets.login
      text = "вход (SMS-код, пароль, Google/Apple) у людей не проходит"
    }
    feed = {
      good = "SloClientFeedOk", bad = "SloClientFeedBad", target = var.client_slo_targets.feed
      text = "лента у людей открывается медленно или с ошибкой"
    }
    message = {
      good = "SloClientMsgOk", bad = "SloClientMsgBad", target = var.client_slo_targets.message
      text = "сообщения у людей отправляются медленно или с ошибкой"
    }
    pay = {
      good = "SloClientPayOk", bad = "SloClientPayBad", target = var.client_slo_targets.pay
      text = "оплата у людей не начинается (ошибка или нет ответа)"
    }
    call = {
      good = "SloClientCallOk", bad = "SloClientCallBad", target = var.client_slo_targets.call
      text = "звонок у людей не начинается или не принимается"
    }
    push = {
      good = "SloClientPushOk", bad = "SloClientPushBad", target = var.client_slo_targets.push
      text = "нажатие на пуш у людей никуда не ведёт"
    }
  }
  client_windows = {
    long  = { period = 21600, factor = 6 }
    short = { period = 1800, factor = 6 }
  }
  client_burn = {
    for pair in setproduct(keys(local.client_slos), keys(local.client_windows)) :
    "${pair[0]}-${pair[1]}" => { slo = pair[0], window = pair[1] } if local.us_on
  }
  web_vitals_all = {
    lcp = { good = "WebVitalLcpGood", all = "WebVitalLcpAll", text = "LCP (как быстро видно главное)" }
    inp = { good = "WebVitalInpGood", all = "WebVitalInpAll", text = "INP (как быстро страница отвечает на нажатие)" }
    cls = { good = "WebVitalClsGood", all = "WebVitalClsAll", text = "CLS (не прыгает ли страница)" }
  }
  web_vitals = { for k, v in local.web_vitals_all : k => v if local.us_on }
  # Media keeps its S8-6 average alarm (main.tf), so p95 is added for the others.
  cf_latency = {
    for k, v in var.cloudfront_distribution_ids : k => v
    if var.cdn_additional_metrics && var.cloudfront_origin_latency_p95_ms > 0 && k != "media"
  }
  web_avail_on = local.us_on && contains(keys(var.cloudfront_distribution_ids), "web")
  web_avail_windows_all = {
    fast_long  = { period = 3600, factor = 14.4, pair = "fast", min = var.web_availability_min_requests }
    fast_short = { period = 300, factor = 14.4, pair = "fast", min = max(10, floor(var.web_availability_min_requests / 12)) }
    slow_long  = { period = 21600, factor = 6, pair = "slow", min = var.web_availability_min_requests * 6 }
    slow_short = { period = 1800, factor = 6, pair = "slow", min = var.web_availability_min_requests }
  }
  web_avail_windows = { for k, v in local.web_avail_windows_all : k => v if local.web_avail_on }
}

# The API writes the line (AppEventsController lives there); the worker never does.
resource "aws_cloudwatch_log_metric_filter" "client_sli" {
  for_each       = local.client_counters
  name           = "${var.name}-slo-client-${each.key}"
  log_group_name = var.api_log_group
  pattern        = "{ $.metric = \"slo_client\" }"
  metric_transformation {
    name          = each.value
    namespace     = local.ns
    value         = "$.${each.key}"
    default_value = null
    unit          = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "client_burn" {
  for_each            = local.client_burn
  alarm_name          = "${var.name}-slo-client-${each.key}"
  alarm_description   = "Burn-rate window ${each.value.window} of the client-side ${each.value.slo} SLO (part of ${var.name}-slo-client-${each.value.slo})."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = min(1, local.client_windows[each.value.window].factor * (1 - local.client_slos[each.value.slo].target))
  treat_missing_data  = "notBreaching"
  tags                = var.tags
  metric_query {
    id = "good"
    metric {
      metric_name = local.client_slos[each.value.slo].good
      namespace   = local.ns
      period      = local.client_windows[each.value.window].period
      stat        = "Sum"
    }
  }
  metric_query {
    id = "bad"
    metric {
      metric_name = local.client_slos[each.value.slo].bad
      namespace   = local.ns
      period      = local.client_windows[each.value.window].period
      stat        = "Sum"
    }
  }
  metric_query {
    id          = "err"
    expression  = "IF(FILL(good, 0) + FILL(bad, 0) >= ${var.client_slo_min_events}, FILL(bad, 0) / (FILL(good, 0) + FILL(bad, 0)), 0)"
    label       = "client error rate"
    return_data = true
  }
}

resource "aws_cloudwatch_composite_alarm" "client_slo" {
  for_each          = { for k, v in local.client_slos : k => v if local.us_on }
  alarm_name        = "${var.name}-slo-client-${each.key}"
  alarm_description = "LawBid: Со стороны людей ${each.value.text} — запас ошибок сгорает в 6 раз быстрее нормы 6 часов подряд (цель ${format("%g", each.value.target * 100)} %, считают приложение и сайт после своих повторов). Сервер может этого не видеть: сеть, CDN, DNS или ошибка в приложении. Что делать: сравнить с тревогой сервера ${var.name}-slo-${each.key}-*; если сервер в порядке — проверить сайт и приложение самому, статус CloudFront/Cloudflare. Инструкция: ${var.runbook_base_url}/slo.md#client (EN: client-side ${each.key} SLO slow burn, 6 h and 30 min windows above 6x.)"
  alarm_rule        = "ALARM(\"${aws_cloudwatch_metric_alarm.client_burn["${each.key}-long"].alarm_name}\") AND ALARM(\"${aws_cloudwatch_metric_alarm.client_burn["${each.key}-short"].alarm_name}\")"
  alarm_actions     = local.ops
  ok_actions        = local.ops
  tags              = var.tags
}

resource "aws_cloudwatch_metric_alarm" "web_vitals" {
  for_each            = local.web_vitals
  alarm_name          = "${var.name}-web-vitals-${each.key}-poor"
  alarm_description   = "LawBid: Сайт у живых людей медленный по ${each.value.text}: «хорошо» меньше чем у ${format("%g", var.web_vitals_good_share * 100)} % визитов за 6 часов (правило web.dev: 75-й процентиль должен быть «хорошим»). Что делать: ничего срочного; посмотреть, что выкатили на сайт последним (Web deploy), и размер сборки (web-size-budget). Инструкция: ${var.runbook_base_url}/slo.md#web-vitals (EN: fewer than ${format("%g", var.web_vitals_good_share * 100)}% of visits have a good ${upper(each.key)} over 6 h.)"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  threshold           = var.web_vitals_good_share
  treat_missing_data  = "notBreaching"
  metric_query {
    id = "g"
    metric {
      metric_name = each.value.good
      namespace   = local.ns
      period      = 21600
      stat        = "Sum"
    }
  }
  metric_query {
    id = "a"
    metric {
      metric_name = each.value.all
      namespace   = local.ns
      period      = 21600
      stat        = "Sum"
    }
  }
  metric_query {
    id          = "share"
    expression  = "IF(FILL(a, 0) >= ${var.web_vitals_min_samples}, FILL(g, 0) / FILL(a, 0), 1)"
    label       = "good share"
    return_data = true
  }
  alarm_actions = local.ops
  ok_actions    = local.ops
  tags          = var.tags
}

# --- CloudFront: AWS Recommended Alarms -------------------------------------
resource "aws_cloudwatch_metric_alarm" "cloudfront_5xx" {
  for_each            = { for k, v in var.cloudfront_distribution_ids : k => v if var.cloudfront_5xx_rate_percent > 0 }
  alarm_name          = "${var.name}-cloudfront-5xx-${each.key}"
  alarm_description   = "LawBid: Раздача «${each.key}» (CloudFront) отвечает ошибками 5xx — больше ${var.cloudfront_5xx_rate_percent} % запросов 5 минут подряд. ${each.key == "web" ? "Сайт lawbid.dev у людей не открывается или открывается с ошибкой." : "Файлы (${each.key}) у людей не открываются."} Что делать: открыть сайт/файл самому; CloudFront → Distributions → ${each.value} → Monitoring; статус AWS. После terraform apply сайта проверить функцию CloudFront (KNOWN_ERRORS 12). Инструкция: ${var.runbook_base_url}/slo.md#cdn (EN: CloudFront ${each.key} 5xxErrorRate above ${var.cloudfront_5xx_rate_percent}% for 5 minutes; AWS recommended alarm.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 5
  datapoints_to_alarm = 5
  period              = 60
  threshold           = var.cloudfront_5xx_rate_percent
  statistic           = "Average"
  metric_name         = "5xxErrorRate"
  namespace           = "AWS/CloudFront"
  dimensions          = { DistributionId = each.value, Region = "Global" }
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

resource "aws_cloudfront_monitoring_subscription" "web" {
  count           = var.cdn_additional_metrics && contains(keys(var.cloudfront_distribution_ids), "web") ? 1 : 0
  distribution_id = var.cloudfront_distribution_ids["web"]
  monitoring_subscription {
    realtime_metrics_subscription_config {
      realtime_metrics_subscription_status = "Enabled" # the API name for the additional-metrics switch
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "cloudfront_origin_latency" {
  for_each            = local.cf_latency
  alarm_name          = "${var.name}-cloudfront-origin-latency-${each.key}"
  alarm_description   = "LawBid: Источник раздачи «${each.key}» отвечает CloudFront медленно: p95 больше ${var.cloudfront_origin_latency_p95_ms} мс 15 минут подряд — ${each.key == "web" ? "сайт" : "файлы"} у людей открываются долго. Что делать: ничего срочного; статус AWS S3; CloudFront → Distributions → ${each.value} → Monitoring. Инструкция: ${var.runbook_base_url}/slo.md#cdn (EN: CloudFront ${each.key} OriginLatency p95 above ${var.cloudfront_origin_latency_p95_ms} ms for 15 minutes.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  period              = 300
  threshold           = var.cloudfront_origin_latency_p95_ms
  extended_statistic  = "p95"
  metric_name         = "OriginLatency"
  namespace           = "AWS/CloudFront"
  dimensions          = { DistributionId = each.value, Region = "Global" }
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

# --- Website availability burn (multiwindow, like observability.tf) ---------
# 5xxErrorRate is a percentage per period; with Requests as the volume guard.
resource "aws_cloudwatch_metric_alarm" "web_availability_burn" {
  for_each            = local.web_avail_windows
  alarm_name          = "${var.name}-web-availability-${each.key}"
  alarm_description   = "Burn-rate window ${each.key} of the website availability SLO (part of ${var.name}-web-availability-${each.value.pair})."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = each.value.factor * (1 - var.web_availability_slo_target)
  treat_missing_data  = "notBreaching"
  tags                = var.tags
  metric_query {
    id = "req"
    metric {
      metric_name = "Requests"
      namespace   = "AWS/CloudFront"
      period      = each.value.period
      stat        = "Sum"
      dimensions  = { DistributionId = var.cloudfront_distribution_ids["web"], Region = "Global" }
    }
  }
  metric_query {
    id = "pct"
    metric {
      metric_name = "5xxErrorRate"
      namespace   = "AWS/CloudFront"
      period      = each.value.period
      stat        = "Average"
      dimensions  = { DistributionId = var.cloudfront_distribution_ids["web"], Region = "Global" }
    }
  }
  metric_query {
    id          = "rate"
    expression  = "IF(FILL(req, 0) >= ${each.value.min}, FILL(pct, 0) / 100, 0)"
    label       = "website 5xx share"
    return_data = true
  }
}

resource "aws_cloudwatch_composite_alarm" "web_availability" {
  for_each          = local.web_avail_on ? toset(["fast", "slow"]) : toset([])
  alarm_name        = "${var.name}-web-availability-${each.key}"
  alarm_description = each.key == "fast" ? "LawBid: Сайт lawbid.dev массово отдаёт ошибки 5xx (запас ошибок за месяц сгорает в 14 раз быстрее нормы). Что делать: открыть сайт самому; если не открывается — GitHub → Actions → Web deploy (последний выкат), CloudFront → Distributions → web; после terraform apply — проверить функцию CloudFront (KNOWN_ERRORS 12). Инструкция: ${var.runbook_base_url}/slo.md#cdn (EN: website availability fast burn: 1 h and 5 min windows both above 14.4x.)" : "LawBid: Сайт lawbid.dev долго отдаёт небольшой процент ошибок 5xx (запас сгорает в 6 раз быстрее нормы, шесть часов подряд). Что делать: CloudFront → Distributions → web → Monitoring, какие адреса с ошибкой; не откладывать до завтра. Инструкция: ${var.runbook_base_url}/slo.md#cdn (EN: website availability slow burn: 6 h and 30 min windows both above 6x.)"
  alarm_rule        = "ALARM(\"${aws_cloudwatch_metric_alarm.web_availability_burn["${each.key}_long"].alarm_name}\") AND ALARM(\"${aws_cloudwatch_metric_alarm.web_availability_burn["${each.key}_short"].alarm_name}\")"
  alarm_actions     = each.key == "fast" ? local.page : local.ops
  ok_actions        = each.key == "fast" ? local.page : local.ops
  tags              = var.tags
}
