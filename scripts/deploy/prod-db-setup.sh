#!/usr/bin/env bash
# First launch, database side — run once from the owner's Mac
# (docs/runbooks/PROD_LAUNCH.md, step «База»). Needs: AWS CLI logged in to
# the prod account, the prod Terraform applied (the secrets exist), and the
# connection string of the SQL user `lawbid_migrator` created in the
# CockroachDB Cloud console (Console users are admins).
#
# It creates the databases `lawbid` and `lawbid_demo`, runs the migrations
# (they create the roles lawbid_app / lawbid_retention / lawbid_readonly),
# gives the two runtime roles random passwords, applies the per-role
# timeouts and writes the four connection strings into Secrets Manager.
# Nothing secret is printed; re-running is safe (passwords are rotated and
# the secrets get a new version — restart the services afterwards).
set -euo pipefail
cd "$(dirname "$0")/../../apps/api"
PREFIX="${SECRET_PREFIX:-lawbid-prod}"

if [ -z "${MIGRATOR_URL:-}" ]; then
  read -rsp "Строка подключения lawbid_migrator из CockroachDB Cloud (не будет видна): " MIGRATOR_URL
  echo
fi

# url_for <db> [user password] — same host/options, another database/user.
url_for() {
  node -e '
    const u = new URL(process.argv[1]);
    u.pathname = "/" + process.argv[2];
    if (process.argv[3]) { u.username = process.argv[3]; u.password = process.argv[4]; }
    if (!u.searchParams.get("sslmode")) u.searchParams.set("sslmode", "verify-full");
    process.stdout.write(u.toString());
  ' "$MIGRATOR_URL" "$@"
}
sql() { npx prisma db execute --url "$1" --stdin >/dev/null; }
put() {
  printf '%s' "$2" | aws secretsmanager put-secret-value \
    --secret-id "$PREFIX/$1" --secret-string file:///dev/stdin >/dev/null
  echo "  $1 ✓"
}

echo "1/5 Базы lawbid и lawbid_demo"
echo 'CREATE DATABASE IF NOT EXISTS lawbid; CREATE DATABASE IF NOT EXISTS lawbid_demo;' \
  | sql "$(url_for defaultdb)"

echo "2/5 Миграции"
MIGRATOR="$(url_for lawbid)"
DATABASE_URL="$MIGRATOR" npx prisma migrate deploy

echo "3/5 Пароли ролей приложения"
APP_PW="$(openssl rand -hex 24)"
RET_PW="$(openssl rand -hex 24)"
printf "ALTER USER lawbid_app WITH PASSWORD '%s';\nALTER USER lawbid_retention WITH PASSWORD '%s';\n" \
  "$APP_PW" "$RET_PW" | sql "$MIGRATOR"

echo "4/5 Лимиты запросов по ролям"
sql "$MIGRATOR" < ../../infra/cockroach/role-settings.sql

echo "5/5 Строки подключения → Secrets Manager ($PREFIX/…)"
put MIGRATOR_DATABASE_URL "$MIGRATOR"
put DATABASE_URL "$(url_for lawbid lawbid_app "$APP_PW")"
put RETENTION_DATABASE_URL "$(url_for lawbid lawbid_retention "$RET_PW")"
put DEMO_DATABASE_URL "$(url_for lawbid_demo)"
echo "Готово."
