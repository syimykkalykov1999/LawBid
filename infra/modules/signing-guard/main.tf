# S11-10: "is the image that just started signed?" — detective control, since ECS
# itself cannot refuse an unsigned image. EventBridge sends every ECS task that
# reaches RUNNING in the cluster to a tiny Lambda (lambda/handler.py) that looks
# for the cosign signature tag in ECR and writes one line to the alerts topic when
# it is missing. Cost: a few Lambda invocations per deploy (cents per month).
# Enable with signing_guard_enabled = true AFTER the first signed release has run
# (otherwise every task of an older, unsigned release alerts once).
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 5.60" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }
}

variable "name" { type = string }
variable "cluster_arn" {
  type        = string
  description = "ECS cluster whose tasks are checked."
}
variable "alerts_topic_arn" { type = string }
variable "ecr_registry_host" {
  type        = string
  description = "<account>.dkr.ecr.<region>.amazonaws.com"
}
variable "ecr_repository_arns" {
  type        = list(string)
  description = "Repositories the images come from (read: DescribeImages)."
}
variable "signed_repos" {
  type    = list(string)
  default = ["lawbid-api", "lawbid-admin"]
}
variable "tags" {
  type    = map(string)
  default = {}
}

locals {
  fn_name = "${var.name}-signing-guard"
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  excludes    = ["tests", "__pycache__"]
  output_path = "${path.module}/.signing-guard-${var.name}.zip"
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = local.fn_name
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda" {
  role = aws_iam_role.lambda.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["ecr:DescribeImages"], Resource = var.ecr_repository_arns },
      { Effect = "Allow", Action = ["sns:Publish"], Resource = var.alerts_topic_arn },
    ]
  })
}

resource "aws_lambda_function" "this" {
  function_name    = local.fn_name
  description      = "Alerts when an ECS task starts from an image without a cosign signature"
  role             = aws_iam_role.lambda.arn
  runtime          = "python3.12"
  architectures    = ["arm64"]
  handler          = "handler.lambda_handler"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  timeout          = 30
  memory_size      = 128
  environment {
    variables = {
      ALERTS_TOPIC_ARN  = var.alerts_topic_arn
      ECR_REGISTRY_HOST = var.ecr_registry_host
      SIGNED_REPOS      = join(",", var.signed_repos)
    }
  }
  tags = var.tags
}

resource "aws_cloudwatch_event_rule" "task_running" {
  name        = local.fn_name
  description = "ECS task reached RUNNING in ${var.name}: check that its image is signed"
  event_pattern = jsonencode({
    source        = ["aws.ecs"]
    "detail-type" = ["ECS Task State Change"]
    detail = {
      clusterArn = [var.cluster_arn]
      lastStatus = ["RUNNING"]
    }
  })
  tags = var.tags
}

resource "aws_cloudwatch_event_target" "lambda" {
  rule = aws_cloudwatch_event_rule.task_running.name
  arn  = aws_lambda_function.this.arn
}

resource "aws_lambda_permission" "events" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.task_running.arn
}

output "function_name" { value = aws_lambda_function.this.function_name }
