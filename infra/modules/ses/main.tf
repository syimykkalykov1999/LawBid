# docs/06 §6.1 — Amazon SES: verified sending domain with DKIM, custom
# MAIL FROM (SPF alignment), DMARC record. Route 53 records are created
# when a hosted zone id is given; otherwise the outputs list what to add
# at the registrar.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "domain" { type = string }
variable "hosted_zone_id" {
  type    = string
  default = null
}
variable "dmarc_rua" {
  type        = string
  description = "Mailbox for DMARC aggregate reports, e.g. dmarc@lawbid.app"
}
variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_ses_domain_identity" "this" {
  domain = var.domain
}

resource "aws_ses_domain_dkim" "this" {
  domain = aws_ses_domain_identity.this.domain
}

resource "aws_ses_domain_mail_from" "this" {
  domain           = aws_ses_domain_identity.this.domain
  mail_from_domain = "mail.${var.domain}"
}

resource "aws_ses_configuration_set" "this" {
  name = replace("${var.domain}-default", ".", "-")
  delivery_options { tls_policy = "Require" }
  reputation_metrics_enabled = true
}

data "aws_region" "current" {}

locals {
  dns = var.hosted_zone_id == null ? {} : {
    verification  = { name = "_amazonses.${var.domain}", type = "TXT", records = [aws_ses_domain_identity.this.verification_token] }
    mail_from_mx  = { name = "mail.${var.domain}", type = "MX", records = ["10 feedback-smtp.${data.aws_region.current.name}.amazonses.com"] }
    mail_from_spf = { name = "mail.${var.domain}", type = "TXT", records = ["v=spf1 include:amazonses.com -all"] }
    dmarc         = { name = "_dmarc.${var.domain}", type = "TXT", records = ["v=DMARC1; p=quarantine; rua=mailto:${var.dmarc_rua}; adkim=s; aspf=s"] }
  }
}

resource "aws_route53_record" "dns" {
  for_each = local.dns
  zone_id  = var.hosted_zone_id
  name     = each.value.name
  type     = each.value.type
  ttl      = 600
  records  = each.value.records
}

resource "aws_route53_record" "dkim" {
  count   = var.hosted_zone_id == null ? 0 : 3
  zone_id = var.hosted_zone_id
  name    = "${aws_ses_domain_dkim.this.dkim_tokens[count.index]}._domainkey.${var.domain}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.this.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

output "identity_arn" { value = aws_ses_domain_identity.this.arn }
output "configuration_set" { value = aws_ses_configuration_set.this.name }
output "dkim_tokens" { value = aws_ses_domain_dkim.this.dkim_tokens }
output "verification_token" { value = aws_ses_domain_identity.this.verification_token }
