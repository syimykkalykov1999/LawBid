# Owner 15.11 «делай обновы сейчас»: Redis OSS 7.1 -> Valkey 9.1 in place,
# in ONE apply (docs/runbooks/db-major-upgrade.md, Redis part).
#   terraform -chdir=infra/modules/redis init -backend=false
#   terraform -chdir=infra/modules/redis test

mock_provider "aws" {}
mock_provider "random" {}

variables {
  name                       = "t"
  vpc_id                     = "vpc-1"
  subnet_ids                 = ["subnet-1", "subnet-2"]
  allowed_security_group_ids = ["sg-1"]
  kms_key_arn                = "arn:aws:kms:us-east-1:111111111111:key/1"
  replicas                   = 0
}

run "redis_today_unchanged" {
  command = plan
  assert {
    condition     = aws_elasticache_replication_group.this[0].engine == "redis" && aws_elasticache_replication_group.this[0].engine_version == "7.1"
    error_message = "Default stays Redis OSS 7.1."
  }
  assert {
    condition     = aws_elasticache_parameter_group.this.family == "redis7" && aws_elasticache_parameter_group.this.name == "t-redis7"
    error_message = "Default group stays t-redis7."
  }
  assert {
    condition     = aws_elasticache_replication_group.this[0].apply_immediately == false
    error_message = "Redis OSS keeps changes for the Sunday window, as before."
  }
}

run "valkey_in_one_apply" {
  command = plan
  variables {
    engine = "valkey"
  }
  assert {
    condition     = aws_elasticache_replication_group.this[0].engine == "valkey" && aws_elasticache_replication_group.this[0].engine_version == "9.1"
    error_message = "valkey = Valkey 9.1 (the provider needs engine_version set explicitly when moving to valkey)."
  }
  assert {
    condition     = aws_elasticache_parameter_group.this.family == "valkey9" && [for p in aws_elasticache_parameter_group.this.parameter : "${p.name}=${p.value}"] == ["maxmemory-policy=noeviction"]
    error_message = "valkey9 group with the same (only, dynamic) parameter: maxmemory-policy noeviction for BullMQ."
  }
  assert {
    condition     = aws_elasticache_replication_group.this[0].apply_immediately == true
    error_message = "The engine change must apply now: with false AWS waits for Sunday while the same apply deletes the redis7 group still in use."
  }
}
