# Events pipeline (N-2, 2026-10-26): Kinesis Data Streams for the internal
# domain-event bus. OFF by default (growth.events_stream_enabled = false): then
# nothing below exists and the app keeps events only in its `domain_events`
# table (30-day retention). Turning it on creates the stream and lets the app's
# task role write to it; the app ships to it only when the admin setting
# `events.sink` is `stream` (or `auto` and the daily ceiling is passed).
#
# Cost (AWS pricing page, checked 2026-10-25): on-demand "Standard" has a
# per-stream hourly charge (~$0.04/stream-hour, ~$29/month) plus per-GB ingest
# and retrieval; "On-demand Advantage" (Nov 2025) has no per-stream charge and
# ~$0.032/GB ingest. The stream is created in on-demand Standard; switch the
# mode in the console when volume makes Advantage cheaper.
resource "aws_kinesis_stream" "events" {
  count            = var.growth.events_stream_enabled ? 1 : 0
  name             = "${local.name}-domain-events"
  retention_period = 24
  encryption_type  = "KMS"
  kms_key_id       = module.kms.key_arn

  stream_mode_details {
    stream_mode = "ON_DEMAND"
  }

  tags = local.tags
}

resource "aws_iam_role_policy" "events_stream_put" {
  count = var.growth.events_stream_enabled ? 1 : 0
  name  = "${local.name}-events-stream-put"
  role  = module.ecs.task_role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["kinesis:PutRecord", "kinesis:PutRecords", "kinesis:DescribeStreamSummary"]
        Resource = aws_kinesis_stream.events[0].arn
      },
      {
        Effect   = "Allow"
        Action   = ["kms:GenerateDataKey", "kms:Decrypt"]
        Resource = module.kms.key_arn
      },
    ]
  })
}

output "events_stream_name" {
  value = var.growth.events_stream_enabled ? aws_kinesis_stream.events[0].name : null
}
