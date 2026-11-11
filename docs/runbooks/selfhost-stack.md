# Runbook: the whole app without AWS (own servers)

Owner 2026-11-11: «проверка, что действительно работает, а не для красоты». Proven the same day on the Mac with the production images of release `ebd68d288` (`infra/selfhost/stack/`).

## What runs
`infra/selfhost/stack/docker-compose.yml`: PostgreSQL 16, Redis 7 and MinIO, each with a TLS certificate from a private CA (`gen-certs.sh`, run once by the `certs` service); the migrate task (migrations, concurrent indexes, schema check); `api`, `worker` and `admin` from the SAME images the AWS deploy runs, `NODE_ENV=production`. No AWS service: files in MinIO, mail / SMS / payment keys in the admin key store (`SECRETS_MASTER_KEYS`).

## Start
```
cd infra/selfhost/stack
./gen-env.sh                      # .env with new random keys (git-ignored, never printed)
echo "API_IMAGE=<registry>/lawbid-api:<tag>"   >> .env
echo "ADMIN_IMAGE=<registry>/lawbid-admin:<tag>" >> .env
docker compose up -d
```
API on 127.0.0.1:3900, admin on 127.0.0.1:3901 (put Nginx / Caddy with a real certificate in front on a server).

## Check (what was proven 2026-11-11)
- `scripts/deploy/smoke.sh http://127.0.0.1:3900 http://127.0.0.1:3901` → `smoke ok`;
- `node scripts/ops/synthetic-check.mjs http://127.0.0.1:3900` → `synthetic check ok`;
- `/health/ready`: database up, redis up (both over TLS);
- migrate log: `schema check: database matches schema.prisma (302 models)`;
- a file written and read back in MinIO over HTTPS with the app's own settings;
- worker: cron jobs scheduled, no error lines.

## Not covered here (needs the real servers)
A real certificate and domain in front, Patroni (PostgreSQL failover) and backups (`docs/runbooks/selfhost-backups.md`), Redis Sentinel, ClamAV for uploads (`CLAMAV_HOST`), Prometheus for the database CPU on «Масштаб» (`OPS_PROMETHEUS_URL`). Order of the move: `docs/architecture/SELF_HOSTING_INVENTORY_2026-10-28.md` §4.

## Stop and clean
`docker compose down -v` removes the containers and the three volumes (data of this test stand only).
