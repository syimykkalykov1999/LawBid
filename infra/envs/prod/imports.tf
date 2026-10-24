# RDS created this log group before Terraform managed it (prod apply
# 2026-10-24 failed with ResourceAlreadyExists). Adopt it instead of creating.
import {
  to = module.stack.module.postgres[0].aws_cloudwatch_log_group.rds["postgresql"]
  id = "/aws/rds/instance/lawbid-prod-postgres/postgresql"
}
