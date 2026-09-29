#!/usr/bin/env sh
# docs/06 §7.3 smoke: readiness (DB + Redis), the public bootstrap, the
# admin login page. Any failure fails the job (and, on prod, the ECS
# circuit breaker has already kept the previous revision if tasks were
# unhealthy).
set -eu
API="$1"; ADMIN="$2"
for i in 1 2 3 4 5 6; do
  if curl -fsS "$API/health/ready" >/dev/null; then break; fi
  [ "$i" = 6 ] && { echo "health/ready failed" >&2; exit 1; }
  sleep 10
done
curl -fsS "$API/api/v1/config/bootstrap" >/dev/null
curl -fsS -o /dev/null -w "%{http_code}\n" "$ADMIN/login" | grep -Eq '^(200|30[0-9])$'
echo "smoke ok"
