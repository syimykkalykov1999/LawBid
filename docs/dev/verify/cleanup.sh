#!/usr/bin/env bash
# Убирает за проверкой 17.11: тестовые базы lawbid_e2e_cmv_* и логическую базу Valkey 13.
# Dev-база lawbid и другие базы Valkey не трогаются.
# Ожидаемый вывод: "DROP DATABASE" на каждую базу, затем "OK" и "db13 keys: 0".
set -euo pipefail
for db in $(docker exec lawbid-postgres-1 psql -U root -d lawbid -Atc "SELECT datname FROM pg_database WHERE datname LIKE 'lawbid\_e2e\_cmv\_%'"); do
  docker exec lawbid-postgres-1 psql -U root -d lawbid -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)"
done
docker exec lawbid-redis-1 redis-cli -n 13 FLUSHDB
echo "db13 keys: $(docker exec lawbid-redis-1 redis-cli -n 13 DBSIZE)"
