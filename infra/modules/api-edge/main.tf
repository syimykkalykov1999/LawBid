# G1 (docs/dev/STAGE2_ARCH_PERF_2026-11-25.md): the app's API through the
# CloudFront edge. Phones today open TCP + TLS to one region (us-east-1); Meta
# ("How Facebook is bringing QUIC to billions", 21.10.2020) and Uber
# ("Employing QUIC Protocol to Optimize Uber's App Performance", 2019) send app
# traffic through an edge over QUIC. The app's network stack already speaks
# HTTP/3 (Cronet / URLSession, apps/mobile/lib/core/network/http_transport_io.dart);
# this gives it something to talk to.
#
# Built like the web distribution (infra/modules/web/main.tf, `http2and3`),
# with the AWS-managed policies (CloudFront Developer Guide, "Use managed cache
# policies" / "Use managed origin request policies", read 25.11.2026):
#   CachingDisabled  4135ea2d-6df8-44a3-9df3-4b5a84be39ad  nothing is kept at
#                    the edge, so no signed-in answer can ever be shared;
#   AllViewer        216adef6-5c7f-47e4-b989-5492eafa07d3  every viewer header
#                    (Authorization, cookies incl. AWSALB for Socket.IO
#                    polling), every query string AND the viewer's Host: the
#                    ALB routes by `api.<domain>` and CloudFront checks the
#                    ALB certificate against that Host (CloudFront Developer
#                    Guide, "Require HTTPS for communication between CloudFront
#                    and your custom origin"). WebSocket upgrades pass through
#                    on every behavior (CloudFront "Use WebSockets").
# The origin is the ALB's own DNS name. CloudFront adds X-Origin-Verify with a
# secret on every origin request and overwrites any viewer header of that name;
# modules/alb lets those requests skip its WAF (this distribution's WAF already
# judged them with the real client address) and, once `origin lock` is on,
# answers 403 to API requests without it (AWS "Restricting access to
# Application Load Balancers" pattern).
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.72" }
  }
}

variable "name" { type = string }
variable "api_host" {
  type        = string
  description = "api.<domain>: the alias of the distribution and the Host the ALB routes on."
}
variable "alb_dns_name" { type = string }
variable "certificate_arn" {
  type        = string
  description = "ACM certificate for api_host in us-east-1 (CloudFront reads only that region)."
  validation {
    condition     = can(regex("^arn:aws:acm:us-east-1:", var.certificate_arn))
    error_message = "CloudFront needs the api certificate from ACM in us-east-1."
  }
}
variable "origin_verify_value" {
  type      = string
  sensitive = true
  validation {
    condition     = length(var.origin_verify_value) >= 32
    error_message = "origin_verify_value: at least 32 characters."
  }
}
variable "web_acl_arn" {
  type        = string
  default     = ""
  description = "CLOUDFRONT-scope WAF ACL with the API rules (modules/alb, edge copy). Empty = none."
}
variable "price_class" {
  type        = string
  default     = "PriceClass_100"
  description = "Edge locations used. PriceClass_100 = North America + Europe, the cheapest; PriceClass_All = every edge."
}
variable "origin_read_timeout" {
  type        = number
  default     = 60
  description = "Seconds CloudFront waits for the API (1-60 without a quota raise; CloudFront default 30)."
}
variable "alerts_topic_arn" {
  type    = string
  default = ""
}
variable "alarm_5xx_rate_percent" {
  type        = number
  default     = 2
  description = "Alarm when the edge answers more than this % of requests with 5xx for 3 x 5 minutes."
}
variable "alarm_origin_latency_ms" {
  type        = number
  default     = 1500
  description = "Alarm when the average time CloudFront waits for the API is above this for 3 x 5 minutes."
}
variable "tags" {
  type    = map(string)
  default = {}
}

locals {
  origin_header = "X-Origin-Verify"
}

resource "aws_cloudfront_distribution" "api" {
  enabled         = true
  comment         = "${var.name} api edge"
  price_class     = var.price_class
  is_ipv6_enabled = true
  http_version    = "http2and3"
  aliases         = [var.api_host]
  web_acl_id      = var.web_acl_arn == "" ? null : var.web_acl_arn
  # Same as the web distribution: apply returns once AWS accepted it.
  wait_for_deployment = false

  origin {
    domain_name = var.alb_dns_name
    origin_id   = "alb"
    custom_header {
      name  = local.origin_header
      value = var.origin_verify_value
    }
    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = var.origin_read_timeout
      origin_keepalive_timeout = 60
    }
  }

  default_cache_behavior {
    target_origin_id       = "alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    # The API compresses itself (brotli / gzip, apps/api/src/app.setup.ts).
    compress                 = false
    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
    origin_request_policy_id = "216adef6-5c7f-47e4-b989-5492eafa07d3" # Managed-AllViewer
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = var.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = var.tags
}

# OriginLatency needs CloudFront's additional metrics (CloudWatch metric
# price, about $2.40 a month per distribution, CloudFront pricing 2026).
resource "aws_cloudfront_monitoring_subscription" "api" {
  distribution_id = aws_cloudfront_distribution.api.id
  monitoring_subscription {
    realtime_metrics_subscription_config {
      realtime_metrics_subscription_status = "Enabled"
    }
  }
}

# CloudFront publishes its metrics in us-east-1 with Region = Global.
resource "aws_cloudwatch_metric_alarm" "edge_5xx" {
  alarm_name          = "${var.name}-api-edge-5xx-rate"
  alarm_description   = "The API edge (CloudFront) answers too many 5xx: the ALB or the api is failing, or the origin secret / certificate does not match."
  namespace           = "AWS/CloudFront"
  metric_name         = "5xxErrorRate"
  dimensions          = { DistributionId = aws_cloudfront_distribution.api.id, Region = "Global" }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = var.alarm_5xx_rate_percent
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alerts_topic_arn == "" ? [] : [var.alerts_topic_arn]
  ok_actions          = var.alerts_topic_arn == "" ? [] : [var.alerts_topic_arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "edge_origin_latency" {
  alarm_name          = "${var.name}-api-edge-origin-latency"
  alarm_description   = "CloudFront waits too long for the API (average OriginLatency)."
  namespace           = "AWS/CloudFront"
  metric_name         = "OriginLatency"
  dimensions          = { DistributionId = aws_cloudfront_distribution.api.id, Region = "Global" }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = var.alarm_origin_latency_ms
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alerts_topic_arn == "" ? [] : [var.alerts_topic_arn]
  ok_actions          = var.alerts_topic_arn == "" ? [] : [var.alerts_topic_arn]
  tags                = var.tags
  depends_on          = [aws_cloudfront_monitoring_subscription.api]
}

output "domain_name" { value = aws_cloudfront_distribution.api.domain_name }
output "hosted_zone_id" { value = aws_cloudfront_distribution.api.hosted_zone_id }
output "distribution_id" { value = aws_cloudfront_distribution.api.id }
output "origin_header_name" { value = local.origin_header }
