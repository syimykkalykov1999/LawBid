# Item 20 (X3, 25.11): the AWS FIS SSM-agent sidecar on the API task, staging
# only. Off (prod, default) = the api task definition has no sidecar, no
# pidMode, no fault-injection flag and no extra role. Mock provider: no AWS.
#   terraform -chdir=infra/modules/ecs init -backend=false
#   terraform -chdir=infra/modules/ecs test -filter=tests/fault_injection.tftest.hcl

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
  name                             = "lawbid-staging"
  private_subnet_ids               = ["subnet-a", "subnet-b"]
  tasks_security_group_id          = "sg-1"
  api_target_group_arn             = "arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/api/1"
  admin_target_group_arn           = "arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/admin/1"
  api_image                        = "1.dkr.ecr.us-east-1.amazonaws.com/lawbid-api:abc"
  admin_image                      = "1.dkr.ecr.us-east-1.amazonaws.com/lawbid-admin:abc"
  kms_key_arn                      = "arn:aws:kms:us-east-1:111111111111:key/k"
  migrator_database_url_secret_arn = "arn:aws:secretsmanager:us-east-1:111111111111:secret:m"
  api_env                          = { FOO = "bar" }
  secret_arns                      = { JWT = "arn:aws:secretsmanager:us-east-1:111111111111:secret:j" }
  alb_resource_label               = "app/lb/1/targetgroup/api/1"
}

run "off_by_default_changes_nothing" {
  command = plan
  assert {
    # enable_fault_injection is left unset (null in the config, AWS default false; unknown at plan).
    condition     = aws_ecs_task_definition.api.pid_mode == null
    error_message = "without fault injection the api task must not get pidMode"
  }
  assert {
    condition     = length([for c in jsondecode(aws_ecs_task_definition.api.container_definitions) : c if c.name == "amazon-ssm-agent"]) == 0
    error_message = "without fault injection there is no SSM sidecar"
  }
  assert {
    condition     = length(aws_iam_role.fis_managed_instance) == 0 && length(aws_iam_role_policy.task_fis_sidecar) == 0
    error_message = "without fault injection no FIS roles or permissions"
  }
}

run "staging_gets_the_aws_guide_setup" {
  command = plan
  variables {
    fault_injection_enabled = true
  }
  assert {
    condition     = aws_ecs_task_definition.api.pid_mode == "task" && aws_ecs_task_definition.api.enable_fault_injection == true
    error_message = "FIS network faults on Fargate need pidMode=task and enableFaultInjection"
  }
  assert {
    condition     = jsondecode(aws_ecs_task_definition.api.container_definitions)[0].name == "api" && jsondecode(aws_ecs_task_definition.api.container_definitions)[0].essential == true
    error_message = "the api container stays first and essential (roll-services relies on it)"
  }
  assert {
    condition     = one([for c in jsondecode(aws_ecs_task_definition.api.container_definitions) : c.essential if c.name == "amazon-ssm-agent"]) == false
    error_message = "the SSM sidecar must not be essential: its death must not stop the API"
  }
  assert {
    condition     = one([for c in jsondecode(aws_ecs_task_definition.api.container_definitions) : c.environment[0].value if c.name == "amazon-ssm-agent"]) == "lawbid-staging-fis-ssm-instance"
    error_message = "the sidecar gets MANAGED_INSTANCE_ROLE_NAME"
  }
  assert {
    condition     = length(aws_iam_role_policy.task_fis_sidecar) == 1 && length(aws_iam_role_policy_attachment.fis_managed_instance_core) == 1
    error_message = "task role and managed instance role get the guide's permissions"
  }
  assert {
    condition     = aws_ecs_service.api.enable_execute_command == false
    error_message = "ECS Exec must stay off (the guide: FIS ecs task actions need it off)"
  }
}

run "prod_is_refused" {
  command = plan
  variables {
    name                    = "lawbid-prod"
    fault_injection_enabled = true
  }
  expect_failures = [aws_ecs_task_definition.api]
}
