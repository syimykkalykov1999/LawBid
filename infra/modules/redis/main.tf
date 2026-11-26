# docs/06 §6.1 — ElastiCache for Redis: replication group, multi-AZ with
# automatic failover, TLS in transit, encryption at rest (KMS), AUTH token
# stored in Secrets Manager. Redis holds cache/queues/rate limits/realtime
# adapter state only (§6.4: not a source of truth).
terraform {
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.72" }
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
# Owner 14.11 «newest methods» (docs/dev/AUTO_MODERNIZE_2026-11-15.md):
# Valkey on ElastiCache is the open-source successor of Redis OSS; AWS prices
# node-based Valkey 20 % lower and upgrades Redis OSS in place with no
# downtime (ElastiCache 8.1 for Valkey, 07.2025). 15.11: Valkey 9.1, the newest
# ElastiCache offers (describe-cache-engine-versions --engine valkey; AWS
# What's New 23.06.2026), family valkey9. Default "redis" = today
# (no change in the next apply); "valkey" switches at an apply of its own.
variable "engine" {
  type    = string
  default = "redis"
  validation {
    condition     = contains(["redis", "valkey"], var.engine)
    error_message = "engine: redis or valkey."
  }
}
variable "engine_version" {
  type        = string
  default     = ""
  description = "Empty = 7.1 for redis, 9.1 for valkey."
}
locals {
  pg_family      = var.engine == "valkey" ? "valkey9" : "redis7"
  engine_version = var.engine_version != "" ? var.engine_version : (var.engine == "valkey" ? "9.1" : "7.1")
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
  name   = "${var.name}-${local.pg_family}"
  family = local.pg_family
  # A new family is a new group: create it before the old one goes.
  lifecycle { create_before_destroy = true }
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
  name   = "${var.name}-${local.pg_family}-cluster"
  family = local.pg_family
  lifecycle { create_before_destroy = true }
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
  count                      = var.node_group ? 1 : 0
  replication_group_id       = "${var.name}-redis"
  description                = "${var.name} ${var.description}"
  engine                     = var.engine
  engine_version             = local.engine_version
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
  # 15.11: with false, AWS keeps an engine change (Redis OSS -> Valkey) for
  # the Sunday window (ModifyReplicationGroup ApplyImmediately), while the
  # same apply already deletes the old redis7 parameter group the group still
  # uses (create_before_destroy) -> InvalidCacheParameterGroupState, apply
  # red. On Valkey every change goes at once: AWS «minimal downtime …
  # failover … a few seconds» (ElastiCache «Upgrading engine versions
  # including cross engine upgrades»). Node size changes use
  # ApplyImmediately anyway (modules/redis-autoscale).
  apply_immediately        = var.engine == "valkey"
  maintenance_window       = "sun:05:00-sun:06:00"
  snapshot_retention_limit = 1
  tags                     = var.tags

  # Owner 2026-10-16: the admin («Экономика» → «Увеличить») may move Redis
  # one tier up at run time; terraform apply must not undo it. Owner
  # 2026-10-24: modules/redis-autoscale moves it up AND down by itself, so
  # node_type here is only the first size. Before changing `replicas` later,
  # set node_type to the current type (new replicas are created from it).
  lifecycle {
    # Owner 2026-11-02: the standby node starts OFF and the API adds it by
    # itself when people are online (apps/api common/ops/ha-auto.service.ts:
    # IncreaseReplicaCount, then automatic failover). apply must never take it
    # away again, so node count and failover are not compared. To change them
    # by hand use the AWS CLI (docs/runbooks/ha-auto.md).
    # 12.11 (KNOWN_ERRORS 108): after «Авто» removes the standby the
    # remaining node is …-002; the AWS provider then sends the old
    # snapshotting cluster (…-001) with any snapshot change → 404 and every
    # apply stopped. Snapshots follow the nodes «Авто» manages, not Terraform.
    ignore_changes = [node_type, auth_token, num_cache_clusters, automatic_failover_enabled, multi_az_enabled, snapshot_retention_limit]
    # Failover needs a second Availability Zone to fail over into.
    precondition {
      condition     = var.replicas == 0 || length(var.subnet_ids) >= 2
      error_message = "redis replicas > 0 needs subnets in at least two Availability Zones."
    }
  }
}

resource "aws_secretsmanager_secret" "redis_url" {
  count                   = var.node_group ? 1 : 0
  name                    = "${var.name}/REDIS_URL"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "redis_url" {
  count         = var.node_group ? 1 : 0
  secret_id     = aws_secretsmanager_secret.redis_url[0].id
  secret_string = "rediss://:${random_password.auth.result}@${aws_elasticache_replication_group.this[0].primary_endpoint_address}:6379"

  # Automatic rotation (modules/secret-rotation) writes newer versions of this
  # secret; terraform must neither undo them nor fight over the version stage.
  # The value above is only the FIRST token.
  lifecycle { ignore_changes = [secret_string, version_stages] }
}

output "security_group_id" { value = aws_security_group.redis.id }
output "primary_endpoint" { value = one(aws_elasticache_replication_group.this[*].primary_endpoint_address) }
output "redis_url_secret_arn" { value = one(aws_secretsmanager_secret.redis_url[*].arn) }
output "reader_endpoint" { value = one(aws_elasticache_replication_group.this[*].reader_endpoint_address) }

resource "aws_elasticache_replication_group" "cluster" {
  count                      = var.cluster_mode ? 1 : 0
  replication_group_id       = "${var.name}-redis-cl"
  description                = "${var.name} ${var.description} (cluster mode enabled)"
  engine                     = var.engine
  engine_version             = local.engine_version
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
  apply_immediately          = var.engine == "valkey" # same reason as the standalone group
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

# --- item 29 (AU5, owner 25.11): ElastiCache Serverless for Valkey, BESIDE the node group ---
# docs/runbooks/valkey-serverless.md. false = nothing below exists (today).
# true = a serverless cache "<name>-valkey-sl" (Valkey 9: AWS What's New
# 05.05.2026 «available for ElastiCache node-based clusters and serverless
# caches»; 9.1 is node-based only, 23.06.2026), its own default user with the
# same AUTH password, and the secret REDIS_SERVERLESS_URL. The app keeps the
# node group until the owner switches it (stack redis_serverless_mode = "on").
# Serverless is always cluster mode, TLS only, Multi-AZ and scales by itself;
# cache_usage_limits are the owner's ceilings, so a runaway never bills more.
variable "serverless" {
  type        = bool
  default     = false
  description = "Create the ElastiCache Serverless Valkey cache beside the node group (docs/runbooks/valkey-serverless.md)."
}
variable "serverless_major_engine_version" {
  type        = string
  default     = "9"
  description = "Major Valkey version of the serverless cache (9 = the newest AWS offers for Serverless, 05.2026)."
}
variable "serverless_max_data_gb" {
  type        = number
  default     = 10
  description = "Ceiling: most GB the serverless cache may store (cache_usage_limits.data_storage.maximum). Writes past it are refused, the bill never passes it."
  validation {
    condition     = var.serverless_max_data_gb >= 1 && var.serverless_max_data_gb <= 5000
    error_message = "serverless_max_data_gb: 1..5000 (AWS limit 5000 GB)."
  }
}
variable "serverless_max_ecpu_per_second" {
  type        = number
  default     = 100000
  description = "Ceiling: most ECPU per second (cache_usage_limits.ecpu_per_second.maximum). AWS range 1000..15000000."
  validation {
    condition     = var.serverless_max_ecpu_per_second >= 1000 && var.serverless_max_ecpu_per_second <= 15000000
    error_message = "serverless_max_ecpu_per_second: 1000..15000000."
  }
}
variable "serverless_snapshot_arn" {
  type        = string
  default     = ""
  description = "ARN of an ElastiCache backup of the node group that seeds the serverless cache (AWS «Restoring from a backup into a new cache»). Read only when the cache is created; empty = an empty cache."
}

# Item 29, last runbook step: the node group goes after the app has run on
# Serverless (docs/runbooks/valkey-serverless.md «Убрать старые узлы»).
# true = today. false = the replication group "<name>-redis" and its
# REDIS_URL secret are removed (the runbook takes a manual backup first);
# allowed only while the serverless cache exists, so the app keeps a Valkey.
variable "node_group" {
  type        = bool
  default     = true
  description = "Keep the node-based replication group (false only after the move to Serverless, see the runbook)."
  validation {
    condition     = var.node_group || var.serverless
    error_message = "node_group = false needs serverless = true: the app must keep one Valkey."
  }
}

# The node group and its secret gained a count (node_group); state moves, no
# resource is replaced.
moved {
  from = aws_elasticache_replication_group.this
  to   = aws_elasticache_replication_group.this[0]
}
moved {
  from = aws_secretsmanager_secret.redis_url
  to   = aws_secretsmanager_secret.redis_url[0]
}
moved {
  from = aws_secretsmanager_secret_version.redis_url
  to   = aws_secretsmanager_secret_version.redis_url[0]
}

resource "aws_elasticache_user" "serverless_default" {
  count         = var.serverless ? 1 : 0
  user_id       = "${var.name}-svl-default"
  user_name     = "default" # a user group must hold a user named "default"
  engine        = "valkey"
  access_string = "on ~* &* +@all"
  authentication_mode {
    type      = "password"
    passwords = [random_password.auth.result]
  }
  tags = var.tags
  # A rotated password is written by the rotation, not by Terraform.
  lifecycle { ignore_changes = [authentication_mode] }
}

resource "aws_elasticache_user_group" "serverless" {
  count         = var.serverless ? 1 : 0
  user_group_id = "${var.name}-svl"
  engine        = "valkey"
  user_ids      = [aws_elasticache_user.serverless_default[0].user_id]
  tags          = var.tags
}

resource "aws_elasticache_serverless_cache" "this" {
  count                    = var.serverless ? 1 : 0
  name                     = "${var.name}-valkey-sl"
  description              = "${var.name} ${var.description} (serverless)"
  engine                   = "valkey"
  major_engine_version     = var.serverless_major_engine_version
  kms_key_id               = var.kms_key_arn
  security_group_ids       = [aws_security_group.redis.id]
  subnet_ids               = slice(var.subnet_ids, 0, min(3, length(var.subnet_ids)))
  user_group_id            = aws_elasticache_user_group.serverless[0].user_group_id
  daily_snapshot_time      = "05:00"
  snapshot_retention_limit = 1
  snapshot_arns_to_restore = var.serverless_snapshot_arn == "" ? null : [var.serverless_snapshot_arn]
  cache_usage_limits {
    data_storage {
      maximum = var.serverless_max_data_gb
      unit    = "GB"
    }
    ecpu_per_second {
      maximum = var.serverless_max_ecpu_per_second
    }
  }
  tags = var.tags
  # The seed backup matters only at creation; changing it later must not
  # replace the cache (and its data).
  lifecycle { ignore_changes = [snapshot_arns_to_restore] }
}

resource "aws_secretsmanager_secret" "redis_serverless_url" {
  count                   = var.serverless ? 1 : 0
  name                    = "${var.name}/REDIS_SERVERLESS_URL"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "redis_serverless_url" {
  count         = var.serverless ? 1 : 0
  secret_id     = aws_secretsmanager_secret.redis_serverless_url[0].id
  secret_string = "rediss://default:${random_password.auth.result}@${aws_elasticache_serverless_cache.this[0].endpoint[0].address}:${aws_elasticache_serverless_cache.this[0].endpoint[0].port}"
  lifecycle { ignore_changes = [secret_string, version_stages] }
}

output "serverless_url_secret_arn" { value = one(aws_secretsmanager_secret.redis_serverless_url[*].arn) }
output "serverless_cache_name" { value = one(aws_elasticache_serverless_cache.this[*].name) }
# The ElastiCache user whose password modules/secret-rotation rotates.
output "serverless_user_id" { value = one(aws_elasticache_user.serverless_default[*].user_id) }
