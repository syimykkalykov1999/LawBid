# Owner 15.11 «делай обновы сейчас» (docs/runbooks/db-major-upgrade.md):
# PostgreSQL 16 -> 18 is AWS Blue/Green, never an in-place Terraform upgrade.
# terraform test (built in since 1.6, mock providers since 1.7): no AWS, no state.
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

run "today_16_nothing_changes" {
  command = plan
  assert {
    condition     = length(aws_db_parameter_group.pg18) == 0
    error_message = "No postgres18 group while 18 is not asked for."
  }
  assert {
    condition     = aws_db_instance.this.parameter_group_name == "t-postgres16"
    error_message = "The server stays on t-postgres16."
  }
  assert {
    condition     = length(aws_db_parameter_group.this.parameter) == 11
    error_message = "The postgres16 group keeps exactly its 11 parameters (no logical replication)."
  }
  assert {
    condition     = !contains([for p in aws_db_parameter_group.this.parameter : p.name], "rds.logical_replication")
    error_message = "rds.logical_replication stays off."
  }
}

run "asked_for_18_prepares_blue_green" {
  command = plan
  variables {
    engine_version   = "16"
    upgrade_to_major = "18"
  }
  assert {
    condition     = aws_db_parameter_group.pg18[0].family == "postgres18" && aws_db_parameter_group.pg18[0].name == "t-postgres18"
    error_message = "The target group t-postgres18 (family postgres18) exists for --target-db-parameter-group-name."
  }
  assert {
    condition     = toset([for p in aws_db_parameter_group.pg18[0].parameter : "${p.name}=${p.value}"]) == toset([for p in aws_db_parameter_group.this.parameter : "${p.name}=${p.value}" if p.name != "rds.logical_replication"])
    error_message = "postgres18 carries the same custom parameters as postgres16."
  }
  assert {
    condition     = contains([for p in aws_db_parameter_group.this.parameter : "${p.name}=${p.value}=${p.apply_method}"], "rds.logical_replication=1=pending-reboot")
    error_message = "The blue (16) group gets rds.logical_replication = 1 (AWS Blue/Green prerequisite)."
  }
  assert {
    condition     = aws_db_instance.this.engine_version == "16" && aws_db_instance.this.parameter_group_name == "t-postgres16"
    error_message = "Terraform never upgrades in place: the server stays on 16 until the switchover."
  }
}

run "after_switchover_runs_18" {
  command = plan
  variables {
    engine_version   = "18"
    upgrade_to_major = "18"
  }
  assert {
    condition     = aws_db_instance.this.parameter_group_name == "t-postgres18" && output.engine_major == "18"
    error_message = "After the switchover the config follows the server: 18 on t-postgres18."
  }
  assert {
    condition     = contains([for p in aws_db_parameter_group.this.parameter : "${p.name}=${p.value}"], "rds.logical_replication=1")
    error_message = "The old group keeps rds.logical_replication after the switch (removing it needs ResetDBParameterGroup, KNOWN_ERRORS 173)."
  }
}

run "unknown_major_refused" {
  command = plan
  variables {
    upgrade_to_major = "17"
  }
  expect_failures = [var.upgrade_to_major]
}
