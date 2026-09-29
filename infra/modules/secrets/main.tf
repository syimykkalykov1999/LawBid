# docs/06 §4.3 / §6.2 — application secrets live in Secrets Manager (KMS),
# never in images, task definitions or the repository. Terraform creates
# the secrets; the VALUES are set out of band (console/CLI by the owner,
# see infra/README.md), so a `terraform apply` never carries a secret.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "name" { type = string }
variable "kms_key_arn" { type = string }
variable "names" {
  type        = list(string)
  description = "Env var names stored as individual secrets (docs/01 env schema)."
}
variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_secretsmanager_secret" "this" {
  for_each   = toset(var.names)
  name       = "${var.name}/${each.key}"
  kms_key_id = var.kms_key_arn
  tags       = var.tags
}

output "arns" {
  value = { for k, s in aws_secretsmanager_secret.this : k => s.arn }
}
