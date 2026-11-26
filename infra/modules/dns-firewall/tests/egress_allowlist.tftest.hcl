# S10: DNS Firewall for the app VPC. Mock providers, no AWS.
#   terraform -chdir=infra/modules/dns-firewall init -backend=false
#   terraform -chdir=infra/modules/dns-firewall test

mock_provider "aws" {
  override_during = plan
}

variables {
  name   = "lawbid-prod"
  vpc_id = "vpc-0123456789abcdef0"
}

run "off_by_default" {
  command = plan
  assert {
    condition     = length(aws_route53_resolver_firewall_rule_group.egress) == 0 && length(aws_route53_resolver_firewall_rule_group_association.vpc) == 0
    error_message = "nothing is created unless enabled = true"
  }
  assert {
    condition     = length(aws_route53_resolver_query_log_config.vpc) == 0 && length(aws_cloudwatch_log_group.queries) == 0
    error_message = "no query log when off"
  }
  assert {
    condition     = length(aws_cloudwatch_log_metric_filter.unknown_domains) == 0
    error_message = "no metric filter when off"
  }
}

run "alert_mode_allowlist" {
  command = plan
  variables {
    enabled = true
  }
  assert {
    condition     = aws_route53_resolver_firewall_rule.allow_known[0].action == "ALLOW" && aws_route53_resolver_firewall_rule.allow_known[0].priority < aws_route53_resolver_firewall_rule.everything_else[0].priority
    error_message = "the allowlist is checked before the catch-all rule"
  }
  assert {
    condition     = aws_route53_resolver_firewall_rule.everything_else[0].action == "ALERT" && aws_route53_resolver_firewall_rule.everything_else[0].block_response == null
    error_message = "the default mode only logs (ALERT), it never blocks"
  }
  assert {
    condition     = aws_route53_resolver_firewall_domain_list.everything[0].domains == toset(["*"])
    error_message = "the catch-all list matches every domain"
  }
  assert {
    condition     = alltrue([for d in ["amazonaws.com", "*.amazonaws.com", "*.internal", "*.stripe.com", "*.twilio.com", "*.bunny.net", "*.cloudflarestorage.com", "*.sentry.io", "*.googleapis.com", "*.apple.com", "*.withpersona.com", "*.floridabar.org"] : contains(aws_route53_resolver_firewall_domain_list.allowed[0].domains, d)])
    error_message = "AWS, VPC names and the providers the API calls are allowed"
  }
  assert {
    condition     = aws_route53_resolver_firewall_config.vpc[0].firewall_fail_open == "ENABLED"
    error_message = "fail-open: a DNS Firewall outage must not take the app down"
  }
  assert {
    condition     = aws_route53_resolver_firewall_rule_group_association.vpc[0].vpc_id == "vpc-0123456789abcdef0" && aws_route53_resolver_firewall_rule_group_association.vpc[0].priority == 101
    error_message = "the rule group is linked to the app VPC"
  }
  assert {
    condition     = aws_route53_resolver_query_log_config_association.vpc[0].resource_id == "vpc-0123456789abcdef0"
    error_message = "ALERT hits are visible: the query log covers the VPC"
  }
  assert {
    condition     = aws_cloudwatch_log_metric_filter.unknown_domains[0].metric_transformation[0].namespace == "LawBid/DnsFirewall" && aws_cloudwatch_log_metric_filter.unknown_domains[0].metric_transformation[0].name == "UnknownDomainQueries" && aws_cloudwatch_log_metric_filter.unknown_domains[0].metric_transformation[0].dimensions["Domain"] == "$.query_name"
    error_message = "the admin counts unknown domains from one metric per domain (namespace and name are read by the API)"
  }
  assert {
    condition     = strcontains(aws_cloudwatch_log_metric_filter.unknown_domains[0].pattern, "ALERT") && strcontains(aws_cloudwatch_log_metric_filter.unknown_domains[0].pattern, "BLOCK")
    error_message = "both ALERT and BLOCK hits are counted"
  }
}

run "block_mode" {
  command = plan
  variables {
    enabled = true
    mode    = "BLOCK"
  }
  assert {
    condition     = aws_route53_resolver_firewall_rule.everything_else[0].action == "BLOCK" && aws_route53_resolver_firewall_rule.everything_else[0].block_response == "NODATA"
    error_message = "BLOCK answers NODATA for unknown domains"
  }
}

run "bad_mode_rejected" {
  command = plan
  variables {
    enabled = true
    mode    = "DROP"
  }
  expect_failures = [var.mode]
}
