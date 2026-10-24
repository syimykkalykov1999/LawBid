# Owner 2026-10-22: second relay in another Availability Zone, health checks,
# DNS and alarms. Everything here is off unless `secondary_subnet_id`,
# `alerts_topic_arn` or `hosted_zone_id` is set. Runbook: docs/runbooks/TURN.md.
#
# The second coturn shares the secret (SSM parameter), security group and IAM
# role with the first, so the API's single TURN_SECRET works on both. Clients
# get both addresses behind turn.<realm> (several A records) and try the next
# one when the first does not answer (the browser / WebRTC stack does this).

locals {
  second = var.secondary_subnet_id != null
}

resource "aws_eip" "second" {
  count  = local.second ? 1 : 0
  domain = "vpc"
  tags   = merge(var.tags, { Name = "${var.name}-turn-2" })
}

resource "aws_instance" "second" {
  count                  = local.second ? 1 : 0
  ami                    = data.aws_ssm_parameter.ami.value
  instance_type          = var.instance_type
  subnet_id              = var.secondary_subnet_id
  vpc_security_group_ids = [aws_security_group.this.id]
  iam_instance_profile   = aws_iam_instance_profile.this.name
  tags                   = merge(var.tags, { Name = "${var.name}-turn-2" })

  metadata_options {
    http_tokens = "required" # IMDSv2 only
  }
  root_block_device {
    volume_size = 8
    volume_type = "gp3"
    encrypted   = true
  }

  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    realm        = var.realm
    external_ip  = aws_eip.second[0].public_ip
    secret_param = aws_ssm_parameter.secret.name
    region       = data.aws_region.current.name
    denied       = var.denied_peer_cidrs
    quota        = local.quota
  })
  user_data_replace_on_change = true
}

resource "aws_eip_association" "second" {
  count         = local.second ? 1 : 0
  instance_id   = aws_instance.second[0].id
  allocation_id = aws_eip.second[0].id
}

locals {
  relays = merge(
    { primary = { instance_id = aws_instance.this.id, ip = aws_eip.this.public_ip } },
    local.second ? { second = { instance_id = aws_instance.second[0].id, ip = aws_eip.second[0].public_ip } } : {},
  )
  alarms_on = var.alerts_topic_arn != null
}

# --- health checks and DNS ---------------------------------------------------
# TCP 3478 is the TURN listener; a dead box or a stopped coturn fails it.
resource "aws_route53_health_check" "this" {
  for_each          = var.health_checks ? local.relays : {}
  type              = "TCP"
  ip_address        = each.value.ip
  port              = 3478
  request_interval  = 30
  failure_threshold = 3
  tags              = merge(var.tags, { Name = "${var.name}-turn-${each.key}" })
}

# Multivalue answer: Route 53 returns up to 8 healthy addresses; an
# unhealthy relay drops out of the answer by itself.
resource "aws_route53_record" "turn" {
  for_each                         = var.hosted_zone_id == null ? {} : local.relays
  zone_id                          = var.hosted_zone_id
  name                             = "turn.${var.realm}"
  type                             = "A"
  ttl                              = 60
  records                          = [each.value.ip]
  set_identifier                   = each.key
  multivalue_answer_routing_policy = true
  health_check_id                  = var.health_checks ? aws_route53_health_check.this[each.key].id : null
}

# --- alarms (to the alerts topic) ----------------------------------------------
# System check failed = the host is broken: EC2 recovers it (the Elastic IP
# stays) and we are told.
resource "aws_cloudwatch_metric_alarm" "system_status" {
  for_each            = local.alarms_on ? local.relays : {}
  alarm_name          = "${var.name}-turn-${each.key}-system-status"
  alarm_description   = "LawBid: Сервер звонков (TURN, ${each.key}) сломался на стороне AWS; он восстанавливается сам. Если письмо повторяется — docs/runbooks/TURN.md (EN: EC2 system status check failed, auto-recover requested.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 60
  threshold           = 0
  statistic           = "Maximum"
  metric_name         = "StatusCheckFailed_System"
  namespace           = "AWS/EC2"
  dimensions          = { InstanceId = each.value.instance_id }
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alerts_topic_arn, "arn:aws:automate:${data.aws_region.current.name}:ec2:recover"]
  ok_actions          = [var.alerts_topic_arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "instance_status" {
  for_each            = local.alarms_on ? local.relays : {}
  alarm_name          = "${var.name}-turn-${each.key}-instance-status"
  alarm_description   = "LawBid: Сервер звонков (TURN, ${each.key}) не отвечает на проверки. Что делать: Session Manager → sudo systemctl restart coturn; не помогло — docs/runbooks/TURN.md (EN: EC2 instance status check failed for 5 min.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 5
  period              = 60
  threshold           = 0
  statistic           = "Maximum"
  metric_name         = "StatusCheckFailed_Instance"
  namespace           = "AWS/EC2"
  dimensions          = { InstanceId = each.value.instance_id }
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alerts_topic_arn]
  ok_actions          = [var.alerts_topic_arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "health" {
  for_each            = local.alarms_on && var.health_checks ? local.relays : {}
  alarm_name          = "${var.name}-turn-${each.key}-health"
  alarm_description   = "LawBid: Сервер звонков (TURN, ${each.key}) не принимает соединения на порту 3478 (проверка Route 53). Звонки идут через второй сервер, если он есть. Что делать: docs/runbooks/TURN.md (EN: Route 53 TCP health check on 3478 failed for 2 min.)"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  period              = 60
  threshold           = 1
  statistic           = "Minimum"
  metric_name         = "HealthCheckStatus"
  namespace           = "AWS/Route53"
  dimensions          = { HealthCheckId = aws_route53_health_check.this[each.key].id }
  treat_missing_data  = "breaching"
  alarm_actions       = [var.alerts_topic_arn]
  ok_actions          = [var.alerts_topic_arn]
  tags                = var.tags
}

# Egress ceiling: bytes the relays send in 24 h. A relay is a bandwidth
# pump (every call minute without a direct path is paid traffic), so a
# runaway (abuse, a stuck client) shows here before the bill does.
resource "aws_cloudwatch_metric_alarm" "traffic" {
  count               = local.alarms_on && var.traffic_alarm_gb_per_day > 0 ? 1 : 0
  alarm_name          = "${var.name}-turn-traffic"
  alarm_description   = "LawBid: Серверы звонков отправили больше ${var.traffic_alarm_gb_per_day} ГБ за сутки (≈ $0.09 за ГБ). Если это не рост числа звонков — docs/runbooks/TURN.md «Трафик» (EN: TURN egress above the daily ceiling.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = var.traffic_alarm_gb_per_day * 1000000000
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alerts_topic_arn]
  ok_actions          = [var.alerts_topic_arn]
  tags                = var.tags

  metric_query {
    id          = "total"
    expression  = "SUM(METRICS())"
    label       = "TURN bytes out per day"
    return_data = true
  }
  dynamic "metric_query" {
    for_each = local.relays
    content {
      id = "out_${metric_query.key}"
      metric {
        metric_name = "NetworkOut"
        namespace   = "AWS/EC2"
        period      = 86400
        stat        = "Sum"
        dimensions  = { InstanceId = metric_query.value.instance_id }
      }
    }
  }
}

# --- "close to the limit" alarms (owner 2026-10-23) ----------------------------
# No agent needed: network (NetworkIn/Out, 5-minute points) against the type's
# sustained baseline, CPU, CPU credits (t types), and the allocation count that
# the box itself publishes (user-data timer -> LawBid/TURN Allocations).
locals {
  baseline_bytes_per_5min = local.baseline_mbps * 1000000 / 8 * 300
}

resource "aws_cloudwatch_metric_alarm" "network" {
  for_each            = local.alarms_on ? local.relays : {}
  alarm_name          = "${var.name}-turn-${each.key}-network"
  alarm_description   = "LawBid: Сервер звонков (TURN, ${each.key}) гонит трафик выше 70 % своего постоянного предела (${local.baseline_mbps} Мбит/с) 10 минут. Скоро звонки начнут заикаться. Что делать: взять сервер побольше (turn_instance_type в tfvars), docs/runbooks/TURN.md «Смена размера» (EN: NetworkIn/Out above 70% of the instance baseline for 10 min.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = local.baseline_bytes_per_5min * 0.7
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alerts_topic_arn]
  ok_actions          = [var.alerts_topic_arn]
  tags                = var.tags

  metric_query {
    id          = "worst"
    expression  = "MAX([in, out])"
    label       = "bytes per 5 min, worse direction"
    return_data = true
  }
  metric_query {
    id = "in"
    metric {
      metric_name = "NetworkIn"
      namespace   = "AWS/EC2"
      period      = 300
      stat        = "Sum"
      dimensions  = { InstanceId = each.value.instance_id }
    }
  }
  metric_query {
    id = "out"
    metric {
      metric_name = "NetworkOut"
      namespace   = "AWS/EC2"
      period      = 300
      stat        = "Sum"
      dimensions  = { InstanceId = each.value.instance_id }
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "cpu" {
  for_each            = local.alarms_on ? local.relays : {}
  alarm_name          = "${var.name}-turn-${each.key}-cpu"
  alarm_description   = "LawBid: Сервер звонков (TURN, ${each.key}) загружен процессором выше 70 % 10 минут. Что делать: сервер побольше, docs/runbooks/TURN.md «Смена размера» (EN: CPU above 70% for 10 min.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 300
  threshold           = 70
  statistic           = "Average"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  dimensions          = { InstanceId = each.value.instance_id }
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alerts_topic_arn]
  ok_actions          = [var.alerts_topic_arn]
  tags                = var.tags
}

# t4g: when the credits run out the CPU is throttled to its baseline share.
resource "aws_cloudwatch_metric_alarm" "cpu_credits" {
  for_each            = local.alarms_on && local.burstable ? local.relays : {}
  alarm_name          = "${var.name}-turn-${each.key}-cpu-credits"
  alarm_description   = "LawBid: У сервера звонков (TURN, ${each.key}) почти кончился запас процессора (кредиты). Дальше он замедлится и звонки начнут прерываться. Что делать: сервер побольше или без кредитов (c6gn/c7gn), docs/runbooks/TURN.md «Смена размера» (EN: CPUCreditBalance under 20 for 15 min.)"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3
  period              = 300
  threshold           = 20
  statistic           = "Minimum"
  metric_name         = "CPUCreditBalance"
  namespace           = "AWS/EC2"
  dimensions          = { InstanceId = each.value.instance_id }
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alerts_topic_arn]
  ok_actions          = [var.alerts_topic_arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "allocations" {
  for_each            = local.alarms_on ? local.relays : {}
  alarm_name          = "${var.name}-turn-${each.key}-allocations"
  alarm_description   = "LawBid: На сервере звонков (TURN, ${each.key}) занято больше 70 % мест (${floor(local.quota * 0.7)} из ${local.quota}). При 100 % новые звонки через этот сервер не соединятся. Что делать: сервер побольше или turn_total_quota, docs/runbooks/TURN.md «Смена размера» (EN: relay allocations above 70% of total-quota for 10 min.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 300
  threshold           = local.quota * 0.7
  statistic           = "Maximum"
  metric_name         = "Allocations"
  namespace           = "LawBid/TURN"
  dimensions          = { InstanceId = each.value.instance_id }
  # No data = the reporter is not running (box down: other alarms fire).
  treat_missing_data = "notBreaching"
  alarm_actions      = [var.alerts_topic_arn]
  ok_actions         = [var.alerts_topic_arn]
  tags               = var.tags
}
