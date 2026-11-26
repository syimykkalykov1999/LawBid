# S10 (SECOND_PASS_2026-11-26, ASVS 5.0 V13.2.4/V13.2.5, AWS WA SEC05-BP02):
# outbound allowlist for the app VPC at the DNS level, with the AWS-managed
# Route 53 Resolver DNS Firewall. The pattern is the one AWS documents for an
# allowlist ("DNS Firewall rule groups and rules", Route 53 Developer Guide):
# rule 1 ALLOW our domain list, rule 2 match every domain ("*") with ALERT
# first, BLOCK later. ALERT changes nothing for the app: the query is answered
# as usual and only written to the Resolver query log, so the owner can see in
# CloudWatch Logs which domains would be blocked.
#
#   https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-dns-firewall-rule-groups.html
#   https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-dns-firewall-vpc-configuration.html
#
# Fail-open: if DNS Firewall itself cannot answer, queries go through
# (firewall_fail_open = ENABLED): the app staying up wins over the filter.
# Off by default (enabled = false); prod switches it on in terraform.tfvars.
# Runbook: docs/runbooks/dns-firewall.md.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.72" }
  }
}

variable "name" { type = string }
variable "vpc_id" { type = string }
variable "enabled" {
  type        = bool
  default     = false
  description = "Create the DNS Firewall for the VPC (ALERT mode by default)."
}
variable "mode" {
  type        = string
  default     = "ALERT"
  description = "What happens to a domain outside the allowlist: ALERT (log only) or BLOCK (answer NODATA)."
  validation {
    condition     = contains(["ALERT", "BLOCK"], var.mode)
    error_message = "mode must be ALERT or BLOCK."
  }
}
variable "extra_allowed_domains" {
  type        = list(string)
  default     = []
  description = "More domains to allow (each as example.com and/or *.example.com)."
}
variable "log_retention_days" {
  type    = number
  default = 30
}
variable "tags" {
  type    = map(string)
  default = {}
}

locals {
  on = var.enabled ? 1 : 0

  # Read by the admin (apps/api/src/modules/admin-security/bot-protection.service.ts).
  metric_namespace = "LawBid/DnsFirewall"
  unknown_metric   = "UnknownDomainQueries"

  # Registrable domains the API and worker call (grep of apps/api/src for
  # external hosts on 26.11, plus docs/security/ASVS_DOCUMENTATION.md part 7).
  # Each becomes d and *.d. Documentation links that the code only prints
  # are not here: ALERT mode shows anything that was missed.
  base_domains = [
    # AWS (SDK endpoints, ECS agent, ECR, CloudWatch, S3, SES, KMS, OpenSearch)
    "amazonaws.com", "api.aws",
    # inside the VPC (EC2 names, the Cloud Map namespace of the pooler NAME.internal)
    "internal",
    # own domains
    "lawbid.app", "lawbid.dev",
    # payments, codes, identity
    "stripe.com", "twilio.com", "withpersona.com", "surepass.io", "microbilt.com",
    # media, calls, bot check
    "cloudflare.com", "cloudflarestorage.com", "bunny.net", "bunnycdn.com", "b-cdn.net", "livekit.cloud",
    # sign-in keys, pushes, translation, places
    "googleapis.com", "google.com", "apple.com",
    # Microsoft sign-in / calendar, content moderation
    "microsoft.com", "microsoftonline.com", "live.com", "microsoftmoderator.com",
    # AI assistants
    "openai.com", "anthropic.com",
    # errors, alerts, breached passwords, child-safety reports
    "sentry.io", "pagerduty.com", "slack.com", "pwnedpasswords.com", "cybertip.org",
    # admin launch checks read the repository API (infra-github.client.ts)
    "github.com", "githubusercontent.com",
    # bar and court registries (attorney licence checks, all states)
    "adbmich.org", "alabar.org", "alaskabar.org", "arcourts.gov", "arkansas.gov", "azbar.org",
    "ca.gov", "coloradolegalregulation.com", "ct.gov", "dcbar.org", "doelegal.com", "dsba.org",
    "floridabar.org", "gaappeals.us", "gabar.org", "hsba.org", "iacourtcommissions.org",
    "iardc.org", "idaho.gov", "in.gov", "iowacourts.gov", "justia.com", "kscourts.gov",
    "kybar.org", "lsba.org", "maine.gov", "mass.gov", "massbbo.org", "mdcourts.gov",
    "mebaroverseers.org", "michbar.org", "mn.gov", "mo.gov", "mobar.org", "montanabar.org",
    "ms.gov", "ncbar.gov", "ndcourts.gov", "nebar.com", "nebraska.gov", "nh.gov", "nhbar.org",
    "njcourts.gov", "nvbar.org", "ny.gov", "ohio.gov", "okbar.org", "osbar.org",
    "padisciplinaryboard.org", "ri.gov", "ribar.com", "sbnm.org", "scbar.org", "sccourts.org",
    "sd.gov", "state.mn.us", "state.ny.us", "statebarofsouthdakota.com", "tbpr.org",
    "texasbar.com", "uscourts.gov", "utahbar.org", "vermontjudiciary.org", "vsb.org",
    "wicourts.gov", "wisbar.org", "wsba.org", "mywsba.org", "wvbar.org", "wyomingbar.org",
  ]

  allowed_domains = distinct(concat(
    flatten([for d in local.base_domains : [d, "*.${d}"]]),
    var.extra_allowed_domains,
  ))
}

resource "aws_route53_resolver_firewall_domain_list" "allowed" {
  count   = local.on
  name    = "${var.name}-egress-allowed"
  domains = local.allowed_domains
  tags    = var.tags
}

resource "aws_route53_resolver_firewall_domain_list" "everything" {
  count   = local.on
  name    = "${var.name}-egress-everything"
  domains = ["*"]
  tags    = var.tags
}

resource "aws_route53_resolver_firewall_rule_group" "egress" {
  count = local.on
  name  = "${var.name}-egress"
  tags  = var.tags
}

resource "aws_route53_resolver_firewall_rule" "allow_known" {
  count                   = local.on
  name                    = "allow-known-domains"
  action                  = "ALLOW"
  firewall_domain_list_id = aws_route53_resolver_firewall_domain_list.allowed[0].id
  firewall_rule_group_id  = aws_route53_resolver_firewall_rule_group.egress[0].id
  priority                = 100
}

resource "aws_route53_resolver_firewall_rule" "everything_else" {
  count                   = local.on
  name                    = "everything-else"
  action                  = var.mode
  block_response          = var.mode == "BLOCK" ? "NODATA" : null
  firewall_domain_list_id = aws_route53_resolver_firewall_domain_list.everything[0].id
  firewall_rule_group_id  = aws_route53_resolver_firewall_rule_group.egress[0].id
  priority                = 200
}

resource "aws_route53_resolver_firewall_rule_group_association" "vpc" {
  count                  = local.on
  name                   = "${var.name}-egress"
  firewall_rule_group_id = aws_route53_resolver_firewall_rule_group.egress[0].id
  vpc_id                 = var.vpc_id
  # 101-9899 are for customer rule groups (100 and 9900+ belong to Firewall
  # Manager, Route 53 API reference AssociateFirewallRuleGroup).
  priority            = 101
  mutation_protection = "DISABLED"
  tags                = var.tags
}

resource "aws_route53_resolver_firewall_config" "vpc" {
  count              = local.on
  resource_id        = var.vpc_id
  firewall_fail_open = "ENABLED"
}

# ALERT hits are visible only in the Resolver query log: log the queries of the
# VPC to CloudWatch Logs (Route 53 does not charge for query logs, CloudWatch
# ingestion and storage do).
resource "aws_cloudwatch_log_group" "queries" {
  count             = local.on
  name              = "/aws/route53resolver/${var.name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_route53_resolver_query_log_config" "vpc" {
  count           = local.on
  name            = "${var.name}-queries"
  destination_arn = aws_cloudwatch_log_group.queries[0].arn
  tags            = var.tags
}

resource "aws_route53_resolver_query_log_config_association" "vpc" {
  count                        = local.on
  resolver_query_log_config_id = aws_route53_resolver_query_log_config.vpc[0].id
  resource_id                  = var.vpc_id
}

# 26.11 (owner: admin row «ALERT/BLOCK, сколько чужих адресов»): one CloudWatch
# metric per unknown domain, counted from the query log by a metric filter
# (CloudWatch Logs "Creating metrics from log events using a filter", JSON
# selectors + dimensions). The admin lists the metrics of this namespace
# (cloudwatch:ListMetrics) to show how many and which domains were outside the
# allowlist in the last two weeks; nothing is read from the log itself. A
# metric filter with dimensions is switched off by CloudWatch itself when it
# would make more than 1000 dimension values an hour, so a flood of random
# names cannot run up the metric bill.
resource "aws_cloudwatch_log_metric_filter" "unknown_domains" {
  count          = local.on
  name           = "${var.name}-dns-unknown-domains"
  log_group_name = aws_cloudwatch_log_group.queries[0].name
  pattern        = "{ ($.firewall_rule_action = \"ALERT\") || ($.firewall_rule_action = \"BLOCK\") }"
  metric_transformation {
    name       = local.unknown_metric
    namespace  = local.metric_namespace
    value      = "1"
    unit       = "Count"
    dimensions = { Domain = "$.query_name" }
  }
}

output "rule_group_id" {
  value = one(aws_route53_resolver_firewall_rule_group.egress[*].id)
}
output "query_log_group" {
  value = one(aws_cloudwatch_log_group.queries[*].name)
}
output "allowed_domain_count" {
  value = length(local.allowed_domains)
}
output "metric_namespace" {
  value = local.metric_namespace
}
