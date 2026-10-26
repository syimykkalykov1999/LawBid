# Load audit 6 (2026-10-23): the growth switches. Everything here is OFF by
# default and creates nothing until a number or a flag is set; each switch is
# one value in `growth = { ... }` of the environment's tfvars
# (docs/perf/GROWTH_LADDER_2026-10-23.md says which one to flip at which step).
#
#   rds_read_replicas   0..5 read copies of the database (reads for search /
#                       profiles / feeds move to them with DATABASE_REPLICA_URL)
#   db_proxy_enabled    RDS Proxy: thousands of app connections share a few
#                       hundred database connections, fast failover
#   opensearch_enabled  an OpenSearch domain for the search engine step. The
#                       app finds it by itself (OPENSEARCH_URL is set on the
#                       tasks by modules/stack) and uses it only when the admin
#                       sets «search.engine» to shadow / engine.
#                       Sizing and alarms: docs/architecture/SEARCH_READY.md.
#   event_loop alarm    "a Node process is saturated" (metric written by the app)
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
variable "kms_key_arn" { type = string }
variable "tasks_security_group_id" { type = string }
variable "alerts_topic_arn" {
  type    = string
  default = null
}
variable "alarms_enabled" {
  type        = bool
  default     = false
  description = "Create the alarms (alerts_topic_arn is unknown until the topic exists, so count and for_each cannot use it)."
}
variable "has_source_db" {
  type        = bool
  default     = false
  description = "A primary database exists (rds_source_identifier can be unknown at plan time on a fresh stack)."
}

# --- read replicas ------------------------------------------------------------
variable "rds_read_replicas" {
  type    = number
  default = 0
  validation {
    condition     = var.rds_read_replicas >= 0 && var.rds_read_replicas <= 5
    error_message = "rds_read_replicas: 0..5."
  }
}
variable "rds_source_identifier" {
  type        = string
  default     = ""
  description = "Identifier of the primary instance (created by the stack or existing_database_identifier)."
}
variable "rds_replica_instance_class" {
  type        = string
  default     = ""
  description = "Empty = the same class as the primary; replicas can be resized in the RDS console without Terraform undoing it."
}
variable "rds_primary_instance_class" {
  type    = string
  default = "db.t4g.medium"
}
variable "rds_subnet_group_name" {
  type    = string
  default = ""
}
variable "rds_security_group_ids" {
  type    = list(string)
  default = []
}

# --- RDS Proxy ----------------------------------------------------------------
variable "db_proxy_enabled" {
  type    = bool
  default = false
}
variable "db_proxy_secret_arn" {
  type        = string
  default     = ""
  description = "Secrets Manager secret with {username, password} of the app's database role (the proxy logs in with it)."
}
variable "db_proxy_target_db" {
  type    = string
  default = ""
}

# --- OpenSearch -----------------------------------------------------------------
variable "opensearch_enabled" {
  type    = bool
  default = false
}
variable "opensearch_instance_type" {
  type    = string
  default = "t3.small.search"
}
variable "opensearch_instance_count" {
  type    = number
  default = 1
}
variable "opensearch_volume_gb" {
  type    = number
  default = 20
}

# --- runtime alarm ----------------------------------------------------------------
variable "event_loop_p99_alarm_ms" {
  type        = number
  default     = 250
  description = "Alarm when a Node process answers 250 ms late at p99 for 10 minutes (metric LawBid/Runtime EventLoopP99Ms written by the app). 0 = no alarm."
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

# ===== read replicas ==========================================================
resource "aws_db_instance" "replica" {
  count               = var.has_source_db ? var.rds_read_replicas : 0
  identifier          = "${var.name}-postgres-replica-${count.index + 1}"
  replicate_source_db = var.rds_source_identifier
  instance_class      = var.rds_replica_instance_class != "" ? var.rds_replica_instance_class : var.rds_primary_instance_class

  db_subnet_group_name   = var.rds_subnet_group_name != "" ? var.rds_subnet_group_name : null
  vpc_security_group_ids = length(var.rds_security_group_ids) > 0 ? var.rds_security_group_ids : null
  publicly_accessible    = false
  storage_encrypted      = true
  kms_key_id             = var.kms_key_arn

  # A replica is rebuilt from the primary: no backups of its own.
  backup_retention_period               = 0
  skip_final_snapshot                   = true
  auto_minor_version_upgrade            = true
  performance_insights_enabled          = true
  performance_insights_retention_period = 7 # free tier
  tags                                  = merge(var.tags, { Role = "read-replica" })

  # The admin («Экономика» → «Увеличить») may move it one tier up.
  lifecycle {
    ignore_changes = [instance_class]
  }
}

# ===== RDS Proxy ==============================================================
resource "aws_security_group" "proxy" {
  count       = var.db_proxy_enabled ? 1 : 0
  name        = "${var.name}-db-proxy"
  description = "RDS Proxy: from the ECS tasks, to the database"
  vpc_id      = var.vpc_id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.tasks_security_group_id]
  }
  egress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
  }
  tags = var.tags
}

# The database's own group must let the proxy in (additive rule only).
resource "aws_security_group_rule" "db_from_proxy" {
  count                    = var.db_proxy_enabled && length(var.rds_security_group_ids) > 0 ? 1 : 0
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = var.rds_security_group_ids[0]
  source_security_group_id = aws_security_group.proxy[0].id
  description              = "RDS Proxy"
}

data "aws_iam_policy_document" "proxy_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["rds.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "proxy" {
  count              = var.db_proxy_enabled ? 1 : 0
  name               = "${var.name}-db-proxy"
  assume_role_policy = data.aws_iam_policy_document.proxy_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "proxy_secret" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.db_proxy_secret_arn != "" ? var.db_proxy_secret_arn : "arn:aws:secretsmanager:*:*:secret:unset"]
  }
  statement {
    actions   = ["kms:Decrypt"]
    resources = [var.kms_key_arn]
  }
}

resource "aws_iam_role_policy" "proxy" {
  count  = var.db_proxy_enabled ? 1 : 0
  name   = "read-db-secret"
  role   = aws_iam_role.proxy[0].id
  policy = data.aws_iam_policy_document.proxy_secret.json
}

resource "aws_db_proxy" "this" {
  count                  = var.db_proxy_enabled ? 1 : 0
  name                   = "${var.name}-postgres"
  engine_family          = "POSTGRESQL"
  role_arn               = aws_iam_role.proxy[0].arn
  vpc_subnet_ids         = var.private_subnet_ids
  vpc_security_group_ids = [aws_security_group.proxy[0].id]
  require_tls            = true
  idle_client_timeout    = 1800
  auth {
    auth_scheme = "SECRETS"
    iam_auth    = "DISABLED"
    secret_arn  = var.db_proxy_secret_arn
  }
  tags = var.tags

  lifecycle {
    precondition {
      condition     = var.db_proxy_secret_arn != "" && var.db_proxy_target_db != ""
      error_message = "db_proxy_enabled needs db_proxy_secret_arn (the app role's credentials secret) and a database to point at (create_database or existing_database_identifier)."
    }
  }
}

resource "aws_db_proxy_default_target_group" "this" {
  count         = var.db_proxy_enabled ? 1 : 0
  db_proxy_name = aws_db_proxy.this[0].name
  connection_pool_config {
    max_connections_percent      = 90
    max_idle_connections_percent = 50
    connection_borrow_timeout    = 10
  }
}

resource "aws_db_proxy_target" "this" {
  count                  = var.db_proxy_enabled ? 1 : 0
  db_proxy_name          = aws_db_proxy.this[0].name
  target_group_name      = aws_db_proxy_default_target_group.this[0].name
  db_instance_identifier = var.db_proxy_target_db
}

# ===== OpenSearch =============================================================
resource "aws_security_group" "opensearch" {
  count       = var.opensearch_enabled ? 1 : 0
  name        = "${var.name}-opensearch"
  description = "OpenSearch from the ECS tasks only"
  vpc_id      = var.vpc_id
  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [var.tasks_security_group_id]
  }
  tags = var.tags
}

# VPC-only domain: the network (security group above, tasks only) is the gate,
# like the AWS console's "VPC access" template. The resource policy therefore
# lets any caller INSIDE that network in without request signing, because the
# app talks plain HTTPS (no SigV4 signing in the API image); anything outside
# the security group never reaches the domain at all.
resource "aws_opensearch_domain" "search" {
  count          = var.opensearch_enabled ? 1 : 0
  domain_name    = "${var.name}-search"
  engine_version = "OpenSearch_2.15"

  cluster_config {
    instance_type          = var.opensearch_instance_type
    instance_count         = var.opensearch_instance_count
    zone_awareness_enabled = var.opensearch_instance_count > 1
    dynamic "zone_awareness_config" {
      for_each = var.opensearch_instance_count > 1 ? [1] : []
      content {
        availability_zone_count = min(length(var.private_subnet_ids), 2)
      }
    }
  }
  ebs_options {
    ebs_enabled = true
    volume_type = "gp3"
    volume_size = var.opensearch_volume_gb
  }
  vpc_options {
    subnet_ids         = slice(var.private_subnet_ids, 0, var.opensearch_instance_count > 1 ? min(length(var.private_subnet_ids), 2) : 1)
    security_group_ids = [aws_security_group.opensearch[0].id]
  }
  encrypt_at_rest {
    enabled    = true
    kms_key_id = var.kms_key_arn
  }
  node_to_node_encryption {
    enabled = true
  }
  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }
  access_policies = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = "*" }
      Action    = "es:ESHttp*"
      Resource  = "arn:aws:es:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:domain/${var.name}-search/*"
    }]
  })
  # Auto-Tune adjusts JVM / queue sizes to the load by itself; AWS does not
  # offer it on the burstable t-class nodes.
  dynamic "auto_tune_options" {
    for_each = startswith(var.opensearch_instance_type, "t") ? [] : [1]
    content {
      desired_state       = "ENABLED"
      rollback_on_disable = "NO_ROLLBACK"
    }
  }
  tags = var.tags
}

# ---- engine alarms --------------------------------------------------------
# A provisioned domain does NOT add or remove nodes by itself. The signals
# below say "make it one size bigger" (opensearch_instance_type / _count /
# _volume_gb in tfvars, one apply; the app answers from Postgres while a node
# is replaced). The pay-per-use alternative, OpenSearch Serverless, was
# rejected in docs/architecture/SEARCH_READY.md (price floor, request signing).
locals {
  opensearch_alarms = var.opensearch_enabled && var.alarms_enabled ? {
    cpu = {
      metric = "CPUUtilization", stat = "Average", op = "GreaterThanThreshold", threshold = 70, periods = 15
      text   = "The search engine processor is above 70 % for 15 minutes: raise opensearch_instance_type (or opensearch_instance_count) in growth."
    }
    jvm = {
      metric = "JVMMemoryPressure", stat = "Maximum", op = "GreaterThanThreshold", threshold = 85, periods = 10
      text   = "The search engine memory pressure is above 85 % for 10 minutes: raise opensearch_instance_type in growth (more memory)."
    }
    storage = {
      metric = "FreeStorageSpace", stat = "Minimum", op = "LessThanThreshold", threshold = var.opensearch_volume_gb * 1024 * 0.25, periods = 5
      text   = "The search engine has less than 25 % of its disk free: raise opensearch_volume_gb in growth."
    }
    red = {
      metric = "ClusterStatus.red", stat = "Maximum", op = "GreaterThanOrEqualToThreshold", threshold = 1, periods = 5
      text   = "The search engine cluster is red (an index is missing). The app answers from Postgres meanwhile; run node dist/src/cli/search-reindex.js --recreate."
    }
  } : {}
}

resource "aws_cloudwatch_metric_alarm" "opensearch" {
  for_each            = local.opensearch_alarms
  alarm_name          = "${var.name}-search-${each.key}"
  alarm_description   = each.value.text
  namespace           = "AWS/ES"
  metric_name         = each.value.metric
  dimensions          = { DomainName = "${var.name}-search", ClientId = data.aws_caller_identity.current.account_id }
  statistic           = each.value.stat
  period              = 60
  evaluation_periods  = each.value.periods
  datapoints_to_alarm = each.value.periods
  threshold           = each.value.threshold
  comparison_operator = each.value.op
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alerts_topic_arn]
  tags                = var.tags
  depends_on          = [aws_opensearch_domain.search]
}

# ===== runtime alarm ==========================================================
resource "aws_cloudwatch_metric_alarm" "event_loop" {
  for_each            = var.event_loop_p99_alarm_ms > 0 && var.alarms_enabled ? toset(["api", "worker"]) : toset([])
  alarm_name          = "${var.name}-${each.key}-event-loop-lag"
  alarm_description   = "A ${each.key} process answers late (event loop p99 above ${var.event_loop_p99_alarm_ms} ms for 10 minutes): CPU work on the main thread or an overloaded task. Look at LawBid/Runtime."
  namespace           = "LawBid/Runtime"
  metric_name         = "EventLoopP99Ms"
  dimensions          = { Service = each.key }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 10
  datapoints_to_alarm = 10
  threshold           = var.event_loop_p99_alarm_ms
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alerts_topic_arn]
  tags                = var.tags
}

# Dedup D-21: the database CPU alarm (`<name>-db-cpu`) lives in
# modules/monitoring/coverage.tf (85 % for 15 minutes, with a runbook and OK
# actions, also for an existing database). The copy that was here used the
# same alarm name with a 70 % threshold, so the two fought over one alarm.

output "replica_endpoints" { value = aws_db_instance.replica[*].address }
output "db_proxy_endpoint" { value = one(aws_db_proxy.this[*].endpoint) }
output "opensearch_endpoint" { value = one(aws_opensearch_domain.search[*].endpoint) }
# Index replicas for the app (OPENSEARCH_REPLICAS): one copy per index once
# there are two or more nodes, none on a single node.
output "opensearch_replicas" { value = var.opensearch_instance_count > 1 ? 1 : 0 }
