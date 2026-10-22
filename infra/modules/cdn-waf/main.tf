# Security research #5 (2026-10-22), A3 — one AWS WAF web ACL for the
# CloudFront distributions (the web app and the media CDN). Until now only
# the ALB (API, admin) had a WAF: a bot could pull the web build or hotlink
# media without any limit (paid egress, docs/COST_PROTECTION.md).
#
# Rules, in order:
#   1. rate-per-ip — more than `rate_limit_per_5m` requests from one address
#      in 5 minutes are blocked (2000 by default: a browser opening the app
#      makes a few dozen requests; a scraper makes thousands);
#   2. AWS managed Amazon IP reputation list (known bad sources);
#   3. AWS managed Known bad inputs (Log4j-style probes and the like).
# A CloudFront web ACL must live in us-east-1 — the stack's main region
# (CloudFront reads its certificates from there as well, modules/web).
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "name" { type = string }
variable "rate_limit_per_5m" {
  type        = number
  default     = 2000
  description = "Requests from one IP in 5 minutes before CloudFront blocks it (AWS minimum 10)."
}
variable "tags" {
  type    = map(string)
  default = {}
}

data "aws_region" "current" {}

resource "aws_wafv2_web_acl" "cdn" {
  name  = "${var.name}-cdn-waf"
  scope = "CLOUDFRONT"
  default_action {
    allow {}
  }

  rule {
    name     = "rate-per-ip"
    priority = 1
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = var.rate_limit_per_5m
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-cdn-rate-per-ip"
      sampled_requests_enabled   = true
    }
  }

  dynamic "rule" {
    for_each = {
      ip_rep     = { priority = 10, name = "AWSManagedRulesAmazonIpReputationList" }
      bad_inputs = { priority = 11, name = "AWSManagedRulesKnownBadInputsRuleSet" }
    }
    content {
      name     = rule.key
      priority = rule.value.priority
      override_action {
        none {}
      }
      statement {
        managed_rule_group_statement {
          name        = rule.value.name
          vendor_name = "AWS"
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name}-cdn-${rule.key}"
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name}-cdn-waf"
    sampled_requests_enabled   = true
  }
  tags = var.tags

  lifecycle {
    precondition {
      condition     = data.aws_region.current.name == "us-east-1"
      error_message = "A CloudFront web ACL can only be created in us-east-1 (the stack's main region)."
    }
  }
}

output "web_acl_arn" { value = aws_wafv2_web_acl.cdn.arn }
