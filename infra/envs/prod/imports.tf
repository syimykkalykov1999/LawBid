# RDS created this log group before Terraform managed it (prod apply
# 2026-10-24 failed with ResourceAlreadyExists). Adopt it instead of creating.
import {
  to = module.stack.module.postgres[0].aws_cloudwatch_log_group.rds["postgresql"]
  id = "/aws/rds/instance/lawbid-prod-postgres/postgresql"
}

# S4-3 (audit 2026-10-25): adopt the console-created prod RDS instance. Active
# only while adopt_existing_database = true (a set of one name, else empty).
# After the first successful apply this block may stay: an instance already in
# the state is not imported again. Nothing is created, modified or replaced by
# the import itself; `terraform plan` then lists the drift (Multi-AZ, backup
# retention, deletion protection, Performance Insights).
import {
  for_each = var.adopt_existing_database ? toset([var.existing_database_identifier]) : toset([])
  to       = module.stack.aws_db_instance.existing[0]
  id       = each.key
}
