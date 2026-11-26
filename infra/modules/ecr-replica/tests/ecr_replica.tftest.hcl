# Stage 2 SRE (Б8): new lawbid-* images are copied to the DR region (ECR registry
# replication) and the repositories there keep the same rules. Mock providers, no AWS.
#   terraform -chdir=infra/modules/ecr-replica init -backend=false
#   terraform -chdir=infra/modules/ecr-replica test

mock_provider "aws" {}
mock_provider "aws" {
  alias = "dr"
}

variables {
  account_id  = "111111111111"
  main_region = "us-east-1"
  repositories = {
    "lawbid-api"       = "{\"rules\":[]}"
    "lawbid-admin"     = "{\"rules\":[]}"
    "lawbid-clamav"    = "{\"rules\":[]}"
    "lawbid-pgbouncer" = "{\"rules\":[]}"
  }
}

run "images_are_replicated_to_us_west_2" {
  command = plan
  assert {
    condition     = one(one(aws_ecr_replication_configuration.this).replication_configuration[0].rule).destination[0].region == "us-west-2"
    error_message = "images go to us-west-2"
  }
  assert {
    condition     = one(one(aws_ecr_replication_configuration.this).replication_configuration[0].rule).repository_filter[0].filter == "lawbid-"
    error_message = "only the lawbid- repositories"
  }
  assert {
    condition     = toset(keys(aws_ecr_repository.dr)) == toset(["lawbid-api", "lawbid-admin", "lawbid-clamav", "lawbid-pgbouncer"])
    error_message = "the four repositories exist in the DR region"
  }
  assert {
    condition     = length(aws_ecr_lifecycle_policy.dr) == 4 && aws_ecr_lifecycle_policy.dr["lawbid-api"].policy == "{\"rules\":[]}"
    error_message = "with the same keep-rules (replication does not copy them)"
  }
  assert {
    condition     = output.registry == "111111111111.dkr.ecr.us-west-2.amazonaws.com"
    error_message = "the DR registry address for envs/dr"
  }
}

run "off_is_nothing" {
  command = plan
  variables {
    enabled = false
  }
  assert {
    condition     = length(aws_ecr_replication_configuration.this) == 0 && length(aws_ecr_repository.dr) == 0
    error_message = "enabled = false creates nothing"
  }
}

run "no_replication_into_the_main_region" {
  command = plan
  variables {
    dr_region = "us-east-1"
  }
  assert {
    condition     = length(aws_ecr_replication_configuration.this) == 0
    error_message = "the DR region must differ from the main one"
  }
}
