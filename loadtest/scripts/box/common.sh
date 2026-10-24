#!/usr/bin/env bash
# Sourced by the scripts that run ON a generator box (started by ssm-run.sh).
# Expects: RUN_ID, ARTIFACTS_BUCKET, AWS_REGION (set by the workflow in the
# ssm command line). Unpacks the repository files the workflow uploaded.
set -euo pipefail
: "${RUN_ID:?}" "${ARTIFACTS_BUCKET:?}"
export AWS_REGION="${AWS_REGION:-us-east-1}" AWS_DEFAULT_REGION="${AWS_REGION:-us-east-1}"
S3="s3://$ARTIFACTS_BUCKET/loadtest/$RUN_ID"
LT=/opt/lt
if [ ! -d "$LT/loadtest" ]; then
  mkdir -p "$LT"
  aws s3 cp "$S3/pack.tgz" /tmp/pack.tgz --only-show-errors
  tar xzf /tmp/pack.tgz -C "$LT"
fi
# wait until user-data finished (k6, lk, docker installed)
for _ in $(seq 1 90); do [ -f /var/lib/loadgen-ready ] && break; sleep 10; done
[ -f /var/lib/loadgen-ready ] || { echo "box setup did not finish (see /var/log/loadgen-init.log):"; tail -30 /var/log/loadgen-init.log; exit 1; }
secret() { aws secretsmanager get-secret-value --secret-id "$1" --query SecretString --output text; }
