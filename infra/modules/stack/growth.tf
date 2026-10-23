# Load audit 6 (2026-10-23): growth switches. One object, every key has a safe
# default (= off / today's behaviour). The plain-language "what to flip at
# which step" table is docs/perf/GROWTH_LADDER_2026-10-23.md.
variable "growth" {
  description = <<-EOT
    Growth switches (all off by default):
      rds_read_replicas          0..5 read copies of the database; then set the secret DATABASE_REPLICA_URL (extra_secrets) - search reads move there, no deploy.
      rds_replica_instance_class "" = same class as the primary.
      db_proxy_enabled           RDS Proxy in front of the database (needs db_proxy_secret_arn).
      db_proxy_secret_arn        Secrets Manager secret {username,password} of the app role.
      opensearch_enabled         OpenSearch domain for the search-engine step (the app side is a separate step).
      opensearch_instance_type / _count / _volume_gb   size of that domain.
      redis_cluster_mode         NOT BUILT: validation refuses true (the app's Lua scripts are single-slot only today).
      livekit_nodes              NOT BUILT: validation refuses > 1 (modules/livekit is one box).
      cdn_images_provider        "cloudfront" (default) or "bunny": which CDN serves public images; "bunny" needs cdn_images_base_url (https://<pull-zone>).
      event_loop_p99_alarm_ms    alarm threshold for the Node event-loop delay metric; 0 = no alarm.
  EOT
  type = object({
    rds_read_replicas          = optional(number, 0)
    rds_replica_instance_class = optional(string, "")
    db_proxy_enabled           = optional(bool, false)
    db_proxy_secret_arn        = optional(string, "")
    opensearch_enabled         = optional(bool, false)
    opensearch_instance_type   = optional(string, "t3.small.search")
    opensearch_instance_count  = optional(number, 1)
    opensearch_volume_gb       = optional(number, 20)
    redis_cluster_mode         = optional(bool, false)
    livekit_nodes              = optional(number, 1)
    cdn_images_provider        = optional(string, "cloudfront")
    cdn_images_base_url        = optional(string, "")
    event_loop_p99_alarm_ms    = optional(number, 250)
  })
  default = {}

  validation {
    condition     = var.growth.rds_read_replicas >= 0 && var.growth.rds_read_replicas <= 5
    error_message = "growth.rds_read_replicas: 0..5."
  }
  validation {
    condition     = contains(["cloudfront", "bunny"], var.growth.cdn_images_provider)
    error_message = "growth.cdn_images_provider: cloudfront or bunny."
  }
  validation {
    condition     = var.growth.cdn_images_provider != "bunny" || can(regex("^https://[^/]+$", var.growth.cdn_images_base_url))
    error_message = "growth.cdn_images_provider = bunny needs growth.cdn_images_base_url = https://<pull-zone host> (no trailing slash)."
  }
  validation {
    condition     = !var.growth.redis_cluster_mode
    error_message = "growth.redis_cluster_mode is not built yet: the app's Lua scripts touch keys of several hash slots (CROSSSLOT in cluster mode) and BullMQ needs hash-tagged queue names. See docs/perf/GROWTH_LADDER_2026-10-23.md, step 100M. Until then scale Redis up (redis_node_type) or split it (redis_cache_node)."
  }
  validation {
    condition     = var.growth.livekit_nodes >= 1 && var.growth.livekit_nodes <= 1
    error_message = "growth.livekit_nodes > 1 is not built yet (modules/livekit is one EC2 box); a multi-node SFU needs one public address per node plus Redis. See docs/perf/GROWTH_LADDER_2026-10-23.md."
  }
}

locals {
  growth_source_db    = var.create_database ? module.postgres[0].instance_id : var.existing_database_identifier
  growth_db_class     = var.create_database ? var.database_instance_class : try(data.aws_db_instance.existing[0].db_instance_class, var.database_instance_class)
  growth_subnet_group = var.create_database ? "${local.name}-postgres" : try(data.aws_db_instance.existing[0].db_subnet_group, "")
  growth_db_sgs       = var.create_database ? [module.postgres[0].security_group_id] : try(tolist(data.aws_db_instance.existing[0].vpc_security_groups), [])

  # Public image CDN (the app reads MEDIA_CDN_BASE_URL).
  media_cdn_base_url = var.growth.cdn_images_provider == "bunny" ? var.growth.cdn_images_base_url : "https://${module.s3.media_cdn_domain}"
}

module "growth" {
  source = "../growth"
  name   = local.name
  tags   = local.tags

  vpc_id                  = module.network.vpc_id
  private_subnet_ids      = module.network.private_subnet_ids
  kms_key_arn             = module.kms.key_arn
  tasks_security_group_id = aws_security_group.tasks.id
  alerts_topic_arn        = module.monitoring.alerts_topic_arn

  rds_read_replicas          = var.growth.rds_read_replicas
  rds_source_identifier      = local.growth_source_db
  rds_replica_instance_class = var.growth.rds_replica_instance_class
  rds_primary_instance_class = local.growth_db_class
  rds_subnet_group_name      = local.growth_subnet_group
  rds_security_group_ids     = local.growth_db_sgs

  db_proxy_enabled    = var.growth.db_proxy_enabled
  db_proxy_secret_arn = var.growth.db_proxy_secret_arn
  db_proxy_target_db  = local.growth_source_db

  opensearch_enabled        = var.growth.opensearch_enabled
  opensearch_instance_type  = var.growth.opensearch_instance_type
  opensearch_instance_count = var.growth.opensearch_instance_count
  opensearch_volume_gb      = var.growth.opensearch_volume_gb

  event_loop_p99_alarm_ms = var.growth.event_loop_p99_alarm_ms
}

output "growth_replica_endpoints" { value = module.growth.replica_endpoints }
output "growth_db_proxy_endpoint" { value = module.growth.db_proxy_endpoint }
output "growth_opensearch_endpoint" { value = module.growth.opensearch_endpoint }
