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
# Scale audit 2026-10-23: one mobile-carrier (CGNAT) or office address carries
# thousands of people; 3000 / 5 min (10 per second) cut real users off the
# moment a city came online. Signed-in users are limited per account by the
# API itself (100 / min), so this edge rule only has to stop floods.
variable "waf_enabled" {
  type        = bool
  default     = true
  description = "Web application firewall in front of the load balancer (6 rules: rate limits, bad inputs, IP reputation, body size, admin allow-list). Default ON. Costs about $11/month plus $0.60 per million requests (us-east-1, 2026-10), billed per request, so a flood is billed too (the request-count alarm in modules/monitoring warns). false removes the ACL: the admin IP allow-list (admin_allowed_cidrs) and the OTP rate limit then do NOT apply."
}
variable "waf_rate_limit_per_5m" {
  type    = number
  default = 10000
}
variable "admin_allowed_cidrs" {
  type    = list(string)
  default = []
}
# Security research #5 (2026-10-22), A3.
variable "waf_otp_rate_limit_per_5m" {
  type        = number
  default     = 20
  description = "Code-sending paths, per IP only: the backstop for callers that send no device header. Raised from 20 (S4-8) because one CGNAT address carries many people; the per-(IP + device) rule waf_otp_rate_limit_per_device_per_5m stays tight at 20."
}
# S4-8 (audit 2026-10-25). Behind carrier CGNAT thousands of people share one
# address, so a plain per-IP limit either blocks a city (low) or stops nothing
# (high). The app sends X-Device-Id on every request; a rule that counts per
# (IP + device id) separates those people. AWS counts a request in a custom-key
# rule only when it carries ALL the keys, so a caller that omits the header
# escapes THAT rule and is caught only by the plain per-IP rules, which are
# therefore kept as a (higher) backstop. Accepted trade-off, documented in
# docs/runbooks/infra-hardening.md.
variable "waf_device_header" {
  type        = string
  default     = ""
  description = "Request header that identifies a device (x-device-id). Used as a second rate-limit key next to the IP; each per-device rule is a WAF rule at $1/month. Empty = no per-device rules (default)."
}
variable "waf_otp_rate_limit_per_device_per_5m" {
  type        = number
  default     = 20
  description = "Code-sending paths: calls per 5 minutes for one (IP + device)."
}
variable "waf_auth_rate_limit_per_5m" {
  type        = number
  default     = 300
  description = "Login paths (code check, password login, social, reset confirm): calls per 5 minutes for one IP (CGNAT-safe floor against credential stuffing)."
}
variable "waf_auth_refresh_limit_per_device_per_5m" {
  type        = number
  default     = 120
  description = "Token refresh: calls per 5 minutes for one (IP + device)."
}
variable "waf_auth_rules_enabled" {
  type        = bool
  default     = false
  description = "S4-8: add the login-path rate rule (and the refresh rule when waf_device_header is set); each is a WAF rule at $1/month. Off by default."
}
variable "waf_auth_rate_action" {
  type        = string
  default     = "count"
  description = "count (only measured, see the WAF metric) or block, for the login and refresh rules. Switch to block after a week of clean counts."
  validation {
    condition     = contains(["count", "block"], var.waf_auth_rate_action)
    error_message = "waf_auth_rate_action: count or block."
  }
}
variable "deletion_protection" {
  type        = bool
  default     = false
  description = "S4-10: AWS refuses to delete the load balancer (a wrong destroy or rename would remove the front door). Prod: true."
}
variable "load_balancing_algorithm" {
  type        = string
  default     = "round_robin"
  description = "S4-7: round_robin | least_outstanding_requests for the API target group. LOR is ignored while stickiness is on for that group."
  validation {
    condition     = contains(["round_robin", "least_outstanding_requests"], var.load_balancing_algorithm)
    error_message = "load_balancing_algorithm: round_robin or least_outstanding_requests."
  }
}
variable "slow_start_seconds" {
  type        = number
  default     = 90
  description = "S8-4: a new API task gets a growing share of traffic over this many seconds (30-900; 0 = off) instead of a full share at second 0. Ignored (AWS: not combinable) while the API group uses least_outstanding_requests. Cost: none; load: a scale-out adds capacity this much slower."
  validation {
    condition     = var.slow_start_seconds == 0 || (var.slow_start_seconds >= 30 && var.slow_start_seconds <= 900)
    error_message = "slow_start_seconds: 0 or 30..900."
  }
}
variable "ws_target_group_enabled" {
  type        = bool
  default     = false
  description = "S4-7: a second API target group only for /socket.io/* (sticky, 1 day) while the main API group drops stickiness and uses least_outstanding_requests. Needs the ECS service to register in both groups (replaces the service in the AWS provider: plan it in a quiet window)."
}
variable "waf_bot_control_enabled" {
  type    = bool
  default = false
}
variable "waf_bot_control_block" {
  type    = bool
  default = false
}
# The paths that send an SMS / e-mail or answer "is this number registered":
# the costly anonymous ones (docs/COST_PROTECTION.md §1).
locals {
  otp_paths = [
    "/api/v1/auth/otp/request",
    "/api/v1/auth/password/reset/request",
    "/api/v1/auth/phone/status",
    "/api/v1/auth/identifiers",
  ]
}
# S4-8: the login paths (a guess costs the attacker one request each).
locals {
  auth_login_paths = [
    "/api/v1/auth/otp/verify",
    "/api/v1/auth/login/continue",
    "/api/v1/auth/password/login",
    "/api/v1/auth/password/reset/confirm",
    "/api/v1/auth/social",
  ]
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
  enable_deletion_protection = var.deletion_protection
  # Socket.IO long-polling/WebSocket frames must outlive the default 60 s.
  # PAIRED VALUE: the API's Node keepAliveTimeout (apps/api/src/main.ts,
  # ALB_IDLE_TIMEOUT_S) must stay LONGER than this (currently 310 s vs 300 s),
  # or the ALB reuses sockets Node already closed and users get random 502s.
  # Change both together.
  # AWS:
  # https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html#connection-idle-timeout
  idle_timeout = 300
  dynamic "access_logs" {
    for_each = var.access_logs_bucket == null ? [] : [var.access_logs_bucket]
    content {
      bucket  = access_logs.value
      enabled = true
      prefix  = "alb"
    }
  }
  tags = var.tags
}

resource "aws_lb_target_group" "api" {
  name        = "${var.name}-api"
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id
  # Owner 2026-10-23: a stopping task is taken out of rotation at once but
  # keeps its open connections for this long while its sockets drain
  # (`server:going-away`); must be <= the container stopTimeout (60 s).
  deregistration_delay = 60
  # S8-4: ramp a new task up (AWS target-group attribute `slow_start.duration_seconds`;
  # cannot be used with least_outstanding_requests, so only for round robin).
  slow_start = (var.ws_target_group_enabled || var.load_balancing_algorithm == "least_outstanding_requests") ? 0 : var.slow_start_seconds
  # Liveness, not readiness: ECS replaces tasks the ALB marks unhealthy, so a
  # DB/Redis blip on /health/ready would kill every API task at once.
  health_check {
    path                = "/health/live"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
  # S4-7: with the separate websocket group the whole API group balances by
  # outstanding requests and has no affinity; otherwise (default, unchanged)
  # Socket.IO keeps a client on the task that opened its session.
  load_balancing_algorithm_type = var.ws_target_group_enabled ? "least_outstanding_requests" : var.load_balancing_algorithm
  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400
    enabled         = !var.ws_target_group_enabled
  }
  tags = var.tags
}

# S4-7: Socket.IO long-polling needs the same task for every request of a
# session; only these paths get the cookie. Websocket-only transport in the
# clients would remove even this (a later app change).
resource "aws_lb_target_group" "api_ws" {
  count                = var.ws_target_group_enabled ? 1 : 0
  name                 = "${var.name}-api-ws"
  port                 = 3000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 60
  health_check {
    path                = "/health/live"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400
    enabled         = true
  }
  tags = var.tags
}

resource "aws_lb_listener_rule" "api_ws" {
  count        = var.ws_target_group_enabled ? 1 : 0
  listener_arn = aws_lb_listener.https.arn
  priority     = 9
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api_ws[0].arn
  }
  condition {
    host_header { values = [var.api_host] }
  }
  condition {
    path_pattern { values = ["/socket.io/*", "/socket.io"] }
  }
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
  count = var.waf_enabled ? 1 : 0
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

  # Security research #5 (2026-10-22), A3: SMS pumping / code flooding is
  # stopped at the edge — one address may call the code-sending paths at
  # most `waf_otp_rate_limit_per_5m` times in 5 minutes (a person needs a
  # handful). The API keeps its own per-number / per-device limits.
  rule {
    name     = "otp-rate-per-ip"
    priority = 2
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = var.waf_otp_rate_limit_per_5m
        aggregate_key_type = "IP"
        scope_down_statement {
          or_statement {
            dynamic "statement" {
              for_each = local.otp_paths
              content {
                byte_match_statement {
                  search_string         = statement.value
                  positional_constraint = "EXACTLY"
                  field_to_match {
                    uri_path {}
                  }
                  text_transformation {
                    priority = 0
                    type     = "NONE"
                  }
                }
              }
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-otp-rate-per-ip"
      sampled_requests_enabled   = true
    }
  }

  # S4-8: second key for the code-sending paths. Counts per (IP + device
  # header); requests without the header are not counted here (see variable).
  dynamic "rule" {
    for_each = var.waf_device_header != "" ? [1] : []
    content {
      name     = "otp-rate-per-ip-device"
      priority = 4
      action {
        block {}
      }
      statement {
        rate_based_statement {
          limit              = var.waf_otp_rate_limit_per_device_per_5m
          aggregate_key_type = "CUSTOM_KEYS"
          custom_key {
            ip {}
          }
          custom_key {
            header {
              name = var.waf_device_header
              text_transformation {
                priority = 0
                type     = "NONE"
              }
            }
          }
          scope_down_statement {
            or_statement {
              dynamic "statement" {
                for_each = local.otp_paths
                content {
                  byte_match_statement {
                    search_string         = statement.value
                    positional_constraint = "EXACTLY"
                    field_to_match {
                      uri_path {}
                    }
                    text_transformation {
                      priority = 0
                      type     = "NONE"
                    }
                  }
                }
              }
            }
          }
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name}-otp-rate-per-ip-device"
        sampled_requests_enabled   = true
      }
    }
  }

  # S4-8: floor under credential stuffing on the login paths (per IP, wide
  # enough for a CGNAT city), and a per-(IP + device) limit on token refresh.
  # count first, block when the metric has been quiet for a week.
  dynamic "rule" {
    for_each = var.waf_auth_rules_enabled ? [1] : []
    content {
      name     = "auth-login-rate-per-ip"
      priority = 5
      action {
        dynamic "count" {
          for_each = var.waf_auth_rate_action == "count" ? [1] : []
          content {}
        }
        dynamic "block" {
          for_each = var.waf_auth_rate_action == "block" ? [1] : []
          content {}
        }
      }
      statement {
        rate_based_statement {
          limit              = var.waf_auth_rate_limit_per_5m
          aggregate_key_type = "IP"
          scope_down_statement {
            or_statement {
              dynamic "statement" {
                for_each = local.auth_login_paths
                content {
                  byte_match_statement {
                    search_string         = statement.value
                    positional_constraint = "EXACTLY"
                    field_to_match {
                      uri_path {}
                    }
                    text_transformation {
                      priority = 0
                      type     = "NONE"
                    }
                  }
                }
              }
            }
          }
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name}-auth-login-rate-per-ip"
        sampled_requests_enabled   = true
      }
    }
  }

  dynamic "rule" {
    for_each = var.waf_device_header != "" && var.waf_auth_rules_enabled ? [1] : []
    content {
      name     = "auth-refresh-rate-per-device"
      priority = 6
      action {
        dynamic "count" {
          for_each = var.waf_auth_rate_action == "count" ? [1] : []
          content {}
        }
        dynamic "block" {
          for_each = var.waf_auth_rate_action == "block" ? [1] : []
          content {}
        }
      }
      statement {
        rate_based_statement {
          limit              = var.waf_auth_refresh_limit_per_device_per_5m
          aggregate_key_type = "CUSTOM_KEYS"
          custom_key {
            ip {}
          }
          custom_key {
            header {
              name = var.waf_device_header
              text_transformation {
                priority = 0
                type     = "NONE"
              }
            }
          }
          scope_down_statement {
            byte_match_statement {
              search_string         = "/api/v1/auth/refresh"
              positional_constraint = "EXACTLY"
              field_to_match {
                uri_path {}
              }
              text_transformation {
                priority = 0
                type     = "NONE"
              }
            }
          }
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name}-auth-refresh-rate-per-device"
        sampled_requests_enabled   = true
      }
    }
  }

  # AWS Bot Control (common level), paid — off unless the owner turns it
  # on; then COUNT only until `waf_bot_control_block` (the labels show up in
  # the WAF metrics first, so a legitimate client is never cut off blind).
  dynamic "rule" {
    for_each = var.waf_bot_control_enabled ? [1] : []
    content {
      name     = "bot-control"
      priority = 3
      override_action {
        dynamic "none" {
          for_each = var.waf_bot_control_block ? [1] : []
          content {}
        }
        dynamic "count" {
          for_each = var.waf_bot_control_block ? [] : [1]
          content {}
        }
      }
      statement {
        managed_rule_group_statement {
          name        = "AWSManagedRulesBotControlRuleSet"
          vendor_name = "AWS"
          managed_rule_group_configs {
            aws_managed_rules_bot_control_rule_set {
              inspection_level = "COMMON"
            }
          }
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name}-bot-control"
        sampled_requests_enabled   = true
      }
    }
  }

  dynamic "rule" {
    for_each = {
      # SizeRestrictions_BODY only counts (labels) here; the rule
      # "body-size" below blocks on that label outside the exempt paths.
      common     = { priority = 10, name = "AWSManagedRulesCommonRuleSet", count_rules = ["SizeRestrictions_BODY"] }
      bad_inputs = { priority = 11, name = "AWSManagedRulesKnownBadInputsRuleSet", count_rules = [] }
      ip_rep     = { priority = 12, name = "AWSManagedRulesAmazonIpReputationList", count_rules = [] }
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
          dynamic "rule_action_override" {
            for_each = rule.value.count_rules
            content {
              name = rule_action_override.value
              action_to_use {
                count {}
              }
            }
          }
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name}-${rule.key}"
        sampled_requests_enabled   = true
      }
    }
  }

  # Bodies over 8 KB stay blocked except where they are expected (owner
  # 2026-10-07): the admin panel (xlsx/csv imports, long legal texts; its
  # server calls the API under /api/v1/admin/) and Stripe webhooks, whose
  # events often exceed 8 KB. Owner 2026-10-22: also the phone book upload
  # (POST /api/v1/contacts/sync, the whole book in one request: ~67 bytes a
  # number, the API caps it at 1 MB / 10 000 hashes) and crash reports
  # (/api/v1/crash-reports, a stack trace is easily over 8 KB). Those paths
  # are authenticated, signed or capped by the API itself; the API's own body
  # limit (BODY_LIMIT_KB, 256 KB) still guards every other route.
  rule {
    name     = "body-size"
    priority = 13
    action {
      block {}
    }
    statement {
      and_statement {
        statement {
          label_match_statement {
            scope = "LABEL"
            key   = "awswaf:managed:aws:core-rule-set:SizeRestrictions_Body"
          }
        }
        statement {
          not_statement {
            statement {
              or_statement {
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
                  byte_match_statement {
                    search_string         = "/api/v1/admin/"
                    positional_constraint = "STARTS_WITH"
                    field_to_match {
                      uri_path {}
                    }
                    text_transformation {
                      priority = 0
                      type     = "NONE"
                    }
                  }
                }
                statement {
                  byte_match_statement {
                    search_string         = "/api/v1/webhooks/stripe"
                    positional_constraint = "STARTS_WITH"
                    field_to_match {
                      uri_path {}
                    }
                    text_transformation {
                      priority = 0
                      type     = "NONE"
                    }
                  }
                }
                statement {
                  byte_match_statement {
                    search_string         = "/api/v1/contacts/sync"
                    positional_constraint = "EXACTLY"
                    field_to_match {
                      uri_path {}
                    }
                    text_transformation {
                      priority = 0
                      type     = "NONE"
                    }
                  }
                }
                statement {
                  byte_match_statement {
                    search_string         = "/api/v1/crash-reports"
                    positional_constraint = "STARTS_WITH"
                    field_to_match {
                      uri_path {}
                    }
                    text_transformation {
                      priority = 0
                      type     = "NONE"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-body-size"
      sampled_requests_enabled   = true
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
  count        = var.waf_enabled ? 1 : 0
  resource_arn = aws_lb.this.arn
  web_acl_arn  = aws_wafv2_web_acl.this[0].arn
}

# The ACL and its association gained `count` (waf_enabled): keep the existing
# ones, do not recreate them.
moved {
  from = aws_wafv2_web_acl.this
  to   = aws_wafv2_web_acl.this[0]
}
moved {
  from = aws_wafv2_web_acl_association.this
  to   = aws_wafv2_web_acl_association.this[0]
}

output "waf_acl_name" { value = var.waf_enabled ? "${var.name}-waf" : "" }

output "security_group_id" { value = aws_security_group.alb.id }
output "dns_name" { value = aws_lb.this.dns_name }
output "zone_id" { value = aws_lb.this.zone_id }
output "arn_suffix" { value = aws_lb.this.arn_suffix }
output "api_target_group_arn" { value = aws_lb_target_group.api.arn }
output "api_ws_target_group_arn" { value = var.ws_target_group_enabled ? aws_lb_target_group.api_ws[0].arn : "" }
output "api_target_group_arn_suffix" { value = aws_lb_target_group.api.arn_suffix }
output "admin_target_group_arn" { value = aws_lb_target_group.admin.arn }
output "admin_target_group_arn_suffix" { value = aws_lb_target_group.admin.arn_suffix }
