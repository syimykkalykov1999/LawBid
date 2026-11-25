# Stage 2 SRE (Б4, 25.11): the 11.11 outage (docs/postmortems/2026-11-11-db-sg-pooler.md,
# KNOWN_ERRORS 99). An infra apply changed the database security group and Terraform
# removed the separate "pooler -> database" rule (CloudTrail: RevokeSecurityGroupIngress by
# the deploy role at 13:02 MST). The open pool connections lived about 23 minutes, then the
# API could not reach the database for 50 minutes, and nothing paged: the ALB and ECS
# health checks read /health/live, which does not touch the database.
#
# This rule pages the moment a rule is removed from (or the whole group deleted, or a rule
# rewritten in) the security group of the database or of its pooler — before the open
# connections die. The control is the CIS AWS Foundations Benchmark one for security
# group changes (v1.4.0 4.10 / v3.0.0 4.10 «Ensure a log metric filter and alarm exist
# for security group changes»), built the way AWS documents it for EventBridge
# («Creating rules that react to events from CloudTrail»: detail-type "AWS API Call via
# CloudTrail"). Narrowed to the two groups (and to removals) so a normal apply that only
# adds rules or touches other groups never pages. Cost: EventBridge rules on AWS service
# events are free; one SNS message per change.
variable "db_security_group_ids" {
  type        = list(string)
  default     = []
  description = "Security groups of the database and its pooler (PgBouncer). A rule removed from one of them, or the group deleted, pages at once. Empty = no rule."
}

locals {
  db_sg_watch = length(var.db_security_group_ids) > 0
  # docs/postmortems/ sits next to docs/runbooks/.
  db_sg_postmortem = "${trimsuffix(var.runbook_base_url, "/runbooks")}/postmortems/2026-11-11-db-sg-pooler.md"
}

resource "aws_cloudwatch_event_rule" "db_access_removed" {
  count       = local.db_sg_watch ? 1 : 0
  name        = "${var.name}-db-access-removed"
  description = "A rule was removed from the security group of the database or its pooler (the 11.11 outage)"
  event_pattern = jsonencode({
    source        = ["aws.ec2"]
    "detail-type" = ["AWS API Call via CloudTrail"]
    detail = {
      eventSource = ["ec2.amazonaws.com"]
      "$or" = [
        {
          eventName         = ["RevokeSecurityGroupIngress", "RevokeSecurityGroupEgress", "DeleteSecurityGroup"]
          requestParameters = { groupId = var.db_security_group_ids }
        },
        {
          eventName         = ["ModifySecurityGroupRules"]
          requestParameters = { ModifySecurityGroupRulesRequest = { GroupId = var.db_security_group_ids } }
        },
      ]
    }
  })
  tags = var.tags
}

resource "aws_cloudwatch_event_target" "db_access_removed" {
  count     = local.db_sg_watch ? 1 : 0
  rule      = aws_cloudwatch_event_rule.db_access_removed[0].name
  target_id = "page"
  arn       = aws_sns_topic.critical.arn
  input_transformer {
    input_paths = {
      action = "$.detail.eventName"
      group  = "$.detail.requestParameters.groupId"
      who    = "$.detail.userIdentity.arn"
    }
    # Plain Russian for the owner, like every other alarm.
    input_template = "\"LawBid: у базы данных сняли правило доступа (<action> в группе <group>, кто: <who>). Так начался простой 11.11: открытые соединения живут ещё минут 20, потом API не достучится до базы. Что делать: сразу открыть https://api.lawbid.dev/health/ready; если 503 или правило снято по ошибке, вернуть его (terraform apply последнего плана или ручное правило, как 11.11). Инструкция: ${local.db_sg_postmortem}\""
  }
}

# The same event also goes to the normal alerts mail (a page can be missed).
resource "aws_cloudwatch_event_target" "db_access_removed_mail" {
  count     = local.db_sg_watch ? 1 : 0
  rule      = aws_cloudwatch_event_rule.db_access_removed[0].name
  target_id = "alerts"
  arn       = aws_sns_topic.alerts.arn
  input_transformer {
    input_paths = {
      action = "$.detail.eventName"
      group  = "$.detail.requestParameters.groupId"
      who    = "$.detail.userIdentity.arn"
    }
    input_template = "\"LawBid: database security group change <action> on <group> by <who> (11.11 outage pattern). Check /health/ready now. Runbook: ${local.db_sg_postmortem}\""
  }
}
