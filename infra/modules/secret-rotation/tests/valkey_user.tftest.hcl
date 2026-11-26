# Item 29: the Serverless Valkey password (an ElastiCache user) is rotated by
# the same rotator as the AUTH token, with user rights instead of group rights.
#   terraform -chdir=infra/modules/secret-rotation init -backend=false
#   terraform -chdir=infra/modules/secret-rotation test

mock_provider "aws" {
  override_during = plan
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111111111111" }
  }
  mock_data "aws_region" {
    defaults = { region = "us-east-1", name = "us-east-1" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}", minified_json = "{}" }
  }
}
mock_provider "archive" {}

variables {
  name             = "lb"
  cluster_name     = "lb"
  service_names    = ["api", "worker"]
  alerts_topic_arn = "arn:aws:sns:us-east-1:111111111111:a"
  kms_key_arn      = "arn:aws:kms:us-east-1:111111111111:key/k"
  redis = {
    REDIS_URL            = { secret_arn = "arn:aws:secretsmanager:us-east-1:111111111111:secret:r", group_id = "lb-redis", every_days = 30 }
    REDIS_SERVERLESS_URL = { secret_arn = "arn:aws:secretsmanager:us-east-1:111111111111:secret:s", group_id = "", user_id = "lb-svl-default", every_days = 30 }
  }
}

run "serverless_user_is_rotated_by_user_not_group" {
  command = plan
  assert {
    condition     = jsondecode(aws_lambda_function.rotator[0].environment[0].variables["VALKEY_USERS"]) == { REDIS_SERVERLESS_URL = "lb-svl-default" }
    error_message = "the rotator knows the Serverless secret is an ElastiCache user"
  }
  assert {
    condition     = jsondecode(aws_lambda_function.rotator[0].environment[0].variables["REDIS_GROUPS"]) == { REDIS_URL = "lb-redis" }
    error_message = "the node-group token keeps its group, the Serverless secret is not a group"
  }
  assert {
    condition     = local.user_arns == ["arn:aws:elasticache:us-east-1:111111111111:user:lb-svl-default"] && local.group_arns == ["arn:aws:elasticache:us-east-1:111111111111:replicationgroup:lb-redis"]
    error_message = "ModifyUser only on that user, ModifyReplicationGroup only on the group"
  }
  assert {
    condition     = contains(keys(aws_secretsmanager_secret_rotation.redis), "REDIS_SERVERLESS_URL")
    error_message = "the Serverless secret gets a rotation schedule"
  }
}

run "serverless_only_has_no_group_rights" {
  command = plan
  variables {
    redis = {
      REDIS_SERVERLESS_URL = { secret_arn = "arn:aws:secretsmanager:us-east-1:111111111111:secret:s", group_id = "", user_id = "lb-svl-default", every_days = 30 }
    }
  }
  assert {
    condition     = length(local.group_arns) == 0 && length(local.user_arns) == 1
    error_message = "after the node group is gone: user rights only (an empty resource list would be an invalid policy)"
  }
}
