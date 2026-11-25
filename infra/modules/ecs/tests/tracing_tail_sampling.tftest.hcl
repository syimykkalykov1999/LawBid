# Item 14 (25.11, architecture vs big platforms O3 + O4): the ADOT collector
# sidecar keeps every trace with an error or slower than tracing_slow_ms and
# tracing_sample_ratio of the rest (tail_sampling processor), and the app
# records every request so the collector sees the errors.
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
  api_image                        = "1.dkr.ecr.us-east-1.amazonaws.com/lawbid-api:abc"
  admin_image                      = "1.dkr.ecr.us-east-1.amazonaws.com/lawbid-admin:abc"
  kms_key_arn                      = "arn:aws:kms:us-east-1:111111111111:key/k"
  migrator_database_url_secret_arn = "arn:aws:secretsmanager:us-east-1:111111111111:secret:m"
  api_env                          = { FOO = "bar" }
  secret_arns                      = { JWT = "arn:aws:secretsmanager:us-east-1:111111111111:secret:j" }
  alb_resource_label               = "app/lb/1/targetgroup/api/1"
  tracing_enabled                  = true
}

run "tail_sampling_keeps_errors_and_slow_traces" {
  command = plan
  variables {
    tracing_slow_ms      = 750
    tracing_sample_ratio = 0.05
  }
  assert {
    condition     = endswith(local.adot_container[0].image, ":v0.51.0")
    error_message = "the ADOT collector must be v0.51.0 (newest stable, tail_sampling built in)"
  }
  assert {
    condition     = yamldecode(local.adot_config).service.pipelines.traces.processors == ["memory_limiter", "tail_sampling", "batch"]
    error_message = "traces pipeline: memory_limiter -> tail_sampling -> batch"
  }
  assert {
    condition     = contains([for p in yamldecode(local.adot_config).processors.tail_sampling.policies : p.status_code.status_codes[0] if p.type == "status_code"], "ERROR")
    error_message = "every trace with an error must be kept (status_code ERROR policy)"
  }
  assert {
    condition     = [for p in yamldecode(local.adot_config).processors.tail_sampling.policies : p.latency.threshold_ms if p.type == "latency"] == [750]
    error_message = "the slow-trace threshold must come from tracing_slow_ms"
  }
  assert {
    condition     = [for p in yamldecode(local.adot_config).processors.tail_sampling.policies : p.probabilistic.sampling_percentage if p.type == "probabilistic"] == [5]
    error_message = "the rest is kept at tracing_sample_ratio (5 %)"
  }
  assert {
    condition     = contains([for e in jsondecode(aws_ecs_task_definition.api.container_definitions)[0].environment : "${e.name}=${e.value}"], "OTEL_TRACES_SAMPLER=always_on")
    error_message = "with tail sampling the app must record every request (OTEL_TRACES_SAMPLER=always_on)"
  }
  assert {
    condition     = contains([for c in jsondecode(aws_ecs_task_definition.worker.container_definitions) : c.name], "adot")
    error_message = "the worker task carries the collector sidecar too"
  }
}

run "head_sampling_when_tail_sampling_is_off" {
  command = plan
  variables {
    tracing_tail_sampling = false
  }
  assert {
    condition     = !contains(keys(yamldecode(local.adot_config).processors), "tail_sampling")
    error_message = "tracing_tail_sampling = false must leave tail_sampling out"
  }
  assert {
    condition     = contains([for e in jsondecode(aws_ecs_task_definition.api.container_definitions)[0].environment : "${e.name}=${e.value}"], "OTEL_TRACES_SAMPLER=parentbased_traceidratio")
    error_message = "head sampling: ParentBased TraceIdRatio in the app"
  }
}

run "slow_threshold_must_be_whole_ms" {
  command = plan
  variables {
    tracing_slow_ms = 0
  }
  expect_failures = [var.tracing_slow_ms]
}
