# docs/06 §6.1 — ElastiCache for Redis: replication group, multi-AZ with
# automatic failover, TLS in transit, encryption at rest (KMS), AUTH token
# stored in Secrets Manager. Redis holds cache/queues/rate limits/realtime
# adapter state only (§6.4: not a source of truth).
terraform {
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.60" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

variable "name" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "allowed_security_group_ids" { type = list(string) }
variable "node_type" {
  type    = string
  default = "cache.t4g.medium"
}
variable "replicas" {
  type    = number
  default = 1
}
variable "kms_key_arn" { type = string }
variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_elasticache_subnet_group" "this" {
  name       = "${var.name}-redis"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

resource "aws_security_group" "redis" {
  name        = "${var.name}-redis"
  description = "Redis from the ECS tasks only"
  vpc_id      = var.vpc_id
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = var.tags
}

resource "random_password" "auth" {
  length  = 48
  special = false
}

resource "aws_elasticache_parameter_group" "this" {
  name   = "${var.name}-redis7"
  family = "redis7"
  # BullMQ requires noeviction (a dropped job key corrupts a queue); caches
  # carry their own TTLs, so memory pressure shows up as the redis-memory
  # alarm instead of silent data loss.
  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }
  tags = var.tags
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id       = "${var.name}-redis"
  description                = "${var.name} cache, queues, rate limits, realtime"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.node_type
  num_cache_clusters         = 1 + var.replicas
  automatic_failover_enabled = var.replicas > 0
  multi_az_enabled           = var.replicas > 0
  parameter_group_name       = aws_elasticache_parameter_group.this.name
  subnet_group_name          = aws_elasticache_subnet_group.this.name
  security_group_ids         = [aws_security_group.redis.id]
  port                       = 6379
  at_rest_encryption_enabled = true
  kms_key_id                 = var.kms_key_arn
  transit_encryption_enabled = true
  auth_token                 = random_password.auth.result
  auth_token_update_strategy = "ROTATE"
  apply_immediately          = false
  maintenance_window         = "sun:05:00-sun:06:00"
  snapshot_retention_limit   = 1
  tags                       = var.tags
}

resource "aws_secretsmanager_secret" "redis_url" {
  name       = "${var.name}/REDIS_URL"
  kms_key_id = var.kms_key_arn
  tags       = var.tags
}

resource "aws_secretsmanager_secret_version" "redis_url" {
  secret_id     = aws_secretsmanager_secret.redis_url.id
  secret_string = "rediss://:${random_password.auth.result}@${aws_elasticache_replication_group.this.primary_endpoint_address}:6379"
}

output "security_group_id" { value = aws_security_group.redis.id }
output "primary_endpoint" { value = aws_elasticache_replication_group.this.primary_endpoint_address }
output "redis_url_secret_arn" { value = aws_secretsmanager_secret.redis_url.arn }
