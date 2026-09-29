# docs/06 §6.1 — Application Load Balancer (HTTPS only, WebSocket-friendly
# idle timeout) with AWS WAF (managed rule groups + a per-IP rate rule).
# Hosts: api.<domain> → api service, admin.<domain> → admin service.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "name" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "certificate_arn" { type = string }
variable "api_host" { type = string }
variable "admin_host" { type = string }
variable "waf_rate_limit_per_5m" {
  type    = number
  default = 3000
}
variable "admin_allowed_cidrs" {
  type    = list(string)
  default = []
}
variable "access_logs_bucket" {
  type    = string
  default = null
}
variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "HTTPS from the internet"
  vpc_id      = var.vpc_id
  ingress {
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }
  ingress {
    from_port        = 80
    to_port          = 80
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = var.tags
}

resource "aws_lb" "this" {
  name                       = "${var.name}-alb"
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb.id]
  subnets                    = var.public_subnet_ids
  drop_invalid_header_fields = true
  # Socket.IO long-polling/WebSocket frames must outlive the default 60 s.
  idle_timeout = 300
  dynamic "access_logs" {
    for_each = var.access_logs_bucket == null ? [] : [var.access_logs_bucket]
    content {
      bucket  = access_logs.value
      enabled = true
      prefix  = var.name
    }
  }
  tags = var.tags
}

resource "aws_lb_target_group" "api" {
  name                 = "${var.name}-api"
  port                 = 3000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 30
  health_check {
    path                = "/health/ready"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
  # Socket.IO: keep a client on the task that opened its session.
  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400
    enabled         = true
  }
  tags = var.tags
}

resource "aws_lb_target_group" "admin" {
  name                 = "${var.name}-admin"
  port                 = 3001
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 30
  health_check {
    path                = "/login"
    matcher             = "200-399"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
  tags = var.tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "not found"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
  condition {
    host_header { values = [var.api_host] }
  }
}

resource "aws_lb_listener_rule" "admin" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 20
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.admin.arn
  }
  condition {
    host_header { values = [var.admin_host] }
  }
}

# --- WAF ----------------------------------------------------------------
resource "aws_wafv2_ip_set" "admin" {
  count              = length(var.admin_allowed_cidrs) > 0 ? 1 : 0
  name               = "${var.name}-admin-allow"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"
  addresses          = var.admin_allowed_cidrs
  tags               = var.tags
}

resource "aws_wafv2_web_acl" "this" {
  name  = "${var.name}-waf"
  scope = "REGIONAL"
  default_action {
    allow {}
  }

  # Security review: admin.<domain> only from the allow-list when one is set.
  dynamic "rule" {
    for_each = length(var.admin_allowed_cidrs) > 0 ? [1] : []
    content {
      name     = "admin-allow-list"
      priority = 0
      action {
        block {}
      }
      statement {
        and_statement {
          statement {
            byte_match_statement {
              search_string         = var.admin_host
              positional_constraint = "EXACTLY"
              field_to_match {
                single_header { name = "host" }
              }
              text_transformation {
                priority = 0
                type     = "LOWERCASE"
              }
            }
          }
          statement {
            not_statement {
              statement {
                ip_set_reference_statement { arn = aws_wafv2_ip_set.admin[0].arn }
              }
            }
          }
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name}-admin-allow-list"
        sampled_requests_enabled   = true
      }
    }
  }

  rule {
    name     = "rate-per-ip"
    priority = 1
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = var.waf_rate_limit_per_5m
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-rate-per-ip"
      sampled_requests_enabled   = true
    }
  }

  dynamic "rule" {
    for_each = {
      common     = { priority = 10, name = "AWSManagedRulesCommonRuleSet" }
      bad_inputs = { priority = 11, name = "AWSManagedRulesKnownBadInputsRuleSet" }
      ip_rep     = { priority = 12, name = "AWSManagedRulesAmazonIpReputationList" }
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
        metric_name                = "${var.name}-${rule.key}"
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name}-waf"
    sampled_requests_enabled   = true
  }
  tags = var.tags
}

resource "aws_wafv2_web_acl_association" "this" {
  resource_arn = aws_lb.this.arn
  web_acl_arn  = aws_wafv2_web_acl.this.arn
}

output "security_group_id" { value = aws_security_group.alb.id }
output "dns_name" { value = aws_lb.this.dns_name }
output "zone_id" { value = aws_lb.this.zone_id }
output "arn_suffix" { value = aws_lb.this.arn_suffix }
output "api_target_group_arn" { value = aws_lb_target_group.api.arn }
output "api_target_group_arn_suffix" { value = aws_lb_target_group.api.arn_suffix }
output "admin_target_group_arn" { value = aws_lb_target_group.admin.arn }
