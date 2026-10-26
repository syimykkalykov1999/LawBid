# docs/06 §6.2 — prod. State in S3 with locking (backend.hcl, see README);
# providers for the main region and the documents replica region.
terraform {
  required_version = ">= 1.9"
  backend "s3" {}
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.60" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
    tls    = { source = "hashicorp/tls", version = "~> 4.0" }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "lawbid", Env = "prod", ManagedBy = "terraform" }
  }
}

provider "aws" {
  alias  = "replica"
  region = var.replica_region
  default_tags {
    tags = { Project = "lawbid", Env = "prod", ManagedBy = "terraform" }
  }
}

module "stack" {
  source    = "../../modules/stack"
  providers = { aws = aws, aws.replica = aws.replica }

  env = "prod"
  # Owner 2026-10-16: the launch database is RDS PostgreSQL in our AWS.
  create_database                 = var.create_database
  database_instance_class         = var.database_instance_class
  database_max_connections        = var.database_max_connections
  database_backup_retention_days  = var.database_backup_retention_days
  azs                             = var.azs
  vpc_cidr                        = var.vpc_cidr
  domain                          = var.domain
  api_host                        = var.api_host
  admin_host                      = var.admin_host
  app_link_base_url               = var.app_link_base_url
  certificate_arn                 = var.certificate_arn
  web_host                        = var.web_host
  web_certificate_arn             = var.web_certificate_arn
  web_create_certificate          = var.web_create_certificate
  web_extra_hosts                 = var.web_extra_hosts
  status_page_enabled             = var.status_page_enabled
  status_host                     = var.status_host
  status_certificate_arn          = var.status_certificate_arn
  status_create_certificate       = var.status_create_certificate
  hosted_zone_id                  = var.hosted_zone_id
  dmarc_rua                       = var.dmarc_rua
  ses_from_address                = var.ses_from_address
  api_image                       = var.api_image
  admin_image                     = var.admin_image
  alert_emails                    = var.alert_emails
  slack_webhook_url               = var.slack_webhook_url
  stripe_price_id                 = var.stripe_price_id
  extra_secrets                   = var.extra_secrets
  documents_cdn_public_key_pem    = var.documents_cdn_public_key_pem
  clamav_image                    = var.clamav_image
  db_pooler_enabled               = var.db_pooler_enabled
  pgbouncer_image                 = var.pgbouncer_image
  pgbouncer_max_tasks             = var.pgbouncer_max_tasks
  pgbouncer_db_tls_mode           = var.pgbouncer_db_tls_mode
  pgbouncer_client_tls_private_ca = var.pgbouncer_client_tls_private_ca
  fcm_project_id                  = var.fcm_project_id
  fcm_client_email                = var.fcm_client_email
  google_client_ids               = var.google_client_ids
  apple_bundle_ids                = var.apple_bundle_ids
  apple_team_id                   = var.apple_team_id
  redis_node_type                 = var.redis_node_type
  redis_replicas                  = var.redis_replicas
  api_max_tasks                   = var.api_max_tasks
  worker_max_tasks                = var.worker_max_tasks
  min_tasks                       = var.min_tasks
  api_min_tasks                   = var.api_min_tasks
  container_insights              = var.container_insights
  worker_spot                     = var.worker_spot
  api_spot                        = var.api_spot
  turn_enabled                    = var.turn_enabled
  turn_second_enabled             = var.turn_second_enabled
  turn_traffic_alarm_gb_per_day   = var.turn_traffic_alarm_gb_per_day
  turn_instance_type              = var.turn_instance_type
  turn_total_quota                = var.turn_total_quota
  livekit_enabled                 = var.livekit_enabled
  livekit_instance_type           = var.livekit_instance_type
  livekit_use_redis               = var.livekit_use_redis
  livekit_egress_alarm_gb_per_day = var.livekit_egress_alarm_gb_per_day
  uptime_check                    = var.uptime_check
  cpu_architecture                = var.cpu_architecture
  admin_tasks                     = var.admin_tasks
  api_cpu                         = var.api_cpu
  api_memory                      = var.api_memory
  worker_cpu                      = var.worker_cpu
  worker_memory                   = var.worker_memory
  p95_target_ms                   = var.p95_target_ms
  nat_per_az                      = var.nat_per_az
  interface_endpoints             = var.interface_endpoints
  admin_allowed_cidrs             = var.admin_allowed_cidrs

  s3_cors_allowed_origins = var.s3_cors_allowed_origins

  monthly_budget_usd = var.monthly_budget_usd

  # Batch A: paging, budgets, NAT, backup alarm, GuardDuty extras.
  pagerduty_https_endpoint         = var.pagerduty_https_endpoint
  critical_email_too               = var.critical_email_too
  redis_memory_alarm_percent       = var.redis_memory_alarm_percent
  nat_traffic_alarm_gb_per_day     = var.nat_traffic_alarm_gb_per_day
  media_replication_max_gb_per_day = var.media_replication_max_gb_per_day
  ops_role_split                   = var.ops_role_split
  ops_role_external_id             = var.ops_role_external_id
  budget_forecast_thresholds       = var.budget_forecast_thresholds
  budget_to_alerts_topic           = var.budget_to_alerts_topic
  anomaly_existing_monitor_arn     = var.anomaly_existing_monitor_arn
  anomaly_extra_emails             = var.anomaly_extra_emails
  anomaly_threshold_usd            = var.anomaly_threshold_usd
  backup_age_missing_data          = var.backup_age_missing_data
  service_budgets                  = var.service_budgets
  guardduty_enabled                = var.guardduty_enabled
  guardduty_s3_events              = var.guardduty_s3_events
  guardduty_rds_login              = var.guardduty_rds_login
  guardduty_ebs_malware            = var.guardduty_ebs_malware
  guardduty_runtime_monitoring     = var.guardduty_runtime_monitoring
  create_anomaly_monitor           = var.create_anomaly_monitor

  # Reliability (owner 2026-10-22): Multi-AZ, AWS Backup copies to the
  # replica region (+ optional backup account), worker scaling on queue
  # depth, cheaper endpoint placement, optional cache-only Redis.
  database_multi_az                      = var.database_multi_az
  db_autoscale_enabled                   = var.db_autoscale_enabled
  db_autoscale_min_class                 = var.db_autoscale_min_class
  db_autoscale_max_class                 = var.db_autoscale_max_class
  db_autoscale_mode                      = var.db_autoscale_mode
  db_autoscale_initial_ceiling_class     = var.db_autoscale_initial_ceiling_class
  redis_autoscale_initial_ceiling_class  = var.redis_autoscale_initial_ceiling_class
  db_autoscale_tuning                    = var.db_autoscale_tuning
  redis_autoscale_enabled                = var.redis_autoscale_enabled
  secret_rotation                        = var.secret_rotation
  redis_autoscale_min_class              = var.redis_autoscale_min_class
  redis_autoscale_max_class              = var.redis_autoscale_max_class
  redis_autoscale_mode                   = var.redis_autoscale_mode
  redis_autoscale_tuning                 = var.redis_autoscale_tuning
  existing_database_identifier           = var.existing_database_identifier
  backup_enabled                         = var.backup_enabled
  backup_retention_days                  = var.backup_retention_days
  backup_copy_account_id                 = var.backup_copy_account_id
  backup_copy_vault_name                 = var.backup_copy_vault_name
  backup_copy_region                     = var.backup_copy_region
  interface_endpoint_azs                 = var.interface_endpoint_azs
  redis_cache_node                       = var.redis_cache_node
  redis_cache_node_type                  = var.redis_cache_node_type
  worker_jobs_per_task                   = var.worker_jobs_per_task
  adopt_existing_database                = var.adopt_existing_database
  replicate_media                        = var.replicate_media
  database_deletion_protection           = var.database_deletion_protection
  rds_cross_region_backups               = var.rds_cross_region_backups
  rds_cross_region_backup_retention_days = var.rds_cross_region_backup_retention_days

  # Security research #5 (2026-10-22): WAF, cloud detector, container.
  waf_enabled                    = var.waf_enabled
  cdn_waf_enabled                = var.cdn_waf_enabled
  waf_requests_alarm_per_day     = var.waf_requests_alarm_per_day
  cdn_waf_requests_alarm_per_day = var.cdn_waf_requests_alarm_per_day
  cloudfront_gb_alarm_per_day    = var.cloudfront_gb_alarm_per_day
  waf_otp_rate_limit_per_5m      = var.waf_otp_rate_limit_per_5m
  waf_device_header              = var.waf_device_header
  waf_auth_rate_action           = var.waf_auth_rate_action
  waf_auth_rules_enabled         = var.waf_auth_rules_enabled
  alb_deletion_protection        = var.alb_deletion_protection
  alb_least_outstanding_requests = var.alb_least_outstanding_requests
  alb_websocket_target_group     = var.alb_websocket_target_group
  waf_bot_control_enabled        = var.waf_bot_control_enabled
  waf_bot_control_block          = var.waf_bot_control_block
  cdn_waf_rate_limit_per_5m      = var.cdn_waf_rate_limit_per_5m
  security_hub_enabled           = var.security_hub_enabled
  guardduty_alert_severity       = var.guardduty_alert_severity

  # Security & legal pass 2026-10-24.
  securityhub_fsbp_enabled       = var.securityhub_fsbp_enabled
  inspector_enabled              = var.inspector_enabled
  unused_access_analyzer_enabled = var.unused_access_analyzer_enabled
  s3_account_block_public_access = var.s3_account_block_public_access
  critical_api_alerts_enabled    = var.critical_api_alerts_enabled
  documents_data_events          = var.documents_data_events
  audit_logs_enabled             = var.audit_logs_enabled
  audit_logs_retention_days      = var.audit_logs_retention_days
  audit_logs_object_lock         = var.audit_logs_object_lock

  # AWS guardrails pass 2026-10-25 (docs/runbooks/aws-guardrails.md)
  config_enabled                     = var.config_enabled
  config_retention_days              = var.config_retention_days
  break_glass_enabled                = var.break_glass_enabled
  break_glass_principal_arns         = var.break_glass_principal_arns
  cloudtrail_athena_enabled          = var.cloudtrail_athena_enabled
  anomaly_to_alerts_topic            = var.anomaly_to_alerts_topic
  vpc_flow_logs_traffic              = var.vpc_flow_logs_traffic
  macie_enabled                      = var.macie_enabled
  macie_sampling_percentage          = var.macie_sampling_percentage
  backup_vault_lock_mode             = var.backup_vault_lock_mode
  backup_vault_lock_cooling_off_days = var.backup_vault_lock_cooling_off_days
  ecs_readonly_root_filesystem       = var.ecs_readonly_root_filesystem
  deploy_alarm_rollback              = var.deploy_alarm_rollback
  deploy_rollback_on_slo             = var.deploy_rollback_on_slo
  dmarc_policy                       = var.dmarc_policy

  # Load audit 6: growth switches (growth.tf).
  growth = var.growth
}

output "stack" { value = module.stack }
