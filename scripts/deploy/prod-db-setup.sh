#!/usr/bin/env bash
# First launch, database side — run once from the owner's Mac
# (docs/runbooks/PROD_LAUNCH.md, step «База»). Needs: AWS CLI logged in to
# the prod account, the prod Terraform applied (the secrets exist), and the
# connection string of the user `lawbid_migrator` created in the managed
# PostgreSQL 16 console (e.g. AWS RDS / Neon / Supabase — the owner picks
# one; on RDS it can be the master user). That user must be allowed to
# create databases and roles (CREATEDB, CREATEROLE).
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

# The whole connection string is needed, not only the password. Ask again
# until it looks like one; never print what was typed (it holds the password).
while :; do
  if [ -z "${MIGRATOR_URL:-}" ]; then
    read -rsp "Строка подключения lawbid_migrator из консоли PostgreSQL целиком, начинается с postgresql:// (не будет видна): " MIGRATOR_URL
    echo
  fi
  case "$MIGRATOR_URL" in
    postgresql://*@*|postgres://*@*) break ;;
  esac
  echo "Это не строка подключения. Нужна вся строка подключения из консоли базы (postgresql://lawbid_migrator:…@…:5432/postgres?sslmode=verify-full)." >&2
  MIGRATOR_URL=""
done

# url_for <db> [user password] — same host/options, another database/user.
# Always assign its result to a variable first (X="$(url_for …)"): a failure
# inside "$(…)" used as an argument does not stop the script under set -e.
url_for() {
  node -e '
    let u;
    try { u = new URL(process.argv[1]); } catch {
      console.error("Строка подключения не разобралась (её текст не показываю).");
      process.exit(1);
    }
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

# The maintenance database: the one named in the pasted string (RDS and
# Supabase: postgres, Neon: neondb), never lawbid itself (it may be dropped).
MAINT_DB="$(node -e '
  let d = "";
  try { d = decodeURIComponent(new URL(process.argv[1]).pathname.slice(1)); } catch {}
  process.stdout.write(!d || d === "lawbid" || d === "lawbid_demo" ? "postgres" : d);
' "$MIGRATOR_URL")"
DEFAULT_URL="$(url_for "$MAINT_DB")"
MIGRATOR="$(url_for lawbid)"
DEMO_URL="$(url_for lawbid_demo)"

# migration_state <url> — "fresh" (no migrations table), "failed-empty" (no
# migration ever finished and no user rows: a first run that broke half-way)
# or "used". Prints nothing secret.
migration_state() {
  node -e '
    const { PrismaClient } = require("@prisma/client");
    const p = new PrismaClient({ datasourceUrl: process.argv[1] });
    const has = async (t) => Number((await p.$queryRawUnsafe(
      "SELECT count(*)::INT AS n FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2",
      "public", t))[0].n) > 0;
    (async () => {
      if (!(await has("_prisma_migrations"))) return "fresh";
      const [m] = await p.$queryRawUnsafe(
        "SELECT count(*) FILTER (WHERE finished_at IS NOT NULL)::INT AS ok FROM _prisma_migrations");
      const users = (await has("users"))
        ? Number((await p.$queryRawUnsafe("SELECT count(*)::INT AS n FROM users"))[0].n) : 0;
      return Number(m.ok) === 0 && users === 0 ? "failed-empty" : "used";
    })().then((s) => process.stdout.write(s),
      () => { console.error("Не удалось проверить базу."); process.exit(1); })
      .finally(() => p.$disconnect());
  ' "$1"
}

# db_admin create|recreate <name> — PostgreSQL has no CREATE DATABASE IF NOT
# EXISTS, and CREATE/DROP DATABASE cannot run inside a multi-statement
# script, so each runs as its own statement.
db_admin() {
  node -e '
    const { PrismaClient } = require("@prisma/client");
    const [url, op, name] = process.argv.slice(1);
    if (!/^[a-z0-9_]+$/.test(name)) process.exit(2);
    const p = new PrismaClient({ datasourceUrl: url });
    (async () => {
      if (op === "recreate") await p.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      const found = await p.$queryRawUnsafe("SELECT 1 FROM pg_database WHERE datname = $1", name);
      if (found.length === 0) await p.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    })().catch(() => { console.error("Не удалось создать базу " + name + " (нужно право CREATEDB)."); process.exit(1); })
      .finally(() => p.$disconnect());
  ' "$DEFAULT_URL" "$1" "$2"
}

echo "1/5 Базы lawbid и lawbid_demo"
db_admin create lawbid
db_admin create lawbid_demo
STATE="$(migration_state "$MIGRATOR")"
if [ "$STATE" = "failed-empty" ]; then
  # Only a brand-new database whose first run broke: nothing finished, no
  # users. Start it over; a database with any finished migration is never
  # dropped here.
  echo "  прошлый запуск оборвался на пустой базе — создаю lawbid заново"
  db_admin recreate lawbid
fi

echo "2/5 Миграции"
DATABASE_URL="$MIGRATOR" npx prisma migrate deploy

echo "3/5 Пароли ролей приложения"
APP_PW="$(openssl rand -hex 24)"
RET_PW="$(openssl rand -hex 24)"
printf "ALTER USER lawbid_app WITH PASSWORD '%s';\nALTER USER lawbid_retention WITH PASSWORD '%s';\n" \
  "$APP_PW" "$RET_PW" | sql "$MIGRATOR"
APP_URL="$(url_for lawbid lawbid_app "$APP_PW")"
RET_URL="$(url_for lawbid lawbid_retention "$RET_PW")"

echo "4/5 Лимиты запросов по ролям"
sql "$MIGRATOR" < ../../infra/postgres/role-settings.sql

echo "5/5 Строки подключения → Secrets Manager ($PREFIX/…)"
put MIGRATOR_DATABASE_URL "$MIGRATOR"
put DATABASE_URL "$APP_URL"
put RETENTION_DATABASE_URL "$RET_URL"
put DEMO_DATABASE_URL "$DEMO_URL"
echo "Готово."
