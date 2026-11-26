# docs/06 §4.3 / §6.2 — application secrets live in Secrets Manager (KMS),
# never in images, task definitions or the repository. Terraform creates
# the secrets; the VALUES are set out of band (console/CLI by the owner,
# see infra/README.md), so a `terraform apply` never carries a secret.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.72" }
  }
}

variable "name" { type = string }
variable "kms_key_arn" { type = string }
variable "names" {
  type        = list(string)
  description = "Env var names stored as individual secrets (docs/01 env schema)."
}
variable "recovery_window_in_days" {
  type        = number
  default     = 30
  description = "Days a deleted secret can be restored. 0 = deleted at once (throw-away load-test stacks, so the same name can be created again)."
}
variable "tags" {
  type    = map(string)
  default = {}
}
# Stage 2 SRE (Б8, AWS Well-Architected REL13-BP02 backup & restore): a copy of
# every secret in the disaster-recovery region, kept in sync by Secrets Manager
# itself ("Replicate an AWS Secrets Manager secret to other AWS Regions",
# docs.aws.amazon.com/secretsmanager/latest/userguide/create-manage-multi-region-secrets.html).
# A lost main region then still has the keys the stack in envs/dr needs
# (JWT_KEYS, MESSAGE_ENC_KEYS: without them old chats cannot be read).
# Cost: $0.40 per replica per month.
variable "replica_region" {
  type        = string
  default     = ""
  description = "Region of the replica of every secret (e.g. us-west-2). Empty = no replica."
}
variable "replica_kms_key_arn" {
  type        = string
  default     = null
  description = "Customer key in replica_region for the replicas (null = the AWS-managed aws/secretsmanager key of that region)."
}

resource "aws_secretsmanager_secret" "this" {
  for_each                = toset(var.names)
  name                    = "${var.name}/${each.key}"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = var.tags

  dynamic "replica" {
    for_each = var.replica_region == "" ? [] : [var.replica_region]
    content {
      region     = replica.value
      kms_key_id = var.replica_kms_key_arn
    }
  }
}

output "arns" {
  value = { for k, s in aws_secretsmanager_secret.this : k => s.arn }
}

output "replica_region" { value = var.replica_region }
