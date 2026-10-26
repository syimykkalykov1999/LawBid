# N-11 (2026-10-26): Amazon OpenSearch Serverless collection for the search
# engine, an ALTERNATIVE to the provisioned domain in modules/growth. Created
# only when growth.opensearch_serverless_enabled = true (default false; never
# applied by a helper). The app signs requests with SigV4 (service `aoss`)
# using the ECS task role and picks this endpoint when the admin sets
# `search.engine_kind = serverless`.
#
# Стоимость (AWS pricing page, https://aws.amazon.com/opensearch-service/pricing/,
# checked 2026-10-26; us-east-1 about $0.24 per OCU-hour):
#   - Classic search collection: at least 2 OCU (1 indexing + 1 search, each
#     0.5 x 2 nodes for availability) = 2 x 0.24 x 730 = about $350 a month
#     even with no traffic.
#   - dev_test_standby = false removes the standby nodes: 0.5 + 0.5 OCU =
#     about $175 a month, no failover (staging only).
#   - Compare: provisioned domain t3.small.search + 20 GB gp3 = about $28.
# Serverless is cheaper than a domain only when the domain would have to be
# several nodes (roughly above the load a 3 x m6g.large domain, about $280,
# carries) or when nobody wants to size, patch and resize nodes. For launch
# keep the domain.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "name" { type = string }
variable "tags" {
  type    = map(string)
  default = {}
}
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "tasks_security_group_id" { type = string }
variable "kms_key_arn" {
  type        = string
  default     = ""
  description = "Customer KMS key; empty = AWS-owned key."
}
variable "task_role_arn" {
  type        = string
  description = "ECS task role of the API and the workers (gets data access)."
}
variable "standby_replicas" {
  type        = bool
  default     = true
  description = "false = no standby nodes (half the minimum price, no failover): staging only."
}

locals {
  # Collection names: 3-32 chars, lowercase letters, digits, hyphens.
  collection = substr(replace(lower("${var.name}-search"), "/[^a-z0-9-]/", "-"), 0, 32)
}

resource "aws_security_group" "endpoint" {
  name        = "${var.name}-aoss"
  description = "OpenSearch Serverless endpoint from the ECS tasks only"
  vpc_id      = var.vpc_id
  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [var.tasks_security_group_id]
  }
  tags = var.tags
}

resource "aws_opensearchserverless_vpc_endpoint" "this" {
  name               = local.collection
  vpc_id             = var.vpc_id
  subnet_ids         = var.private_subnet_ids
  security_group_ids = [aws_security_group.endpoint.id]
}

resource "aws_opensearchserverless_security_policy" "encryption" {
  name = "${local.collection}-enc"
  type = "encryption"
  policy = jsonencode({
    Rules       = [{ ResourceType = "collection", Resource = ["collection/${local.collection}"] }]
    AWSOwnedKey = var.kms_key_arn == ""
    KmsARN      = var.kms_key_arn == "" ? null : var.kms_key_arn
  })
}

# Private: only through the VPC endpoint above.
resource "aws_opensearchserverless_security_policy" "network" {
  name = "${local.collection}-net"
  type = "network"
  policy = jsonencode([{
    Rules = [
      { ResourceType = "collection", Resource = ["collection/${local.collection}"] },
      { ResourceType = "dashboard", Resource = ["collection/${local.collection}"] },
    ]
    AllowFromPublic = false
    SourceVPCEs     = [aws_opensearchserverless_vpc_endpoint.this.id]
  }])
}

resource "aws_opensearchserverless_collection" "search" {
  name             = local.collection
  type             = "SEARCH"
  description      = "LawBid search engine (alternative to the provisioned domain)"
  standby_replicas = var.standby_replicas ? "ENABLED" : "DISABLED"
  tags             = var.tags
  depends_on       = [aws_opensearchserverless_security_policy.encryption, aws_opensearchserverless_security_policy.network]
}

resource "aws_opensearchserverless_access_policy" "app" {
  name = "${local.collection}-app"
  type = "data"
  policy = jsonencode([{
    Rules = [
      {
        ResourceType = "collection"
        Resource     = ["collection/${local.collection}"]
        Permission   = ["aoss:DescribeCollectionItems", "aoss:CreateCollectionItems", "aoss:UpdateCollectionItems"]
      },
      {
        ResourceType = "index"
        Resource     = ["index/${local.collection}/*"]
        Permission = [
          "aoss:CreateIndex", "aoss:DeleteIndex", "aoss:UpdateIndex", "aoss:DescribeIndex",
          "aoss:ReadDocument", "aoss:WriteDocument",
        ]
      },
    ]
    Principal = [var.task_role_arn]
  }])
}

# Identity side: the task role may call the collection's data API.
resource "aws_iam_role_policy" "task_aoss" {
  name = "${local.collection}-aoss"
  role = element(split("/", var.task_role_arn), length(split("/", var.task_role_arn)) - 1)
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "aoss:APIAccessAll"
      Resource = aws_opensearchserverless_collection.search.arn
    }]
  })
}

output "endpoint" { value = aws_opensearchserverless_collection.search.collection_endpoint }
output "collection_arn" { value = aws_opensearchserverless_collection.search.arn }
