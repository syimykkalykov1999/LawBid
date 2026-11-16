# Owner 15.11 «обнови всё до новейшего» (docs/runbooks/db-major-upgrade.md):
# the search engine goes 2.15 -> 2.19 -> 3.7, one AWS hop per apply, in place.
# terraform test (mock providers): no AWS, no state.
#   terraform -chdir=infra/modules/growth init -backend=false
#   terraform -chdir=infra/modules/growth test

mock_provider "aws" {
  mock_data "aws_region" {
    defaults = { region = "us-east-1" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111111111111" }
  }
}

variables {
  name                      = "t"
  vpc_id                    = "vpc-1"
  private_subnet_ids        = ["subnet-1", "subnet-2"]
  kms_key_arn               = "arn:aws:kms:us-east-1:111111111111:key/1"
  tasks_security_group_id   = "sg-1"
  opensearch_enabled        = true
  opensearch_instance_count = 2
}

run "new_domain_on_3_7" {
  command = plan
  assert {
    condition     = aws_opensearch_domain.search[0].engine_version == "OpenSearch_3.7"
    error_message = "16.11: the prod domain is gone; a new one is created straight on OpenSearch_3.7."
  }
  assert {
    condition     = aws_opensearch_domain.search[0].cluster_config[0].instance_type == "t3.small.search"
    error_message = "The node type stays t3.small.search (offered on 2.19 and 3.7)."
  }
}

run "existing_2_x_domain_keeps_its_hop" {
  command = plan
  variables {
    opensearch_engine_version = "OpenSearch_2.19"
  }
  assert {
    condition     = aws_opensearch_domain.search[0].engine_version == "OpenSearch_2.19"
    error_message = "A domain that already runs 2.x still goes one hop per apply (2.19 first)."
  }
}

run "step_2_3_7_keeps_nodes" {
  command = plan
  variables {
    opensearch_engine_version = "OpenSearch_3.7"
    opensearch_instance_count = 4
  }
  assert {
    condition     = aws_opensearch_domain.search[0].engine_version == "OpenSearch_3.7"
    error_message = "aws.opensearch_3 asks for OpenSearch_3.7."
  }
  assert {
    condition     = aws_opensearch_domain.search[0].cluster_config[0].instance_count == 4 && aws_opensearch_domain.search[0].cluster_config[0].zone_awareness_enabled
    error_message = "«Авто» nodes 2 <-> 4 still work on 3.7."
  }
}

run "ten_nodes_two_zones" {
  command = plan
  variables {
    opensearch_engine_version = "OpenSearch_3.7"
    opensearch_instance_count = 10
  }
  assert {
    condition     = aws_opensearch_domain.search[0].cluster_config[0].instance_count == 10 && aws_opensearch_domain.search[0].cluster_config[0].zone_awareness_config[0].availability_zone_count == 2
    error_message = "search.max_nodes 10 (AWS T3 limit): ten nodes, five per zone."
  }
}

run "unknown_version_refused" {
  command = plan
  variables {
    opensearch_engine_version = "OpenSearch_3.9"
  }
  expect_failures = [var.opensearch_engine_version]
}
