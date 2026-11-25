# DB-ops hardening (2026-10-25, claude/db-ops-hardening): alarms on the
# numbers the worker's daily `db.health` job and the minute `outbox.sweep`
# write as structured log lines (docs/runbooks/db-ops.md). No agent, no extra
# IAM: the log metric filters turn the lines into metrics.
#
#   {metric:"db_dead_tuple_ratio", table, ratio}    ratio = dead / (live + dead)
#   {metric:"db_txid_age", database, age}           age(datfrozenxid)
#   {metric:"cross_family_outbox_oldest_pending", ageSeconds}
#   {metric:"scatter_partial_failure", ...}         (API and worker)
#   {alert:"db_table_large" | "db_table_bloat", table, ...}

variable "db_dead_tuple_ratio_alarm" {
  type        = number
  default     = 0.2
  description = "Alarm when any big table has more than this share of dead rows (0.2 = 20 %). 0 = no alarm."
}
variable "db_txid_age_alarm" {
  type        = number
  default     = 1000000000
  description = "Alarm when age(datfrozenxid) passes this (PostgreSQL forces a stop at ~2.1 billion; autovacuum normally keeps it near 200 million). 0 = no alarm."
}
variable "outbox_oldest_pending_alarm_seconds" {
  type        = number
  default     = 1800
  description = "Alarm when the oldest cross-family outbox event is still pending after this many seconds (the relay is stuck or the primary database is unreachable). 0 = no alarm."
}

resource "aws_cloudwatch_log_metric_filter" "db_dead_tuple_ratio" {
  name           = "${var.name}-db-dead-tuple-ratio"
  log_group_name = var.worker_log_group
  pattern        = "{ $.metric = \"db_dead_tuple_ratio\" }"
  metric_transformation {
    name      = "DbDeadTupleRatio"
    namespace = local.ns
    value     = "$.ratio"
    unit      = "None"
  }
}

resource "aws_cloudwatch_metric_alarm" "db_dead_tuple_ratio" {
  count               = var.db_dead_tuple_ratio_alarm > 0 ? 1 : 0
  alarm_name          = "${var.name}-db-dead-tuple-ratio"
  alarm_description   = "LawBid: В одной из больших таблиц базы много «мёртвых» строк (раздутие). Что делать: ничего срочного, база чистит себя сама; если письмо приходит несколько дней подряд — напишите Claude «раздутие таблицы». Инструкция: ${var.runbook_base_url}/db-ops.md (EN: dead tuples above ${var.db_dead_tuple_ratio_alarm * 100} % of a big table; autovacuum is not keeping up.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 86400
  threshold           = var.db_dead_tuple_ratio_alarm
  statistic           = "Maximum"
  metric_name         = aws_cloudwatch_log_metric_filter.db_dead_tuple_ratio.metric_transformation[0].name
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_log_metric_filter" "db_txid_age" {
  name           = "${var.name}-db-txid-age"
  log_group_name = var.worker_log_group
  pattern        = "{ $.metric = \"db_txid_age\" }"
  metric_transformation {
    name      = "DbTxidAge"
    namespace = local.ns
    value     = "$.age"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "db_txid_age" {
  count               = var.db_txid_age_alarm > 0 ? 1 : 0
  alarm_name          = "${var.name}-db-txid-age"
  alarm_description   = "LawBid: База близко к «переполнению счётчика транзакций» — если не вмешаться, она остановится на запись. Что делать: срочно напишите Claude «txid wraparound»; обычно помогает ручной VACUUM FREEZE и поиск зависшей транзакции. Инструкция: ${var.runbook_base_url}/db-ops.md (EN: age(datfrozenxid) above ${var.db_txid_age_alarm}.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 86400
  threshold           = var.db_txid_age_alarm
  statistic           = "Maximum"
  metric_name         = aws_cloudwatch_log_metric_filter.db_txid_age.metric_transformation[0].name
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.page
  ok_actions          = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_log_metric_filter" "outbox_oldest_pending" {
  name           = "${var.name}-outbox-oldest-pending"
  log_group_name = var.worker_log_group
  pattern        = "{ $.metric = \"cross_family_outbox_oldest_pending\" }"
  metric_transformation {
    name      = "CrossFamilyOutboxOldestPendingSeconds"
    namespace = local.ns
    value     = "$.ageSeconds"
    unit      = "Seconds"
  }
}

resource "aws_cloudwatch_metric_alarm" "outbox_oldest_pending" {
  count               = var.outbox_oldest_pending_alarm_seconds > 0 ? 1 : 0
  alarm_name          = "${var.name}-outbox-oldest-pending"
  alarm_description   = "LawBid: Служебные события между частями базы не доходят дольше ${var.outbox_oldest_pending_alarm_seconds / 60} минут (счётчики и согласия могут отставать). Что делать: админка → Здоровье системы; если не проходит — напишите Claude «outbox завис». Инструкция: ${var.runbook_base_url}/db-ops.md (EN: oldest pending cross_family_outbox row is older than ${var.outbox_oldest_pending_alarm_seconds} s.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  period              = 300
  threshold           = var.outbox_oldest_pending_alarm_seconds
  statistic           = "Maximum"
  metric_name         = aws_cloudwatch_log_metric_filter.outbox_oldest_pending.metric_transformation[0].name
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

# A scatter write (updateMany / deleteMany over every database) that worked
# on some databases and failed on others: apps/api/src/sharding/scatter-gather.ts.
resource "aws_cloudwatch_log_metric_filter" "scatter_partial_failure" {
  for_each = {
    api    = var.api_log_group
    worker = var.worker_log_group
  }
  name           = "${var.name}-scatter-partial-failure-${each.key}"
  log_group_name = each.value
  pattern        = "{ $.metric = \"scatter_partial_failure\" }"
  metric_transformation {
    name      = "ScatterPartialFailures"
    namespace = local.ns
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "scatter_partial_failure" {
  alarm_name          = "${var.name}-scatter-partial-failure"
  alarm_description   = "LawBid: Массовая запись прошла не во всех частях базы (одна часть недоступна). Что делать: админка → Здоровье системы → база; повторите действие позже. Инструкция: ${var.runbook_base_url}/db-ops.md (EN: updateMany/deleteMany applied on some databases only.)"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 300
  threshold           = 1
  statistic           = "Sum"
  metric_name         = "ScatterPartialFailures"
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
  depends_on          = [aws_cloudwatch_log_metric_filter.scatter_partial_failure]
}

# The daily db.health job logs `alert: db_table_large` (a table passed
# 20 GB) or `alert: db_table_bloat` (20 % dead rows in a big table).
resource "aws_cloudwatch_log_metric_filter" "db_table_health" {
  name           = "${var.name}-db-table-health"
  log_group_name = var.worker_log_group
  pattern        = "{ $.alert = \"db_table_large\" || $.alert = \"db_table_bloat\" }"
  metric_transformation {
    name      = "DbTableHealthAlerts"
    namespace = local.ns
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "db_table_health" {
  alarm_name          = "${var.name}-db-table-health"
  alarm_description   = "LawBid: Одна из таблиц базы выросла больше 20 ГБ или сильно раздулась. Что делать: ничего срочного; админка → Система → Хранилище → «Самые большие таблицы»; при росте напишите Claude «разделить таблицу». Инструкция: ${var.runbook_base_url}/db-ops.md (EN: a table passed 20 GB or 20 % dead rows.)"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 86400
  threshold           = 1
  statistic           = "Sum"
  metric_name         = aws_cloudwatch_log_metric_filter.db_table_health.metric_transformation[0].name
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags
}

# --- C2 (25.11): cache invalidation from the database change log -----------
# The worker's CacheCdcService logs every 30 s (apps/api/src/modules/cache-cdc):
#   {metric:"cache_cdc_lag_seconds", database, lagSec}
#   {metric:"cache_cdc_slot_retained_mb", database, mb}
#   {alert:"cache_cdc_slot_dropped", database, retainedMb}
# plus RDS's own OldestReplicationSlotLag (AWS «Best practices for RDS for
# PostgreSQL replication slots»: watch it, an unread slot fills the disk).
# Nothing is logged while the admin switch db.cdc_mode is Выкл: no alarm.
variable "cache_cdc_lag_alarm_seconds" {
  type        = number
  default     = 300
  description = "Alarm when a committed change waits longer than this for its cache drop by the change log (seconds, 10 minutes in a row). 0 = no alarm."
}
variable "replication_slot_lag_alarm_mb" {
  type        = number
  default     = 4096
  description = "Alarm when a replication slot keeps more than this much WAL (RDS OldestReplicationSlotLag, MB). 0 = no alarm."
}

resource "aws_cloudwatch_log_metric_filter" "cache_cdc_lag" {
  name           = "${var.name}-cache-cdc-lag"
  log_group_name = var.worker_log_group
  pattern        = "{ $.metric = \"cache_cdc_lag_seconds\" }"
  metric_transformation {
    name      = "CacheCdcLagSeconds"
    namespace = local.ns
    value     = "$.lagSec"
    unit      = "Seconds"
  }
}

resource "aws_cloudwatch_metric_alarm" "cache_cdc_lag" {
  count               = var.cache_cdc_lag_alarm_seconds > 0 ? 1 : 0
  alarm_name          = "${var.name}-cache-cdc-lag"
  alarm_description   = "LawBid: Сброс кэша по журналу базы отстаёт больше ${var.cache_cdc_lag_alarm_seconds / 60} минут. Приложение по-прежнему сбрасывает кэш само, пользователи видят старое не дольше срока кэша (1–5 минут). Что делать: админка → Здоровье системы → «Сброс кэша по журналу базы»; если держится — переключите db.cdc_mode на Выкл и напишите Claude «cache cdc». Инструкция: ${var.runbook_base_url}/cache-cdc.md (EN: cache CDC lag above ${var.cache_cdc_lag_alarm_seconds} s for 10 minutes.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 300
  threshold           = var.cache_cdc_lag_alarm_seconds
  statistic           = "Maximum"
  metric_name         = aws_cloudwatch_log_metric_filter.cache_cdc_lag.metric_transformation[0].name
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  ok_actions          = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_log_metric_filter" "cache_cdc_slot_dropped" {
  name           = "${var.name}-cache-cdc-slot-dropped"
  log_group_name = var.worker_log_group
  pattern        = "{ $.alert = \"cache_cdc_slot_dropped\" }"
  metric_transformation {
    name      = "CacheCdcSlotDrops"
    namespace = local.ns
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "cache_cdc_slot_dropped" {
  alarm_name          = "${var.name}-cache-cdc-slot-dropped"
  alarm_description   = "LawBid: Защита диска базы удалила застрявшее место чтения журнала для сброса кэша и создала новое. Пользователи не пострадали (кэши дожили свой срок). Что делать: если письмо повторяется — напишите Claude «cache cdc slot». Инструкция: ${var.runbook_base_url}/cache-cdc.md (EN: the cache CDC slot passed db.cdc_max_slot_wal_mb or was lost and was re-created.)"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 3600
  threshold           = 1
  statistic           = "Sum"
  metric_name         = aws_cloudwatch_log_metric_filter.cache_cdc_slot_dropped.metric_transformation[0].name
  namespace           = local.ns
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.ops
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "replication_slot_lag" {
  count               = var.db_instance_id != "" && var.replication_slot_lag_alarm_mb > 0 ? 1 : 0
  alarm_name          = "${var.name}-replication-slot-lag"
  alarm_description   = "LawBid: База держит больше ${var.replication_slot_lag_alarm_mb} МБ журнала для места репликации, которое никто не читает (сброс кэша по журналу, перенос частей базы или обновление базы). Если так оставить, кончится диск. Что делать: админка → Здоровье системы; переключите db.cdc_mode на Выкл (место удалится само) и напишите Claude «replication slot». Инструкция: ${var.runbook_base_url}/cache-cdc.md (EN: RDS OldestReplicationSlotLag above ${var.replication_slot_lag_alarm_mb} MB.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 300
  threshold           = var.replication_slot_lag_alarm_mb
  statistic           = "Maximum"
  metric_name         = "OldestReplicationSlotLag"
  namespace           = "AWS/RDS"
  dimensions          = { DBInstanceIdentifier = var.db_instance_id }
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.page
  ok_actions          = local.ops
  tags                = var.tags
}
