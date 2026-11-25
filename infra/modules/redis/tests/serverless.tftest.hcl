# Item 29 (AU5, owner 25.11): ElastiCache Serverless Valkey beside the node
# group (docs/runbooks/valkey-serverless.md).
#   terraform -chdir=infra/modules/redis init -backend=false
#   terraform -chdir=infra/modules/redis test

mock_provider "aws" {
  override_during = plan
  mock_resource "aws_elasticache_serverless_cache" {
    defaults = {
      endpoint = [{ address = "t-valkey-sl.serverless.use1.cache.amazonaws.com", port = 6379 }]
    }
  }
}
mock_provider "random" {}

variables {
  name                       = "t"
  vpc_id                     = "vpc-1"
  subnet_ids                 = ["subnet-1", "subnet-2", "subnet-3", "subnet-4"]
  allowed_security_group_ids = ["sg-1"]
  kms_key_arn                = "arn:aws:kms:us-east-1:111111111111:key/1"
  engine                     = "valkey"
  replicas                   = 0
}

run "default_creates_nothing_new" {
  command = plan
  assert {
    condition     = length(aws_elasticache_serverless_cache.this) == 0 && length(aws_elasticache_user_group.serverless) == 0 && output.serverless_url_secret_arn == null
    error_message = "serverless = false: today's node group only."
  }
  assert {
    condition     = aws_elasticache_replication_group.this[0].engine == "valkey"
    error_message = "the node group is untouched"
  }
}

run "serverless_beside_the_node_group" {
  command = plan
  variables {
    serverless = true
  }
  assert {
    condition     = aws_elasticache_serverless_cache.this[0].engine == "valkey" && aws_elasticache_serverless_cache.this[0].major_engine_version == "9"
    error_message = "Valkey 9, the newest major AWS offers for Serverless"
  }
  assert {
    condition     = length(aws_elasticache_serverless_cache.this[0].subnet_ids) == 3
    error_message = "at most three subnets (AWS)"
  }
  assert {
    condition     = aws_elasticache_serverless_cache.this[0].cache_usage_limits[0].data_storage[0].maximum == 10 && aws_elasticache_serverless_cache.this[0].cache_usage_limits[0].ecpu_per_second[0].maximum == 100000
    error_message = "the owner's ceilings bound the bill"
  }
  assert {
    condition     = aws_elasticache_user.serverless_default[0].user_name == "default" && aws_elasticache_user.serverless_default[0].engine == "valkey"
    error_message = "AUTH stays: a default user with a password"
  }
  assert {
    condition     = aws_elasticache_serverless_cache.this[0].kms_key_id == var.kms_key_arn
    error_message = "encrypted at rest with our key"
  }
  assert {
    condition     = aws_elasticache_serverless_cache.this[0].snapshot_arns_to_restore == null
    error_message = "no seed backup = empty cache"
  }
  assert {
    condition     = aws_elasticache_replication_group.this[0].replication_group_id == "t-redis"
    error_message = "the node group stays (the way back)"
  }
}

run "node_group_removed_after_the_move" {
  command = plan
  variables {
    serverless = true
    node_group = false
  }
  assert {
    condition     = length(aws_elasticache_replication_group.this) == 0 && length(aws_secretsmanager_secret.redis_url) == 0
    error_message = "the old node group and its REDIS_URL secret go"
  }
  assert {
    condition     = length(aws_elasticache_serverless_cache.this) == 1 && output.primary_endpoint == null
    error_message = "the serverless cache stays; no node endpoint"
  }
}

run "node_group_cannot_go_without_serverless" {
  command = plan
  variables {
    node_group = false
  }
  expect_failures = [var.node_group]
}

run "seeded_from_a_backup" {
  command = plan
  variables {
    serverless              = true
    serverless_snapshot_arn = "arn:aws:elasticache:us-east-1:111111111111:snapshot:t-cutover"
  }
  assert {
    condition     = aws_elasticache_serverless_cache.this[0].snapshot_arns_to_restore == tolist(["arn:aws:elasticache:us-east-1:111111111111:snapshot:t-cutover"])
    error_message = "the cutover backup seeds the cache"
  }
}
