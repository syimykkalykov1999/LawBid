#!/usr/bin/env bash
# One-off commands against the PROD database from the owner's Mac, inside
# the released API image (docs/runbooks/PROD_LAUNCH.md):
#   prod-run.sh <tag> seed               reference data + the super admin row
#   prod-run.sh <tag> admin              super admin login + password (asked, hidden)
#   prod-run.sh <tag> i18n <file.xlsx>   import translations (dry run first)
#   prod-run.sh <tag> wipe [--purge-versions] [--execute]
#                                        pre-launch wipe of beta test data: database,
#                                        S3, Bunny (docs/runbooks/prelaunch-wipe.md);
#                                        dry run unless --execute. Redis: prod-wipe-redis.sh
# The app keys are read from Secrets Manager into a temporary file (mode
# 600, deleted on exit); a throwaway Redis runs next to it. Runs as the
# migrator role, with jobs and the demo world off.
set -euo pipefail
TAG="${1:?image tag}"; CMD="${2:?seed | admin | i18n <file> | wipe}"
PREFIX="${SECRET_PREFIX:-lawbid-prod}"
REGION="${AWS_REGION:-us-east-1}"
if [ -n "${PROD_IMAGE:-}" ]; then
  IMAGE="$PROD_IMAGE" # local test of this script
else
  ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
  IMAGE="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/lawbid-api:${TAG}"
fi
NET="lawbid-prod-run"; REDIS="lawbid-prod-run-redis"

ENVF="$(mktemp)"; chmod 600 "$ENVF"
cleanup() {
  rm -f "$ENVF"
  docker rm -f "$REDIS" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

secret() { aws secretsmanager get-secret-value --secret-id "$PREFIX/$1" --query SecretString --output text; }
for N in JWT_KEYS OTP_CODE_SECRET OTP_KEY_PEPPER AUTH_EVENT_PEPPER ADMIN_TOTP_ENC_KEY SECRETS_MASTER_KEYS MESSAGE_ENC_KEYS; do
  printf '%s=%s\n' "$N" "$(secret "$N")" >> "$ENVF"
done
printf 'DATABASE_URL=%s\n' "$(secret MIGRATOR_DATABASE_URL)" >> "$ENVF"
cat >> "$ENVF" <<ENV
NODE_ENV=production
TRUST_PROXY_HOPS=1
JWT_ACTIVE_KID=j1
SECRETS_ACTIVE_KID=k1
MESSAGE_ENC_ACTIVE_KID=m1
JOBS_ENABLED=false
DEMO_DATABASE_URL=off
REDIS_URL=redis://${REDIS}:6379
EMAIL_PROVIDER=ses
SES_REGION=${REGION}
SES_FROM_ADDRESS=no-reply@lawbid.dev
SMS_PROVIDER=twilio
ENV

if [ -z "${PROD_IMAGE:-}" ]; then
  aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "${IMAGE%%/*}" >/dev/null
fi
docker network create "$NET" >/dev/null 2>&1 || true
docker run -d --rm --name "$REDIS" --network "$NET" redis:7-alpine >/dev/null
RUN=(docker run --rm --platform linux/amd64 --network "$NET" --env-file "$ENVF")

case "$CMD" in
  seed)
    read -rp "E-mail супер-админа: " SEED_ADMIN_EMAIL; export SEED_ADMIN_EMAIL
    "${RUN[@]}" -e SEED_ADMIN_EMAIL "$IMAGE" node dist/prisma/seed.js
    ;;
  admin)
    read -rp "E-mail супер-админа (как в seed): " SEED_ADMIN_EMAIL
    read -rp "Логин для входа в админку: " ADMIN_SET_LOGIN
    read -rsp "Пароль (не виден): " ADMIN_SET_PASSWORD; echo
    export SEED_ADMIN_EMAIL ADMIN_SET_LOGIN ADMIN_SET_PASSWORD
    "${RUN[@]}" -e SEED_ADMIN_EMAIL -e ADMIN_SET_LOGIN -e ADMIN_SET_PASSWORD \
      "$IMAGE" node dist/src/cli/set-admin-credentials.js
    ;;
  i18n)
    FILE="$(cd "$(dirname "${3:?xlsx file}")" && pwd)/$(basename "$3")"
    "${RUN[@]}" -v "$FILE:/tmp/import.xlsx:ro" "$IMAGE" \
      node dist/src/cli/import-translations.js /tmp/import.xlsx
    ;;
  wipe)
    # S3 is reached with the Mac's own AWS login (temporary keys, same
    # temporary file); the Bunny key is read from the admin's key store.
    NAME="${STACK_NAME:-lawbid-prod}"
    aws configure export-credentials --format env-no-export >> "$ENVF"
    cat >> "$ENVF" <<ENV
AWS_REGION=${REGION}
S3_REGION=${REGION}
S3_BUCKET_DOCUMENTS=${NAME}-documents
S3_BUCKET_MEDIA=${NAME}-media
S3_BUCKET_DOCUMENTS_REPLICA=${NAME}-documents-replica
S3_REPLICA_REGION=${REPLICA_REGION:-us-west-2}
ENV
    shift 2
    "${RUN[@]}" -it -e PRELAUNCH_WIPE_CONFIRM "$IMAGE" \
      node dist/scripts/prelaunch-wipe.js --only=bunny,db,s3 "$@"
    ;;
  *) echo "unknown command: $CMD" >&2; exit 2 ;;
esac
