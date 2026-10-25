# CloudTrail investigation with Athena (2026-10-25). The trail bucket
# (modules/security-baseline) already holds every API call; this module makes
# it searchable in SQL without loading anything:
#   * a Glue table over s3://<trail bucket>/AWSLogs/<account>/CloudTrail/ with
#     PARTITION PROJECTION (region + day computed by Athena, no crawler, no
#     MSCK REPAIR, no partition cost);
#   * an Athena workgroup with its own results bucket (30-day expiry), the
#     result files encrypted, and a per-query scan cap so a careless query
#     cannot cost more than a few cents;
#   * saved named queries: who deleted something, console logins, failed
#     authentication / denied calls, IAM changes, root user activity.
# Cost: Athena $5 per TB scanned (a week of this account's trail is a few MB:
# a fraction of a cent per query); Glue catalog and the empty workgroup are
# free; results bucket pennies. ~$0 idle. Reading the logs needs
# kms:Decrypt on the trail key (the key policy already lets the account's
# principals decrypt CloudTrail objects).
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "name" { type = string }
variable "enabled" {
  type    = bool
  default = true
}
variable "trail_bucket" {
  type        = string
  description = "Bucket the trail writes to (module.security_baseline.cloudtrail_bucket)."
}
variable "regions" {
  type        = list(string)
  default     = ["us-east-1", "us-west-2"]
  description = "Regions in the partition projection. Global-service events are logged under us-east-1. Add a region if the region-lock SCP is ever relaxed."
}
variable "projection_start" {
  type        = string
  default     = "2026/10/01"
  description = "First day (yyyy/MM/dd) that can have logs; earlier days are not scanned."
}
variable "scan_cutoff_bytes" {
  type        = number
  default     = 10737418240
  description = "A query that would scan more than this (10 GB) is cancelled."
}
variable "tags" {
  type    = map(string)
  default = {}
}

data "aws_caller_identity" "current" {}

locals {
  on         = var.enabled ? 1 : 0
  acct       = data.aws_caller_identity.current.account_id
  db         = replace("${var.name}_security", "-", "_")
  results    = "${var.name}-athena-results-${local.acct}"
  recent     = "day >= date_format(date_add('day', -7, current_date), '%Y/%m/%d')"
  table_name = "cloudtrail"
}

resource "aws_s3_bucket" "results" {
  count  = local.on
  bucket = local.results
  tags   = var.tags
}

resource "aws_s3_bucket_public_access_block" "results" {
  count                   = local.on
  bucket                  = aws_s3_bucket.results[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "results" {
  count  = local.on
  bucket = aws_s3_bucket.results[0].id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "results" {
  count  = local.on
  bucket = aws_s3_bucket.results[0].id
  rule {
    id     = "expire"
    status = "Enabled"
    filter {}
    expiration { days = 30 }
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
}

data "aws_iam_policy_document" "results_tls" {
  count = local.on
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.results[0].arn,
      "${aws_s3_bucket.results[0].arn}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "results" {
  count      = local.on
  bucket     = aws_s3_bucket.results[0].id
  policy     = data.aws_iam_policy_document.results_tls[0].json
  depends_on = [aws_s3_bucket_public_access_block.results]
}

resource "aws_athena_workgroup" "security" {
  count         = local.on
  name          = "${var.name}-security"
  description   = "CloudTrail investigations (saved queries: ${var.name}-*)"
  force_destroy = true
  configuration {
    enforce_workgroup_configuration    = true
    publish_cloudwatch_metrics_enabled = false
    bytes_scanned_cutoff_per_query     = var.scan_cutoff_bytes
    engine_version { selected_engine_version = "Athena engine version 3" }
    result_configuration {
      output_location = "s3://${aws_s3_bucket.results[0].id}/results/"
      encryption_configuration { encryption_option = "SSE_S3" }
    }
  }
  tags = var.tags
}

resource "aws_glue_catalog_database" "security" {
  count = local.on
  name  = local.db
}

resource "aws_glue_catalog_table" "cloudtrail" {
  count         = local.on
  database_name = aws_glue_catalog_database.security[0].name
  name          = local.table_name
  table_type    = "EXTERNAL_TABLE"

  parameters = {
    EXTERNAL                       = "TRUE"
    "projection.enabled"           = "true"
    "projection.region.type"       = "enum"
    "projection.region.values"     = join(",", var.regions)
    "projection.day.type"          = "date"
    "projection.day.format"        = "yyyy/MM/dd"
    "projection.day.range"         = "${var.projection_start},NOW"
    "projection.day.interval"      = "1"
    "projection.day.interval.unit" = "DAYS"
    "storage.location.template"    = "s3://${var.trail_bucket}/AWSLogs/${local.acct}/CloudTrail/$${region}/$${day}"
  }

  partition_keys {
    name = "region"
    type = "string"
  }
  partition_keys {
    name = "day"
    type = "string"
  }

  storage_descriptor {
    location      = "s3://${var.trail_bucket}/AWSLogs/${local.acct}/CloudTrail/"
    input_format  = "com.amazon.emr.cloudtrail.CloudTrailInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat"
    ser_de_info {
      serialization_library = "org.apache.hive.hcatalog.data.JsonSerDe"
    }

    columns {
      name = "eventversion"
      type = "string"
    }
    columns {
      name = "useridentity"
      type = "struct<type:string,principalid:string,arn:string,accountid:string,invokedby:string,accesskeyid:string,username:string,sessioncontext:struct<attributes:struct<mfaauthenticated:string,creationdate:string>,sessionissuer:struct<type:string,principalid:string,arn:string,accountid:string,username:string>>>"
    }
    columns {
      name = "eventtime"
      type = "string"
    }
    columns {
      name = "eventsource"
      type = "string"
    }
    columns {
      name = "eventname"
      type = "string"
    }
    columns {
      name = "awsregion"
      type = "string"
    }
    columns {
      name = "sourceipaddress"
      type = "string"
    }
    columns {
      name = "useragent"
      type = "string"
    }
    columns {
      name = "errorcode"
      type = "string"
    }
    columns {
      name = "errormessage"
      type = "string"
    }
    columns {
      name = "requestparameters"
      type = "string"
    }
    columns {
      name = "responseelements"
      type = "string"
    }
    columns {
      name = "additionaleventdata"
      type = "string"
    }
    columns {
      name = "requestid"
      type = "string"
    }
    columns {
      name = "eventid"
      type = "string"
    }
    columns {
      name = "resources"
      type = "array<struct<arn:string,accountid:string,type:string>>"
    }
    columns {
      name = "eventtype"
      type = "string"
    }
    columns {
      name = "apiversion"
      type = "string"
    }
    columns {
      name = "readonly"
      type = "string"
    }
    columns {
      name = "recipientaccountid"
      type = "string"
    }
    columns {
      name = "serviceeventdetails"
      type = "string"
    }
    columns {
      name = "sharedeventid"
      type = "string"
    }
    columns {
      name = "vpcendpointid"
      type = "string"
    }
  }
}

# --- saved queries ----------------------------------------------------------
# Each one looks at the last 7 days (the `day` filter keeps the scan, and the
# cost, small); change -7 to look further back.
resource "aws_athena_named_query" "who_deleted" {
  count       = local.on
  name        = "${var.name}-who-deleted-something"
  description = "Delete/Terminate/Remove API calls (last 7 days): who, when, which resource, from where. Add AND requestparameters LIKE '%name%' to narrow to one thing."
  workgroup   = aws_athena_workgroup.security[0].id
  database    = aws_glue_catalog_database.security[0].name
  query       = <<-SQL
    SELECT eventtime, useridentity.arn AS who, eventsource, eventname, awsregion,
           sourceipaddress, errorcode, requestparameters
    FROM ${local.db}.${local.table_name}
    WHERE ${local.recent}
      AND (eventname LIKE 'Delete%' OR eventname LIKE 'Terminate%'
           OR eventname LIKE 'Remove%' OR eventname LIKE 'ScheduleKeyDeletion%')
    ORDER BY eventtime DESC
    LIMIT 200
  SQL
}

resource "aws_athena_named_query" "console_logins" {
  count       = local.on
  name        = "${var.name}-console-logins"
  description = "Console sign-ins (last 7 days) with MFA flag and result."
  workgroup   = aws_athena_workgroup.security[0].id
  database    = aws_glue_catalog_database.security[0].name
  query       = <<-SQL
    SELECT eventtime, useridentity.type AS who_type,
           COALESCE(useridentity.arn, useridentity.username) AS who,
           sourceipaddress, useragent,
           json_extract_scalar(additionaleventdata, '$.MFAUsed') AS mfa_used,
           json_extract_scalar(responseelements, '$.ConsoleLogin') AS result
    FROM ${local.db}.${local.table_name}
    WHERE ${local.recent}
      AND eventname = 'ConsoleLogin'
    ORDER BY eventtime DESC
    LIMIT 200
  SQL
}

resource "aws_athena_named_query" "failed_auth" {
  count       = local.on
  name        = "${var.name}-failed-auth-and-denied"
  description = "Failed console logins and denied/unauthorized API calls (last 7 days): probing or a broken role."
  workgroup   = aws_athena_workgroup.security[0].id
  database    = aws_glue_catalog_database.security[0].name
  query       = <<-SQL
    SELECT eventtime, COALESCE(useridentity.arn, useridentity.username) AS who,
           eventsource, eventname, errorcode, errormessage, sourceipaddress, useragent
    FROM ${local.db}.${local.table_name}
    WHERE ${local.recent}
      AND (errorcode IN ('AccessDenied', 'Client.UnauthorizedOperation', 'UnauthorizedOperation',
                         'AuthFailure', 'Client.AuthFailure', 'InvalidClientTokenId')
           OR (eventname = 'ConsoleLogin'
               AND json_extract_scalar(responseelements, '$.ConsoleLogin') = 'Failure'))
    ORDER BY eventtime DESC
    LIMIT 200
  SQL
}

resource "aws_athena_named_query" "iam_changes" {
  count       = local.on
  name        = "${var.name}-iam-changes"
  description = "Every write call to IAM and STS role/federation setup (last 7 days)."
  workgroup   = aws_athena_workgroup.security[0].id
  database    = aws_glue_catalog_database.security[0].name
  query       = <<-SQL
    SELECT eventtime, useridentity.arn AS who, eventname, sourceipaddress,
           errorcode, requestparameters
    FROM ${local.db}.${local.table_name}
    WHERE ${local.recent}
      AND eventsource = 'iam.amazonaws.com'
      AND readonly = 'false'
    ORDER BY eventtime DESC
    LIMIT 200
  SQL
}

resource "aws_athena_named_query" "root_activity" {
  count       = local.on
  name        = "${var.name}-root-user-activity"
  description = "Anything done by the AWS root user (last 30 days). Normally empty."
  workgroup   = aws_athena_workgroup.security[0].id
  database    = aws_glue_catalog_database.security[0].name
  query       = <<-SQL
    SELECT eventtime, eventsource, eventname, awsregion, sourceipaddress,
           useragent, errorcode, requestparameters
    FROM ${local.db}.${local.table_name}
    WHERE day >= date_format(date_add('day', -30, current_date), '%Y/%m/%d')
      AND useridentity.type = 'Root'
    ORDER BY eventtime DESC
    LIMIT 200
  SQL
}

output "workgroup" { value = one(aws_athena_workgroup.security[*].name) }
output "database" { value = one(aws_glue_catalog_database.security[*].name) }
