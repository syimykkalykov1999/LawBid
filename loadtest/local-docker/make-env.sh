#!/usr/bin/env bash
# Builds stack/api.env from apps/api/.env.example: random local secrets,
# every paid / third-party integration OFF, never a production value.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="${REPO:-$(cd "$here/../.." && pwd)}"
r() { python3 -c 'import secrets;print(secrets.token_hex(32))'; }
# AUTH_TEST=1 ./make-env.sh -> api-auth.env: a COPY of api.env (same keys, so
# the minted tokens and the sealed messages keep working) with the login storm
# (k6/auth.js) enabled: fixed SMS code 000000 (the API allows it only in
# NODE_ENV=development) and per-address limits raised, because all test logins
# come from one address. SMS stays "mock": nothing is ever sent. The SMS budget
# caps live in the database: ladder.sh sets them for the run and removes them.
if [ "${AUTH_TEST:-0}" = 1 ]; then
  [ -f "$here/api.env" ] || { echo "make api.env first:  ./make-env.sh" >&2; exit 2; }
  out="$here/api-auth.env"; cp "$here/api.env" "$out.tmp"
  set_kv() { if grep -q "^$1=" "$out.tmp"; then sed -i "s|^$1=.*|$1=$2|" "$out.tmp"; else echo "$1=$2" >> "$out.tmp"; fi; }
  set_kv OTP_DEV_FIXED_CODE true
  for k in OTP_RATE_LIMIT_PER_IP_PER_HOUR OTP_RATE_LIMIT_PER_IDENTIFIER_PER_HOUR OTP_RATE_LIMIT_PER_IDENTIFIER_PER_DAY OTP_VERIFY_LIMIT_PER_IP_PER_HOUR AUTH_OTP_VERIFY_LIMIT_PER_HOUR OTP_RATE_LIMIT_PER_DEVICE_PER_HOUR BUDGET_SMS_PER_MINUTE_MAX BUDGET_SMS_DAILY_MAX BUDGET_SMS_MONTHLY_MAX; do set_kv $k 1000000; done
  mv "$out.tmp" "$out"; chmod 600 "$out"; echo "wrote $out"; exit 0
fi
out="$here/api.env"
# new secrets would make every token / message made earlier unreadable
[ -f "$out" ] && [ "${FORCE:-0}" != 1 ] && { echo "$out exists (kept; FORCE=1 makes new secrets and requires prepare.sh again)"; exit 0; }
grep -v '^\s*#' "$repo/apps/api/.env.example" | grep -v '^\s*$' > "$out.tmp"
set_kv() { if grep -q "^$1=" "$out.tmp"; then sed -i "s|^$1=.*|$1=$2|" "$out.tmp"; else echo "$1=$2" >> "$out.tmp"; fi; }
set_kv NODE_ENV development
set_kv PORT 3000
set_kv DATABASE_URL "postgresql://lawbid_app:lawbid_app_lt@postgres:5432/lawbid_lt"
set_kv DB_POOLER_HOST pgbouncer
set_kv DB_POOL_SIZE 10
set_kv REDIS_URL redis://redis:6379/0
set_kv JWT_KEYS "lt1:$(r)"
set_kv JWT_ACTIVE_KID lt1
for k in OTP_CODE_SECRET OTP_KEY_PEPPER AUTH_EVENT_PEPPER CONTACTS_PEPPER; do set_kv $k "$(r)"; done
set_kv MESSAGE_ENC_KEYS "lt1:$(r)"
set_kv MESSAGE_ENC_ACTIVE_KID lt1
set_kv ADMIN_TOTP_ENC_KEY "$(python3 -c 'import secrets,base64;print(base64.b64encode(secrets.token_bytes(32)).decode())')"
set_kv TRUST_PROXY_HOPS 1
set_kv HTTP_LOG_SAMPLE_PERCENT 1
set_kv SMS_PROVIDER mock
set_kv EMAIL_PROVIDER mock
set_kv OTP_DEV_FIXED_CODE false
set_kv DISPOSABLE_DOMAINS_URL http://127.0.0.1:9/none
set_kv SMTP_HOST ""
set_kv TURN_URLS ""
set_kv STUN_URLS ""
mv "$out.tmp" "$out"; chmod 600 "$out"
echo "wrote $out"
