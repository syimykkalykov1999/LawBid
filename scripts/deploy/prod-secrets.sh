#!/usr/bin/env bash
# First launch: generates the app's own random keys straight into Secrets
# Manager (docs/runbooks/PROD_LAUNCH.md, step «Ключи»). A key that already
# has a value is never replaced — re-running is harmless. Nothing is
# printed. The three keys whose loss is permanent (chat texts, the admin
# key store, admin 2FA) are also copied into the macOS Keychain of this
# Mac («Связка ключей», entries «LawBid prod …»), so one more copy exists
# outside AWS.
set -euo pipefail
PREFIX="${SECRET_PREFIX:-lawbid-prod}"

gen() { openssl rand -base64 64 | tr -d '\n/+=' | cut -c1-64; }
has_value() {
  aws secretsmanager get-secret-value --secret-id "$PREFIX/$1" \
    --query VersionId --output text >/dev/null 2>&1
}
put_new() {
  if has_value "$1"; then
    echo "  $1: уже есть, не трогаю"
  else
    printf '%s' "$2" | aws secretsmanager put-secret-value \
      --secret-id "$PREFIX/$1" --secret-string file:///dev/stdin >/dev/null
    echo "  $1 ✓"
  fi
}

put_new JWT_KEYS "j1:$(gen)"
put_new OTP_CODE_SECRET "$(gen)"
put_new OTP_KEY_PEPPER "$(gen)"
put_new AUTH_EVENT_PEPPER "$(gen)"
put_new ADMIN_TOTP_ENC_KEY "$(gen)"
put_new SECRETS_MASTER_KEYS "k1:$(gen)"
put_new MESSAGE_ENC_KEYS "m1:$(gen)"
put_new SEARCH_INDEX_KEY "$(gen)"

if command -v security >/dev/null 2>&1; then
  for NAME in MESSAGE_ENC_KEYS SECRETS_MASTER_KEYS ADMIN_TOTP_ENC_KEY; do
    VALUE="$(aws secretsmanager get-secret-value --secret-id "$PREFIX/$NAME" \
      --query SecretString --output text)"
    security add-generic-password -U -a "$PREFIX" -s "LawBid prod $NAME" -w "$VALUE"
    echo "  копия $NAME в Связке ключей ✓"
  done
fi
echo "Готово."
