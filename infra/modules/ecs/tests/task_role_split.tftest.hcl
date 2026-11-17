# Row 204 (detective R4B-2, 17.11): one ECS task role per service. The
# internet-facing api keeps <name>-ecs-task, api-admin runs its own task
# definition with <name>-ecs-task-admin, the worker <name>-ecs-task-worker.
# terraform test with a mock provider: no AWS, no state.
#   terraform -chdir=infra/modules/ecs init -backend=false
#   terraform -chdir=infra/modules/ecs test

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

run "split_gives_each_service_its_role" {
  command = plan
  variables {
    task_role_split = true
  }
  assert {
    condition     = aws_iam_role.task.name == "lawbid-test-ecs-task" && aws_iam_role.task_admin[0].name == "lawbid-test-ecs-task-admin" && aws_iam_role.task_worker[0].name == "lawbid-test-ecs-task-worker"
    error_message = "three task roles: ecs-task (public api), ecs-task-admin, ecs-task-worker"
  }
  assert {
    condition     = aws_ecs_task_definition.api_admin[0].family == "lawbid-test-api-admin"
    error_message = "api-admin must run its own task definition family"
  }
  assert {
    condition     = contains([for e in jsondecode(aws_ecs_task_definition.api.container_definitions)[0].environment : "${e.name}=${e.value}"], "OPS_INFRA_WRITES=off")
    error_message = "the public api container must carry OPS_INFRA_WRITES=off"
  }
  assert {
    condition     = !contains([for e in jsondecode(aws_ecs_task_definition.api_admin[0].container_definitions)[0].environment : e.name], "OPS_INFRA_WRITES")
    error_message = "api-admin must run the infra loops (no OPS_INFRA_WRITES)"
  }
  assert {
    condition     = jsondecode(aws_ecs_task_definition.api_admin[0].container_definitions)[0].name == "api" && jsondecode(aws_ecs_task_definition.api_admin[0].container_definitions)[0].image == var.api_image
    error_message = "api-admin's container is api's (name api, same image: roll-services and pooler-roll rely on it)"
  }
  assert {
    condition     = length(aws_iam_role_policy.split_geo_places) == 2 && length(aws_iam_role_policy.split_rekognition_compare_faces) == 2
    error_message = "address suggestions and face match must stay on the api-admin and worker roles"
  }
}

run "no_split_keeps_one_shared_role" {
  command = plan
  variables {
    task_role_split = false
  }
  assert {
    condition     = length(aws_iam_role.task_admin) == 0 && length(aws_iam_role.task_worker) == 0 && length(aws_ecs_task_definition.api_admin) == 0
    error_message = "without the split nothing new is created"
  }
  assert {
    condition     = !contains([for e in jsondecode(aws_ecs_task_definition.api.container_definitions)[0].environment : e.name], "OPS_INFRA_WRITES")
    error_message = "without the split the api keeps running the infra loops"
  }
}

run "split_needs_api_admin" {
  command = plan
  variables {
    task_role_split   = true
    api_admin_enabled = false
  }
  expect_failures = [var.task_role_split]
}
