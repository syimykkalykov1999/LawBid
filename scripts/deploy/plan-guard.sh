#!/usr/bin/env sh
# Refuses a Terraform plan that would delete or replace data-bearing
# resources: database, secrets (the admin key store lives under
# SECRETS_MASTER_KEYS), KMS keys, Redis, S3 buckets. Usage, in infra/envs/prod:
#   terraform plan -out=plan.bin && ../../../scripts/deploy/plan-guard.sh plan.bin
# Needs terraform and jq. Exit 0 = nothing protected is deleted/replaced.
set -eu
PLAN="${1:?plan file from terraform plan -out}"
BAD=$(terraform show -json "$PLAN" | jq -r '
  .resource_changes[]?
  | select(.change.actions | index("delete"))
  | select(.type | test("^(aws_db_instance|aws_secretsmanager_secret|aws_secretsmanager_secret_version|aws_kms_key|aws_elasticache_replication_group|aws_elasticache_cluster|aws_s3_bucket|aws_dynamodb_table)$"))
  | "\(.address)  [\(.change.actions | join("+"))]"')
if [ -n "$BAD" ]; then
  echo "STOP: the plan deletes or replaces protected resources:" >&2
  echo "$BAD" >&2
  exit 1
fi
echo "plan-guard: no protected resource is deleted or replaced"
