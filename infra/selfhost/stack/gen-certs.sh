#!/bin/sh
# Own servers (owner 2026-11-11, «выкладка без AWS»): a private CA and one
# server certificate per service name (postgres, redis, minio), so every
# connection is TLS exactly like on AWS (the production boot refuses plain
# connections: src/config/env.schema.ts). Runs once in the `certs` service;
# re-running keeps the existing CA.
set -eu
D=/certs
[ -f "$D/ca.crt" ] || {
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=LawBid selfhost CA" \
    -keyout "$D/ca.key" -out "$D/ca.crt" 2>/dev/null
}
for n in postgres redis minio; do
  [ -f "$D/$n.crt" ] && continue
  openssl req -newkey rsa:2048 -nodes -subj "/CN=$n" -keyout "$D/$n.key" -out "$D/$n.csr" 2>/dev/null
  printf 'subjectAltName=DNS:%s,DNS:localhost\n' "$n" > "$D/$n.ext"
  openssl x509 -req -in "$D/$n.csr" -CA "$D/ca.crt" -CAkey "$D/ca.key" -CAcreateserial \
    -days 825 -extfile "$D/$n.ext" -out "$D/$n.crt" 2>/dev/null
  rm -f "$D/$n.csr" "$D/$n.ext"
done
# PostgreSQL (uid 999) and the app user read their own copies.
mkdir -p "$D/pg" "$D/minio"
cp "$D/postgres.crt" "$D/pg/server.crt"; cp "$D/postgres.key" "$D/pg/server.key"
chown -R 999:999 "$D/pg"; chmod 600 "$D/pg/server.key"
cp "$D/minio.crt" "$D/minio/public.crt"; cp "$D/minio.key" "$D/minio/private.key"
chmod 644 "$D"/*.crt "$D/redis.key" "$D/minio/private.key"
echo "certs ready"
