# Item 28 (AU4, owner 25.11): the «read copy first» control reaches the Lambda
# only through CONTROLS_BUCKET / CONTROLS_KEY (economy job -> S3), the lesson
# of KNOWN_ERRORS 183 (a declared variable that never reached the Lambda).
#   terraform -chdir=infra/modules/db-autoscale init -backend=false
#   terraform -chdir=infra/modules/db-autoscale test

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  mock_data "aws_region" {
    defaults = { region = "us-east-1", name = "us-east-1" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111111111111" }
  }
}
mock_provider "archive" {}

variables {
  name             = "t"
  db_instance_id   = "t-postgres"
  alerts_topic_arn = "arn:aws:sns:us-east-1:111111111111:t"
  kms_key_arn      = "arn:aws:kms:us-east-1:111111111111:key/1"
}

run "owner_control_reaches_the_lambda" {
  command = plan
  variables {
    controls_bucket = "docs-bucket"
  }
  assert {
    condition     = aws_lambda_function.this.environment[0].variables["CONTROLS_BUCKET"] == "docs-bucket"
    error_message = "The Lambda must know the bucket with the owner's read-copy-first control."
  }
  assert {
    condition     = aws_lambda_function.this.environment[0].variables["CONTROLS_KEY"] == "ops/scale-controls.json"
    error_message = "The Lambda must know the key of the owner's control."
  }
}

run "no_bucket_keeps_todays_resize" {
  command = plan
  assert {
    condition     = aws_lambda_function.this.environment[0].variables["CONTROLS_BUCKET"] == ""
    error_message = "No bucket = no control = the primary is resized as before."
  }
}
