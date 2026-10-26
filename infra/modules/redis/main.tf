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
  type        = number
  default     = 1
  description = "Read replicas. 0 = one node (restart = a few minutes of downtime). 1 = Multi-AZ with automatic failover to the replica in the other AZ, usually under 1-2 minutes (docs/runbooks/redis.md «Отказоустойчивость»)."
  validation {
    condition     = var.replicas >= 0 && var.replicas <= 5
    error_message = "replicas must be 0..5."
  }
}
variable "kms_key_arn" { type = string }
variable "maxmemory_policy" {
  type        = string
  default     = "noeviction"
  description = "noeviction for queues / socket adapter (BullMQ requires it); allkeys-lru only for a cache-only node (docs/runbooks/redis.md «Разделение»)."
  validation {
    condition     = contains(["noeviction", "allkeys-lru", "volatile-lru", "allkeys-lfu", "volatile-lfu"], var.maxmemory_policy)
    error_message = "maxmemory_policy: noeviction (queues) or an LRU/LFU policy (cache-only node)."
  }
}
variable "description" {
  type    = string
  default = "cache, queues, rate limits, realtime"
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

# --- optional cluster mode enabled (sharded) group, built BESIDE the standalone one ---
# docs/architecture/REDIS_CLUSTER_READY.md, runbook docs/runbooks/redis-cluster.md.
# false = nothing below exists. true = a second replication group
# "<name>-redis-cl" (cluster mode enabled: hash slots over num_node_groups shards,
# replicas_per_node_group replicas each) and its secret REDIS_CLUSTER_URL are
# created; the standalone group and REDIS_URL stay untouched until the owner
# switches the app over (stack variable redis_cluster_mode).
variable "cluster_mode" {
  type        = bool
  default     = false
  description = "Create the cluster-mode-enabled group beside the standalone one."
}
variable "num_node_groups" {
  type        = number
  default     = 2
  description = "Shards of the cluster group (16384 hash slots are split between them). More shards = more write throughput and memory; changed online later (online resharding)."
  validation {
    condition     = var.num_node_groups >= 1 && var.num_node_groups <= 90
    error_message = "num_node_groups must be 1..90."
  }
}
variable "replicas_per_node_group" {
  type        = number
  default     = 1
  description = "Replicas per shard (1 = automatic failover inside each shard, Multi-AZ)."
  validation {
    condition     = var.replicas_per_node_group >= 0 && var.replicas_per_node_group <= 5
    error_message = "replicas_per_node_group must be 0..5."
  }
}
variable "cluster_node_type" {
  type        = string
  default     = ""
  description = "Node type of the cluster shards; empty = same as node_type."
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
  # alarm instead of silent data loss. A cache-only node (stack
  # `redis_cache_node`) uses allkeys-lru: full memory drops old cache keys
  # instead of refusing writes.
  parameter {
    name  = "maxmemory-policy"
    value = var.maxmemory_policy
  }
  tags = var.tags
}

resource "aws_elasticache_parameter_group" "cluster" {
  count  = var.cluster_mode ? 1 : 0
  name   = "${var.name}-redis7-cluster"
  family = "redis7"
  parameter {
    name  = "cluster-enabled"
    value = "yes"
  }
  parameter {
    name  = "maxmemory-policy"
    value = var.maxmemory_policy
  }
  tags = var.tags
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id       = "${var.name}-redis"
  description                = "${var.name} ${var.description}"
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

  # Owner 2026-10-16: the admin («Экономика» → «Увеличить») may move Redis
  # one tier up at run time; terraform apply must not undo it. Owner
  # 2026-10-24: modules/redis-autoscale moves it up AND down by itself, so
  # node_type here is only the first size. Before changing `replicas` later,
  # set node_type to the current type (new replicas are created from it).
  lifecycle {
    ignore_changes = [node_type]
    # Failover needs a second Availability Zone to fail over into.
    precondition {
      condition     = var.replicas == 0 || length(var.subnet_ids) >= 2
      error_message = "redis replicas > 0 needs subnets in at least two Availability Zones."
    }
  }
}

resource "aws_secretsmanager_secret" "redis_url" {
  name                    = "${var.name}/REDIS_URL"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "redis_url" {
  secret_id     = aws_secretsmanager_secret.redis_url.id
  secret_string = "rediss://:${random_password.auth.result}@${aws_elasticache_replication_group.this.primary_endpoint_address}:6379"
}

output "security_group_id" { value = aws_security_group.redis.id }
output "primary_endpoint" { value = aws_elasticache_replication_group.this.primary_endpoint_address }
output "redis_url_secret_arn" { value = aws_secretsmanager_secret.redis_url.arn }
output "reader_endpoint" { value = aws_elasticache_replication_group.this.reader_endpoint_address }

resource "aws_elasticache_replication_group" "cluster" {
  count                      = var.cluster_mode ? 1 : 0
  replication_group_id       = "${var.name}-redis-cl"
  description                = "${var.name} ${var.description} (cluster mode enabled)"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.cluster_node_type != "" ? var.cluster_node_type : var.node_type
  num_node_groups            = var.num_node_groups
  replicas_per_node_group    = var.replicas_per_node_group
  automatic_failover_enabled = var.replicas_per_node_group > 0
  multi_az_enabled           = var.replicas_per_node_group > 0
  parameter_group_name       = aws_elasticache_parameter_group.cluster[0].name
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

  # The shard count and the node type are changed online (console / CLI
  # resharding, docs/runbooks/redis-cluster.md); apply must not undo it.
  lifecycle {
    ignore_changes = [node_type, num_node_groups]
    precondition {
      condition     = var.replicas_per_node_group == 0 || length(var.subnet_ids) >= 2
      error_message = "redis replicas_per_node_group > 0 needs subnets in at least two Availability Zones."
    }
  }
}

resource "aws_secretsmanager_secret" "redis_cluster_url" {
  count                   = var.cluster_mode ? 1 : 0
  name                    = "${var.name}/REDIS_CLUSTER_URL"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = var.tags
}

# The CONFIGURATION endpoint: the app (REDIS_CLUSTER=true) discovers the shards from it.
resource "aws_secretsmanager_secret_version" "redis_cluster_url" {
  count         = var.cluster_mode ? 1 : 0
  secret_id     = aws_secretsmanager_secret.redis_cluster_url[0].id
  secret_string = "rediss://:${random_password.auth.result}@${aws_elasticache_replication_group.cluster[0].configuration_endpoint_address}:6379"
}

output "cluster_url_secret_arn" { value = one(aws_secretsmanager_secret.redis_cluster_url[*].arn) }
output "cluster_replication_group_id" { value = one(aws_elasticache_replication_group.cluster[*].replication_group_id) }
