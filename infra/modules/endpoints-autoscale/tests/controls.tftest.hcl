# 16.11: the owner's admin «Вкл / Выкл» for the endpoints reaches the Lambda
# only through CONTROLS_BUCKET / CONTROLS_KEY (economy job -> S3). Without
# them the Lambda read «auto» forever and ignored both buttons.
#   terraform -chdir=infra/modules/endpoints-autoscale init -backend=false
#   terraform -chdir=infra/modules/endpoints-autoscale test

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
}
mock_provider "archive" {}

variables {
  name              = "t"
  vpc_id            = "vpc-1"
  subnet_ids        = ["subnet-1"]
  security_group_id = "sg-1"
  nat_gateway_ids   = ["nat-1"]
  alerts_topic_arn  = "arn:aws:sns:us-east-1:111111111111:t"
  kms_key_arn       = "arn:aws:kms:us-east-1:111111111111:key/1"
  controls_bucket   = "docs-bucket"
}

run "owner_control_reaches_the_lambda" {
  command = plan
  assert {
    condition     = aws_lambda_function.this.environment[0].variables["CONTROLS_BUCKET"] == "docs-bucket"
    error_message = "The Lambda must know the bucket with the owner's admin control."
  }
  assert {
    condition     = aws_lambda_function.this.environment[0].variables["CONTROLS_KEY"] == "ops/scale-controls.json"
    error_message = "The Lambda must know the key of the owner's admin control."
  }
}
