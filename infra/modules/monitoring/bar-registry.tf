# Owner row 50 (13.11): state bar registries are read from the states' own
# sites and open-data APIs; a site that changed its page or blocks us must not
# turn silently into «not found». The API / worker count every lookup per
# state (apps/api/src/modules/verification/services/registry-health.service.ts)
# and log ONE line when a state's error or not-found rate jumps above its own
# 7-day rate:
#
#   {alert:"bar_registry_degraded", state, kind, window, windowRate, baselineRate}
#
# Lookups run in the API (sign-ups) and in the worker (monthly re-check), so
# both log groups are filtered into the same metric.

locals {
  bar_registry_log_groups = {
    api    = var.api_log_group
    worker = var.worker_log_group
  }
}

resource "aws_cloudwatch_log_metric_filter" "bar_registry_degraded" {
  for_each       = local.bar_registry_log_groups
  name           = "${var.name}-bar-registry-degraded-${each.key}"
  log_group_name = each.value
  pattern        = "{ $.alert = \"bar_registry_degraded\" }"
  metric_transformation {
    name      = "BarRegistryDegraded"
    namespace = local.ns
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "bar_registry_degraded" {
  alarm_name          = "${var.name}-bar-registry-degraded"
  alarm_description   = "LawBid: Реестр адвокатов одного из штатов перестал нормально отвечать (много ошибок или «не найден» против обычных 7 дней). Проверки этого штата сами идут человеку, никто не получает отказ из-за сбоя сайта. Что делать: админка → Ключи и сервисы → «Реестры адвокатов по штатам» → штат из письма → «Проверить»; если сайт штата поменялся, напишите Claude «реестр штата сломался». Инструкция: ${var.runbook_base_url}/bar-registry-health.md (EN: a state bar registry's error / not-found rate jumped above its 7-day baseline.)"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 3600
  threshold           = 1
  statistic           = "Sum"
  metric_name         = "BarRegistryDegraded"
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags
  depends_on          = [aws_cloudwatch_log_metric_filter.bar_registry_degraded]
}
