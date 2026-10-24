# Load generators for the throw-away load-test stack (infra/envs/loadtest):
# N small Graviton boxes on EC2 Spot, in the stack's public subnet, driven
# only through SSM Run Command (no SSH, no inbound ports). Each box has
#   * k6 (the load tool), python3 (the abort guard), docker (coturn's
#     turnutils_uclient for the TURN test), the `lk` CLI (LiveKit load tester),
#     psql + redis6-cli (box 0 seeds the database from inside the VPC),
#   * the stack's "tasks" security group, so it can reach the private RDS and
#     Redis exactly like an API task does (that is how the data is seeded).
# Spot instances are one-time requests: terminate = gone, nothing restarts.
# Everything carries the stack's tags (Project=lawbid-loadtest, CreatedAt...).
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "name" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "tasks_security_group_id" {
  type        = string
  description = "The stack's ECS tasks security group: grants access to RDS and Redis."
}
variable "generator_count" {
  type        = number
  default     = 1
  description = "How many generator boxes. Hard cap 8 here; the workflow's own cap (profiles.json limits.max_generators) is lower."
  validation {
    condition     = var.generator_count >= 1 && var.generator_count <= 8
    error_message = "generator_count must be 1..8 (cost cap)."
  }
}
variable "instance_type" {
  type        = string
  default     = "c7g.xlarge"
  description = "Graviton, 4 vCPU. k6 does ~1 500 req/s per vCPU on this mix, so 5 boxes cover 5 000 req/s with room."
}
variable "spot" {
  type    = bool
  default = true
}
variable "artifacts_bucket_arn" {
  type        = string
  description = "Bucket the run's files go through (scripts in, results out), prefix loadtest/."
}
variable "web_bucket_name" {
  type        = string
  default     = ""
  description = "The stack's web bucket: box 0 uploads the synthetic static files (assets/) there."
}
variable "secret_arns" {
  type        = list(string)
  default     = []
  description = "Secrets the boxes may read (database master login, Redis URL, LiveKit keys)."
}
variable "kms_key_arn" { type = string }
variable "k6_version" {
  type    = string
  default = "v2.3.0"
}
variable "lk_version" {
  type        = string
  default     = "2.13.0"
  description = "livekit-cli release (github.com/livekit/livekit-cli/releases) - the LiveKit load tester is `lk load-test`."
}
variable "coturn_image" {
  type    = string
  default = "coturn/coturn:4.6.3"
}
variable "tags" {
  type    = map(string)
  default = {}
}

data "aws_region" "current" {}
data "aws_ssm_parameter" "ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

resource "aws_security_group" "this" {
  name        = "${var.name}-loadgen"
  description = "Load generators: outbound only (SSM Run Command, no inbound)"
  vpc_id      = var.vpc_id
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = merge(var.tags, { Name = "${var.name}-loadgen" })
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "this" {
  name               = "${var.name}-loadgen"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "work" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${var.artifacts_bucket_arn}/loadtest/*"]
  }
  statement {
    actions   = ["s3:ListBucket"]
    resources = [var.artifacts_bucket_arn]
  }
  dynamic "statement" {
    for_each = var.web_bucket_name == "" ? [] : [1]
    content {
      actions   = ["s3:PutObject"]
      resources = ["arn:aws:s3:::${var.web_bucket_name}/assets/*"]
    }
  }
  statement {
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [var.kms_key_arn]
  }
  dynamic "statement" {
    for_each = length(var.secret_arns) > 0 ? [1] : []
    content {
      actions   = ["secretsmanager:GetSecretValue"]
      resources = var.secret_arns
    }
  }
  # the TURN secret (SSM parameter /<stack>/turn/static-auth-secret) and the
  # CloudWatch numbers of the TURN box are read by the test scripts
  statement {
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${data.aws_region.current.name}:*:parameter/${var.name}/*"]
  }
  statement {
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "work" {
  name   = "loadgen-work"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.work.json
}

resource "aws_iam_instance_profile" "this" {
  name = "${var.name}-loadgen"
  role = aws_iam_role.this.name
  tags = var.tags
}

resource "aws_instance" "this" {
  count                  = var.generator_count
  ami                    = data.aws_ssm_parameter.ami.value
  instance_type          = var.instance_type
  subnet_id              = var.subnet_ids[count.index % length(var.subnet_ids)]
  vpc_security_group_ids = [aws_security_group.this.id, var.tasks_security_group_id]
  iam_instance_profile   = aws_iam_instance_profile.this.name
  tags                   = merge(var.tags, { Name = "${var.name}-loadgen-${count.index}", Role = "loadgen" })
  volume_tags            = var.tags

  # a public address: generators reach the ALB by its public name and the
  # TURN / LiveKit boxes by their Elastic IPs (that is what real phones do)
  associate_public_ip_address = true

  dynamic "instance_market_options" {
    for_each = var.spot ? [1] : []
    content {
      market_type = "spot"
      spot_options {
        spot_instance_type             = "one-time"
        instance_interruption_behavior = "terminate"
      }
    }
  }

  metadata_options {
    http_tokens = "required" # IMDSv2 only
  }
  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    k6_version   = var.k6_version
    lk_version   = var.lk_version
    coturn_image = var.coturn_image
  })
}

output "instance_ids" { value = aws_instance.this[*].id }
output "public_ips" { value = aws_instance.this[*].public_ip }
output "security_group_id" { value = aws_security_group.this.id }
