# Б6 (25.11): service level as the person sees it (client SLIs, Core Web
# Vitals) and the CDN golden signals. Mock providers, no AWS:
#   terraform -chdir=infra/modules/monitoring init -backend=false
#   terraform -chdir=infra/modules/monitoring test

mock_provider "aws" {
  override_during = plan
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111111111111" }
  }
  mock_data "aws_region" {
    defaults = { region = "us-east-1", name = "us-east-1" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}", minified_json = "{}" }
  }
}
mock_provider "archive" {}

variables {
  name                        = "lawbid-test"
  alert_emails                = []
  alb_arn_suffix              = "app/lb/1"
  api_target_group_arn_suffix = "targetgroup/api/1"
  cluster_name                = "lawbid-test"
  api_service_name            = "api"
  worker_service_name         = "worker"
  redis_replication_group_id  = "lawbid-test"
  api_log_group               = "/ecs/lawbid-test/api"
  worker_log_group            = "/ecs/lawbid-test/worker"
  kms_key_arn                 = "arn:aws:kms:us-east-1:111111111111:key/k"
  cloudfront_distribution_ids = { web = "EWEB", media = "EMEDIA", documents = "EDOCS" }
}

run "client_slis_have_burn_alarms" {
  command = plan
  assert {
    condition     = length(aws_cloudwatch_log_metric_filter.client_sli) == 20 && alltrue([for f in aws_cloudwatch_log_metric_filter.client_sli : f.pattern == "{ $.metric = \"slo_client\" }" && f.log_group_name == "/ecs/lawbid-test/api"])
    error_message = "20 counters of the {metric:slo_client} line, from the api log group"
  }
  assert {
    condition     = toset(keys(aws_cloudwatch_composite_alarm.client_slo)) == toset(["login", "feed", "message", "pay", "call", "push"]) && aws_cloudwatch_composite_alarm.client_slo["pay"].alarm_name == "lawbid-test-slo-client-pay"
    error_message = "one slo-client-<flow> pair per SLO flow"
  }
  assert {
    condition     = alltrue([for a in aws_cloudwatch_composite_alarm.client_slo : length(a.alarm_actions) == 1])
    error_message = "client SLO alarms mail only"
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.client_burn["login-long"].threshold == 6 * (1 - 0.98)
    error_message = "slow burn: 6x the budget of the 98 % login target"
  }
}

run "web_vitals_p75_rule" {
  command = plan
  assert {
    condition     = toset(keys(aws_cloudwatch_metric_alarm.web_vitals)) == toset(["lcp", "inp", "cls"]) && aws_cloudwatch_metric_alarm.web_vitals["lcp"].threshold == 0.75 && aws_cloudwatch_metric_alarm.web_vitals["lcp"].comparison_operator == "LessThanThreshold"
    error_message = "alarm when fewer than 75 % of visits have a good LCP / INP / CLS"
  }
}

run "every_distribution_has_a_5xx_alarm" {
  command = plan
  assert {
    condition     = toset(keys(aws_cloudwatch_metric_alarm.cloudfront_5xx)) == toset(["web", "media", "documents"]) && aws_cloudwatch_metric_alarm.cloudfront_5xx["web"].metric_name == "5xxErrorRate" && aws_cloudwatch_metric_alarm.cloudfront_5xx["web"].dimensions.DistributionId == "EWEB"
    error_message = "5xxErrorRate alarm on web, media and documents"
  }
  assert {
    condition     = length(aws_cloudwatch_metric_alarm.cloudfront_origin_latency) == 0 && length(aws_cloudfront_monitoring_subscription.web) == 0
    error_message = "no additional metrics: no OriginLatency alarm, no subscription"
  }
  assert {
    condition     = length(aws_cloudwatch_composite_alarm.web_availability) == 2 && strcontains(aws_cloudwatch_composite_alarm.web_availability["fast"].alarm_rule, "lawbid-test-web-availability-fast_short") && aws_cloudwatch_metric_alarm.web_availability_burn["fast_long"].threshold == 14.4 * (1 - 0.999)
    error_message = "website availability burn: multiwindow fast and slow pairs on the web distribution"
  }
}

run "additional_metrics_add_origin_latency" {
  command = plan
  variables {
    cdn_additional_metrics = true
  }
  assert {
    condition     = toset(keys(aws_cloudwatch_metric_alarm.cloudfront_origin_latency)) == toset(["web", "documents"]) && aws_cloudwatch_metric_alarm.cloudfront_origin_latency["web"].extended_statistic == "p95"
    error_message = "OriginLatency p95 for web and documents (media keeps its S8-6 alarm)"
  }
  assert {
    condition     = aws_cloudfront_monitoring_subscription.web[0].distribution_id == "EWEB"
    error_message = "the web distribution is subscribed to the additional metrics"
  }
}

run "off_keeps_only_the_cdn_alarms" {
  command = plan
  variables {
    user_side_slo_enabled = false
  }
  assert {
    condition     = length(aws_cloudwatch_composite_alarm.client_slo) == 0 && length(aws_cloudwatch_metric_alarm.web_vitals) == 0 && length(aws_cloudwatch_composite_alarm.web_availability) == 0 && length(aws_cloudwatch_metric_alarm.cloudfront_5xx) == 3
    error_message = "off: no client / web-vitals / web availability alarms; CDN 5xx alarms stay"
  }
}
