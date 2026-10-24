# Owner 2026-10-20: calls need a TURN relay (phones behind carrier NAT cannot
# reach each other with STUN alone). One small coturn on EC2 in a public
# subnet, ≈ $7–8/month. The API already hands out short-lived logins from
# TURN_URLS + TURN_SECRET (apps/api/src/modules/calls/calls.service.ts,
# "TURN REST API" scheme = coturn use-auth-secret), so no code changes: the
# owner pastes the URL and the secret in the admin (Интеграции → TURN).
# The secret is generated here, kept in SSM (SecureString) and never printed
# by plan/apply (sensitive). Runbook: docs/runbooks/TURN.md.
terraform {
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.60" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

variable "name" { type = string }
variable "vpc_id" { type = string }
variable "subnet_id" {
  type        = string
  description = "A PUBLIC subnet (the relay needs a public address)."
}
variable "realm" { type = string }
variable "secondary_subnet_id" {
  type        = string
  default     = null
  description = "A PUBLIC subnet in ANOTHER Availability Zone. Set = a second coturn there (same secret and security group, own Elastic IP, about $7-8/month). null = one relay."
}
variable "alerts_topic_arn" {
  type        = string
  default     = null
  description = "SNS topic for the instance-status, health and traffic alarms; null = no alarms."
}
variable "traffic_alarm_gb_per_day" {
  type        = number
  default     = 20
  description = "Alarm when the relays together send more than this many GB in 24 h (outbound traffic is about $0.09/GB; the first 100 GB a month of the whole account are free). 0 = no alarm."
}
variable "hosted_zone_id" {
  type        = string
  default     = null
  description = "Route 53 zone of the domain. Set = Terraform creates turn.<realm> (every address, health-checked). null = DNS is kept by hand (Namecheap): one A record `turn` per address in `public_ips`."
}
variable "health_checks" {
  type        = bool
  default     = true
  description = "Route 53 TCP health check on port 3478 of each relay (about $0.50-0.75/month each): an unhealthy relay leaves the DNS answer (only with hosted_zone_id) and raises an alarm. Their CloudWatch metric exists in us-east-1 only; set false in other regions."
}
variable "instance_type" {
  type        = string
  default     = "t4g.nano"
  description = "Owner 2026-10-23: prod runs t4g.small (about $12.3/month vs about $3.1 for t4g.nano, us-east-1 on-demand list price, approximate). Staging/loadtest keep the cheap default."
}
variable "turn_total_quota" {
  type        = number
  default     = null
  description = "coturn total-quota (simultaneous relay allocations PER SERVER; 2 allocations = about 1 relayed call). null = take it from the instance type (local.sizes). Set a number to override."
}
variable "denied_peer_cidrs" {
  type        = list(string)
  description = "Private ranges the relay must never reach (incl. this VPC)."
  default = [
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "127.0.0.0/8",
    "169.254.0.0/16",
    "100.64.0.0/10",
  ]
}
variable "tags" {
  type    = map(string)
  default = {}
}

# Ubuntu 24.04 LTS arm64 (coturn is in its repository; Amazon Linux 2023's is not).
data "aws_ssm_parameter" "ami" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id"
}

resource "random_password" "secret" {
  length  = 48
  special = false
}

resource "aws_ssm_parameter" "secret" {
  name  = "/${var.name}/turn/static-auth-secret"
  type  = "SecureString"
  value = random_password.secret.result
  tags  = var.tags
}

resource "aws_eip" "this" {
  domain = "vpc"
  tags   = merge(var.tags, { Name = "${var.name}-turn" })
}

resource "aws_security_group" "this" {
  name        = "${var.name}-turn"
  description = "coturn: TURN 3478, TLS 5349, relay ports. No SSH (use SSM)."
  vpc_id      = var.vpc_id
  tags        = merge(var.tags, { Name = "${var.name}-turn" })

  ingress {
    description = "TURN over UDP"
    from_port   = 3478
    to_port     = 3478
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "TURN over TCP"
    from_port   = 3478
    to_port     = 3478
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "TURN over TLS (certificate added as a second step)"
    from_port   = 5349
    to_port     = 5349
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "Relay ports"
    from_port   = 49152
    to_port     = 65535
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
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
  name               = "${var.name}-turn"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

# Session Manager instead of SSH.
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "secret" {
  statement {
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.secret.arn]
  }
}

resource "aws_iam_role_policy" "secret" {
  name   = "read-turn-secret"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.secret.json
}

# The box reports its allocation count (systemd timer, user-data) to CloudWatch.
data "aws_iam_policy_document" "metrics" {
  statement {
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["LawBid/TURN"]
    }
  }
}

resource "aws_iam_role_policy" "metrics" {
  name   = "put-turn-metrics"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.metrics.json
}

resource "aws_iam_instance_profile" "this" {
  name = "${var.name}-turn"
  role = aws_iam_role.this.name
  tags = var.tags
}

resource "aws_instance" "this" {
  ami                    = data.aws_ssm_parameter.ami.value
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.this.id]
  iam_instance_profile   = aws_iam_instance_profile.this.name
  tags                   = merge(var.tags, { Name = "${var.name}-turn" })

  metadata_options {
    http_tokens = "required" # IMDSv2 only
  }
  root_block_device {
    volume_size = 8
    volume_type = "gp3"
    encrypted   = true
  }

  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    realm        = var.realm
    external_ip  = aws_eip.this.public_ip
    secret_param = aws_ssm_parameter.secret.name
    region       = data.aws_region.current.name
    denied       = var.denied_peer_cidrs
    quota        = local.quota
  })
  # A new secret, address or quota rewrites the config: replace the box.
  # NOTE: both relays change in the same apply - roll out the second one
  # first (docs/runbooks/TURN.md, "Смена размера").
  user_data_replace_on_change = true
}

data "aws_region" "current" {}

# --- size ladder: instance type -> coturn quota, network baseline ---------------
# RULE for `quota`: one allocation carries about one direction of one call. Audio
# (Opus) is about 0.1 Mbps, video about 1.5 Mbps. Relayed calls are mostly
# audio; planning mix 90 % audio / 10 % video = about 0.25 Mbps per allocation.
# quota = the instance's SUSTAINED network baseline (`baseline_mbps`, AWS docs as
# we know them: check the EC2 instance-types page when adding a type) / 0.25,
# rounded DOWN to a tidy number. Burstable t4g types may burst far above the
# baseline for a while (network credits), so the baseline is the safe long-run
# number, not a hard wall. nano 32/0.25 = 128 -> 100; micro 64/0.25 = 256 -> 200;
# small 128/0.25 = 512 -> 500; medium 1000; large 2000. The c6gn/c7gn rows are
# limited by CPU (about 1000 relays per vCPU) and by the 16 384 relay ports, not
# by the network, so they stay far below baseline/0.25. A relay pair
# (turn_second_enabled) doubles the total. An unknown type falls back to the
# nano value (safe).
#
# bps-capacity stays 0 (unlimited): the quota already bounds the number of
# streams, and a per-server bps cap would degrade audio for everybody at once
# (all allocations share it) instead of refusing only the newest call; the
# network alarm (ha.tf) warns before the baseline is reached.
locals {
  sizes = {
    "t4g.nano"    = { quota = 100, baseline_mbps = 32 }
    "t4g.micro"   = { quota = 200, baseline_mbps = 64 }
    "t4g.small"   = { quota = 500, baseline_mbps = 128 }
    "t4g.medium"  = { quota = 1000, baseline_mbps = 256 }
    "t4g.large"   = { quota = 2000, baseline_mbps = 512 }
    "c6gn.large"  = { quota = 2000, baseline_mbps = 3125 }
    "c6gn.xlarge" = { quota = 4000, baseline_mbps = 6250 }
    "c7gn.large"  = { quota = 2000, baseline_mbps = 6250 }
    "c7gn.xlarge" = { quota = 4000, baseline_mbps = 12500 }
  }
  size          = lookup(local.sizes, var.instance_type, local.sizes["t4g.nano"])
  quota         = var.turn_total_quota != null ? var.turn_total_quota : local.size.quota
  baseline_mbps = local.size.baseline_mbps
  burstable     = startswith(var.instance_type, "t")
}

resource "aws_eip_association" "this" {
  instance_id   = aws_instance.this.id
  allocation_id = aws_eip.this.id
}

output "public_ip" { value = aws_eip.this.public_ip }
output "public_ips" {
  value       = [for r in local.relays : r.ip]
  description = "All relay addresses. Without hosted_zone_id: one A record `turn` per address (Namecheap)."
}
output "total_quota" {
  value       = local.quota
  description = "coturn total-quota per server (allocations)."
}
output "secret_parameter" { value = aws_ssm_parameter.secret.name }
output "turn_url" {
  value       = "turn:${var.realm == "" ? aws_eip.this.public_ip : "turn.${var.realm}"}:3478?transport=udp,turn:${var.realm == "" ? aws_eip.this.public_ip : "turn.${var.realm}"}:3478?transport=tcp"
  description = "Paste into admin → Интеграции → TURN → urls (after the turn.<domain> record exists)."
}
