# Owner 26.11 («автоматизируй их не мучая меня»): «Авто» row
# aws.db_logical_replication writes `database_logical_replication = true`
# (stack -> rds_logical_replication here) and its plan is applied without the
# owner only because it touches the parameter groups alone
# (apps/api/src/modules/admin-launch/infra/infra-auto-growth.logic.ts
# GROWTH_AUTO_SCOPE). These runs pin that: the server itself (its parameter
# group, engine, class) does not change, the parameter waits for a reboot.
#   terraform -chdir=infra/modules/postgres init -backend=false
#   terraform -chdir=infra/modules/postgres test

mock_provider "aws" {}
mock_provider "random" {}

variables {
  name                       = "t"
  vpc_id                     = "vpc-1"
  subnet_ids                 = ["subnet-1", "subnet-2"]
  allowed_security_group_ids = ["sg-1"]
  kms_key_arn                = "arn:aws:kms:us-east-1:111111111111:key/1"
}

run "on_16_only_the_group_gets_the_parameter" {
  command = plan
  variables {
    rds_logical_replication = true
  }
  assert {
    condition     = contains([for p in aws_db_parameter_group.this.parameter : "${p.name}=${p.value}=${p.apply_method}"], "rds.logical_replication=1=pending-reboot")
    error_message = "rds.logical_replication = 1, applied by the next reboot (STATIC: the reboot stays the owner's step)."
  }
  assert {
    condition     = aws_db_instance.this.parameter_group_name == "t-postgres16" && aws_db_instance.this.engine_version == "16"
    error_message = "The database server itself does not change: same group, same engine."
  }
  assert {
    condition     = length(aws_db_parameter_group.pg18) == 0
    error_message = "No new parameter group on 16."
  }
}

run "on_18_the_18_group_gets_it_too" {
  command = plan
  variables {
    engine_version          = "18"
    rds_logical_replication = true
  }
  assert {
    condition     = contains([for p in aws_db_parameter_group.pg18[0].parameter : "${p.name}=${p.value}=${p.apply_method}"], "rds.logical_replication=1=pending-reboot")
    error_message = "The postgres18 group the server runs on carries rds.logical_replication = 1 (pending-reboot)."
  }
  assert {
    condition     = aws_db_instance.this.parameter_group_name == "t-postgres18"
    error_message = "The server keeps its postgres18 group."
  }
}

run "off_on_18_no_parameter" {
  command = plan
  variables {
    engine_version = "18"
  }
  assert {
    condition     = !contains([for p in aws_db_parameter_group.pg18[0].parameter : p.name], "rds.logical_replication")
    error_message = "Without the switch the postgres18 group has no rds.logical_replication."
  }
}
