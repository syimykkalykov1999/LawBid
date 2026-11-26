# D8 (26.11, docs/runbooks/db-migrator-role.md): migrations as the narrow role
# lawbid_migrator. The migrate task gets MIGRATOR_ROLE_PASSWORD only when the
# admin switch is on (the stack passes the ARN), never the api / worker; the
# command starts with ensure-migrator-role.mjs and the schema steps use its URL.
# terraform test with a mock provider: no AWS, no state.
#   terraform -chdir=infra/modules/ecs init -backend=false
#   terraform -chdir=infra/modules/ecs test -filter=tests/migrator_role.tftest.hcl

mock_provider "aws" {
  override_during = plan
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}", minified_json = "{}" }
  }
  mock_data "aws_region" {
    defaults = { region = "us-east-1", name = "us-east-1" }
  }
}

variables {
  name                             = "lawbid-test"
  private_subnet_ids               = ["subnet-a", "subnet-b"]
  tasks_security_group_id          = "sg-1"
  api_target_group_arn             = "arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/api/1"
  admin_target_group_arn           = "arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/admin/1"
  api_admin_target_group_arn       = "arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/api-admin/1"
  api_admin_enabled                = true
  api_image                        = "1.dkr.ecr.us-east-1.amazonaws.com/lawbid-api:abc"
  admin_image                      = "1.dkr.ecr.us-east-1.amazonaws.com/lawbid-admin:abc"
  kms_key_arn                      = "arn:aws:kms:us-east-1:111111111111:key/k"
  migrator_database_url_secret_arn = "arn:aws:secretsmanager:us-east-1:111111111111:secret:m"
  api_env                          = { FOO = "bar" }
  secret_arns                      = { JWT = "arn:aws:secretsmanager:us-east-1:111111111111:secret:j" }
  alb_resource_label               = "app/lb/1/targetgroup/api/1"
}

run "switch_off_migrate_task_exactly_as_before" {
  command = plan
  assert {
    condition     = !contains([for s in jsondecode(aws_ecs_task_definition.migrate.container_definitions)[0].secrets : s.name], "MIGRATOR_ROLE_PASSWORD")
    error_message = "without the ARN the migrate task must not get MIGRATOR_ROLE_PASSWORD (migrations as the master user)"
  }
  assert {
    condition     = [for s in jsondecode(aws_ecs_task_definition.migrate.container_definitions)[0].secrets : s.valueFrom if s.name == "DATABASE_URL"] == [var.migrator_database_url_secret_arn]
    error_message = "DATABASE_URL of the migrate task stays the MIGRATOR_DATABASE_URL secret (the master user)"
  }
}

run "switch_on_gives_the_password_to_the_migrate_task_only" {
  command = plan
  variables {
    migrator_role_password_secret_arn = "arn:aws:secretsmanager:us-east-1:111111111111:secret:lawbid-test/MIGRATOR_ROLE_PASSWORD"
  }
  assert {
    condition     = contains([for s in jsondecode(aws_ecs_task_definition.migrate.container_definitions)[0].secrets : "${s.name}=${s.valueFrom}"], "MIGRATOR_ROLE_PASSWORD=${var.migrator_role_password_secret_arn}")
    error_message = "the migrate task must get MIGRATOR_ROLE_PASSWORD"
  }
  assert {
    condition     = !contains([for s in jsondecode(aws_ecs_task_definition.api.container_definitions)[0].secrets : s.name], "MIGRATOR_ROLE_PASSWORD") && !contains(flatten([for c in jsondecode(aws_ecs_task_definition.worker.container_definitions) : [for s in try(c.secrets, []) : s.name]]), "MIGRATOR_ROLE_PASSWORD")
    error_message = "the api and the worker must never get the migrator's login"
  }
  assert {
    condition     = startswith(jsondecode(aws_ecs_task_definition.migrate.container_definitions)[0].command[2], "MIGRATE_URL=\"$DATABASE_URL\"; if [ -f prisma/ensure-migrator-role.mjs ]; then MIGRATE_URL=\"$(node prisma/ensure-migrator-role.mjs)\"; fi && [ -n \"$MIGRATE_URL\" ] && DATABASE_URL=\"$MIGRATE_URL\" npx prisma migrate deploy")
    error_message = "the migrate command must start with ensure-migrator-role.mjs and run prisma migrate deploy with its URL"
  }
}
