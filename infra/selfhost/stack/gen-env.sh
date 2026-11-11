#!/bin/sh
# Writes .env (git-ignored) with the app's own random keys in the same
# formats as scripts/deploy/prod-secrets.sh. Never prints a value.
set -eu
cd "$(dirname "$0")"
[ -f .env ] && { echo ".env exists, kept"; exit 0; }
gen() { openssl rand -base64 64 | tr -d '\n/+=' | cut -c1-64; }
PG_PASS=$(gen); REDIS_PASS=$(gen); MINIO_PASS=$(gen)
umask 077
cat > .env <<V
PG_PASS=$PG_PASS
REDIS_PASS=$REDIS_PASS
MINIO_USER=lawbid-selfhost
MINIO_PASS=$MINIO_PASS
JWT_KEYS=j1:$(gen)
OTP_CODE_SECRET=$(gen)
OTP_KEY_PEPPER=$(gen)
AUTH_EVENT_PEPPER=$(gen)
ADMIN_TOTP_ENC_KEY=$(gen)
SECRETS_MASTER_KEYS=k1:$(gen)
MESSAGE_ENC_KEYS=m1:$(gen)
SEARCH_INDEX_KEY=$(gen)
V
echo ".env written"
