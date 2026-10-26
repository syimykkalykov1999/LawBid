# Owner 2026-10-22: self-hosted LiveKit SFU (group calls, video rooms). One
# EC2 box (Graviton) running the official livekit/livekit-server image plus
# Caddy (livekit/caddyl4) for TLS, exactly the layout of LiveKit's own VM
# deployment guide (https://docs.livekit.io/transport/self-hosting/vm/):
#
#   443/tcp  Caddy: wss://livekit.<domain> -> 7880 (signal), and
#            TURN/TLS on livekit-turn.<domain> -> 5349 (SNI routing, Layer 4)
#   80/tcp   Let's Encrypt (Caddy gets and renews the certificates itself;
#            an ACM certificate cannot be exported to a plain EC2 box)
#   7881/tcp WebRTC over TCP        3478/udp TURN/UDP + STUN
#   50000-60000/udp  WebRTC media
#
# State: LiveKit runs fine on one node without Redis. With Redis it runs
# "fully distributed" (clients may hit any node), which is how nodes are
# added later, so the box is already wired to the existing ElastiCache (its
# own database number 1; BullMQ stays in 0), no extra Redis bill.
#
# The API key / secret are generated here, stored in Secrets Manager and
# handed to the API as LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET.
# Runbook, cost and the owner's steps: docs/runbooks/LIVEKIT.md.
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
  description = "A PUBLIC subnet (the SFU needs a public address)."
}
variable "domain" {
  type        = string
  description = "Base domain; the SFU answers on livekit.<domain> and livekit-turn.<domain>."
}
variable "hosted_zone_id" {
  type        = string
  default     = null
  description = "Route 53 zone; set = both DNS records are created. null = add the two A records by hand (Namecheap)."
}
variable "instance_type" {
  type        = string
  default     = "c7g.medium"
  description = "Graviton. c7g.medium (1 vCPU, 2 GB, ~$26/month) is the cheapest compute-optimised size; LiveKit is CPU- and bandwidth-bound, so c7g.large/xlarge is the next step up. The burstable t4g family also works for tests but throttles under sustained load."
}
variable "livekit_image" {
  type    = string
  default = "livekit/livekit-server:v1.13.10"
}
variable "caddy_image" {
  type    = string
  default = "livekit/caddyl4:v2.11.3"
}
variable "use_redis" {
  type        = bool
  default     = true
  description = "Connect LiveKit to the existing ElastiCache (needed to run more than one node)."
}
variable "redis_endpoint" {
  type    = string
  default = ""
}
variable "redis_url_secret_arn" {
  type        = string
  default     = ""
  description = "Secrets Manager secret holding rediss://:<password>@<host>:6379 (modules/redis); the box reads the password from it at boot."
}
variable "redis_security_group_id" {
  type    = string
  default = ""
}
variable "kms_key_arn" { type = string }
variable "alerts_topic_arn" {
  type    = string
  default = null
}
variable "egress_alarm_gb_per_day" {
  type        = number
  default     = 50
  description = "Alarm when the box sends more than this many GB in 24 h (about $0.09/GB). 0 = no alarm."
}
variable "recovery_window_in_days" {
  type        = number
  default     = 30
  description = "Days a deleted secret can be restored. 0 = deleted at once (throw-away load-test stacks, so the same name can be created again)."
}
variable "tags" {
  type    = map(string)
  default = {}
}

data "aws_region" "current" {}

locals {
  host      = "livekit.${var.domain}"
  turn_host = "livekit-turn.${var.domain}"
}

# Amazon Linux 2023 arm64: AWS CLI, SSM agent and docker are in its repositories.
data "aws_ssm_parameter" "ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

# --- API key / secret ------------------------------------------------------
resource "random_password" "api_key" {
  length  = 16
  special = false
  upper   = false
}

resource "random_password" "api_secret" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "url" {
  name                    = "${var.name}/LIVEKIT_URL"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = var.tags
}
resource "aws_secretsmanager_secret_version" "url" {
  secret_id     = aws_secretsmanager_secret.url.id
  secret_string = "wss://${local.host}"
}

resource "aws_secretsmanager_secret" "api_key" {
  name                    = "${var.name}/LIVEKIT_API_KEY"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = var.tags
}
resource "aws_secretsmanager_secret_version" "api_key" {
  secret_id     = aws_secretsmanager_secret.api_key.id
  secret_string = "API${random_password.api_key.result}"
}

resource "aws_secretsmanager_secret" "api_secret" {
  name                    = "${var.name}/LIVEKIT_API_SECRET"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = var.tags
}
resource "aws_secretsmanager_secret_version" "api_secret" {
  secret_id     = aws_secretsmanager_secret.api_secret.id
  secret_string = random_password.api_secret.result
}

# --- network -----------------------------------------------------------------
resource "aws_eip" "this" {
  domain = "vpc"
  tags   = merge(var.tags, { Name = "${var.name}-livekit" })
}

resource "aws_security_group" "this" {
  name        = "${var.name}-livekit"
  description = "LiveKit SFU: 80/443, 7881, TURN 3478, media 50000-60000. No SSH (use SSM)."
  vpc_id      = var.vpc_id
  tags        = merge(var.tags, { Name = "${var.name}-livekit" })

  ingress {
    description = "Lets Encrypt HTTP challenge"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTPS signal (wss) and TURN/TLS, routed by name"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "WebRTC over TCP (fallback)"
    from_port   = 7881
    to_port     = 7881
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "TURN/UDP and STUN"
    from_port   = 3478
    to_port     = 3478
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "WebRTC media over UDP"
    from_port   = 50000
    to_port     = 60000
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

# The SFU may talk to the shared Redis (its own database number).
resource "aws_vpc_security_group_ingress_rule" "redis" {
  count                        = var.use_redis ? 1 : 0
  security_group_id            = var.redis_security_group_id
  referenced_security_group_id = aws_security_group.this.id
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
  description                  = "LiveKit SFU"
}

# --- instance ----------------------------------------------------------------
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
  name               = "${var.name}-livekit"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "secrets" {
  statement {
    actions = ["secretsmanager:GetSecretValue"]
    resources = concat(
      [aws_secretsmanager_secret.api_key.arn, aws_secretsmanager_secret.api_secret.arn],
      var.use_redis ? [var.redis_url_secret_arn] : [],
    )
  }
  statement {
    actions   = ["kms:Decrypt"]
    resources = [var.kms_key_arn]
  }
}

resource "aws_iam_role_policy" "secrets" {
  name   = "read-livekit-secrets"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.secrets.json
}

resource "aws_iam_instance_profile" "this" {
  name = "${var.name}-livekit"
  role = aws_iam_role.this.name
  tags = var.tags
}

resource "aws_instance" "this" {
  ami                    = data.aws_ssm_parameter.ami.value
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.this.id]
  iam_instance_profile   = aws_iam_instance_profile.this.name
  tags                   = merge(var.tags, { Name = "${var.name}-livekit" })

  metadata_options {
    http_tokens = "required" # IMDSv2 only
  }
  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    region         = data.aws_region.current.name
    host           = local.host
    turn_host      = local.turn_host
    external_ip    = aws_eip.this.public_ip
    livekit_image  = var.livekit_image
    caddy_image    = var.caddy_image
    key_secret     = aws_secretsmanager_secret.api_key.name
    secret_secret  = aws_secretsmanager_secret.api_secret.name
    use_redis      = var.use_redis
    redis_endpoint = var.redis_endpoint
    redis_secret   = var.redis_url_secret_arn
  })
  # A new image tag, key or address rewrites the config: replace the box
  # (the Elastic IP stays, calls reconnect within a minute).
  user_data_replace_on_change = true

  lifecycle {
    precondition {
      condition     = !var.use_redis || (var.redis_endpoint != "" && var.redis_url_secret_arn != "" && var.redis_security_group_id != "")
      error_message = "use_redis needs redis_endpoint, redis_url_secret_arn and redis_security_group_id."
    }
  }
}

resource "aws_eip_association" "this" {
  instance_id   = aws_instance.this.id
  allocation_id = aws_eip.this.id
}

# --- DNS (only with a Route 53 zone) -------------------------------------------
resource "aws_route53_record" "host" {
  for_each = var.hosted_zone_id == null ? {} : { signal = local.host, turn = local.turn_host }
  zone_id  = var.hosted_zone_id
  name     = each.value
  type     = "A"
  ttl      = 300
  records  = [aws_eip.this.public_ip]
}

# --- alarms ----------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "system_status" {
  count               = var.alerts_topic_arn == null ? 0 : 1
  alarm_name          = "${var.name}-livekit-system-status"
  alarm_description   = "LawBid: Сервер групповых звонков (LiveKit) сломался на стороне AWS; он восстанавливается сам. Если письмо повторяется — docs/runbooks/LIVEKIT.md (EN: EC2 system status check failed, auto-recover requested.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  period              = 60
  threshold           = 0
  statistic           = "Maximum"
  metric_name         = "StatusCheckFailed_System"
  namespace           = "AWS/EC2"
  dimensions          = { InstanceId = aws_instance.this.id }
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alerts_topic_arn, "arn:aws:automate:${data.aws_region.current.name}:ec2:recover"]
  ok_actions          = [var.alerts_topic_arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "instance_status" {
  count               = var.alerts_topic_arn == null ? 0 : 1
  alarm_name          = "${var.name}-livekit-instance-status"
  alarm_description   = "LawBid: Сервер групповых звонков (LiveKit) не отвечает на проверки 5 минут. Что делать: docs/runbooks/LIVEKIT.md «Если не работает» (EN: EC2 instance status check failed.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 5
  period              = 60
  threshold           = 0
  statistic           = "Maximum"
  metric_name         = "StatusCheckFailed_Instance"
  namespace           = "AWS/EC2"
  dimensions          = { InstanceId = aws_instance.this.id }
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alerts_topic_arn]
  ok_actions          = [var.alerts_topic_arn]
  tags                = var.tags
}

# CPU is what limits an SFU: sustained > 70 % means add a node or a bigger size.
resource "aws_cloudwatch_metric_alarm" "cpu" {
  count               = var.alerts_topic_arn == null ? 0 : 1
  alarm_name          = "${var.name}-livekit-cpu"
  alarm_description   = "LawBid: Сервер групповых звонков (LiveKit) загружен больше чем на 70 % полчаса. Пора увеличить размер или добавить второй сервер: docs/runbooks/LIVEKIT.md «Как расти» (EN: CPU > 70% for 30 min.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 6
  period              = 300
  threshold           = 70
  statistic           = "Average"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  dimensions          = { InstanceId = aws_instance.this.id }
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alerts_topic_arn]
  ok_actions          = [var.alerts_topic_arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "egress" {
  count               = var.alerts_topic_arn != null && var.egress_alarm_gb_per_day > 0 ? 1 : 0
  alarm_name          = "${var.name}-livekit-egress"
  alarm_description   = "LawBid: Сервер групповых звонков (LiveKit) отправил больше ${var.egress_alarm_gb_per_day} ГБ за сутки (≈ $0.09 за ГБ). Если это не рост числа звонков — docs/runbooks/LIVEKIT.md (EN: LiveKit egress above the daily ceiling.)"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 86400
  threshold           = var.egress_alarm_gb_per_day * 1000000000
  statistic           = "Sum"
  metric_name         = "NetworkOut"
  namespace           = "AWS/EC2"
  dimensions          = { InstanceId = aws_instance.this.id }
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alerts_topic_arn]
  ok_actions          = [var.alerts_topic_arn]
  tags                = var.tags
}

output "public_ip" { value = aws_eip.this.public_ip }
output "instance_id" { value = aws_instance.this.id }
output "security_group_id" { value = aws_security_group.this.id }
output "dns_names" {
  value       = [local.host, local.turn_host]
  description = "Two A records pointing at public_ip (created here only with hosted_zone_id)."
}
output "secret_arns" {
  value = {
    LIVEKIT_URL        = aws_secretsmanager_secret.url.arn
    LIVEKIT_API_KEY    = aws_secretsmanager_secret.api_key.arn
    LIVEKIT_API_SECRET = aws_secretsmanager_secret.api_secret.arn
  }
  description = "Env var -> secret, injected into the API and worker tasks."
}
