#!/usr/bin/env bash
# One script to make sure NOTHING of a load test is left and nothing costs money.
#
# Test data: the test runs against a throw-away COPY of the platform
# (infra/envs/loadtest). Its seeded people, chats, files and messages live only
# in that copy; `terraform destroy` at the end of the workflow removes the
# database, buckets, Redis and the generators together. Production data is
# never touched (three independent refusals of a prod host). So "delete the
# test users" = "prove the copy is gone", which is what this script does.
#
#   loadtest-cleanup.sh            # proof: no resource tagged Project=lawbid-loadtest
#   loadtest-cleanup.sh --sweep    # last resort: delete the costly leftovers by tag
#                                  # (EC2, ECS services, RDS, Redis, ALB, NAT, EIP) - owner's word
#   loadtest-cleanup.sh --state    # list old Terraform states / results in the state bucket
# Needs: aws CLI login with the load-test (or watchdog) role.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
bucket="${STATE_BUCKET:-lawbid-prod-tfstate}"
case "${1:-}" in
  --sweep)
    echo "SWEEP by tag Project=lawbid-loadtest (${2:-all runs}). Ctrl-C within 10 s to stop."; sleep 10
    "$repo/loadtest/scripts/sweep.sh" "${2:-}"
    WAIT="${WAIT:-600}" "$repo/loadtest/scripts/verify-clean.sh";;
  --state)
    aws s3api list-objects-v2 --bucket "$bucket" --prefix loadtest/ --query 'Contents[].[LastModified,Size,Key]' --output text 2>/dev/null || echo "cannot list s3://$bucket/loadtest/ (login?)"
    echo "(the watchdog removes states older than 4 h of finished runs; results live in the run's artifacts for 90 days)";;
  "")
    WAIT="${WAIT:-60}" "$repo/loadtest/scripts/verify-clean.sh";;
  *) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 2;;
esac
