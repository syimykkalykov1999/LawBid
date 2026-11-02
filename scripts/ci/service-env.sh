#!/usr/bin/env bash
# Points a CI job at its service containers when their host ports are random.
#
# Why: fixed `5432:5432` / `6379:6379` / `9000` collide as soon as two jobs
# share one Docker host (self-hosted runners, or a retry on the same box):
# "Bind for 0.0.0.0:5432 failed: port is already allocated". The big CI
# systems give every job its own network namespace; the portable equivalent
# is to let Docker pick the host port and read it back from the job context.
#
# Input (env, from `${{ job.services.<name>.ports['<port>'] }}`):
#   PG_PORT, REDIS_PORT          required
#   SMTP_MAPPED_PORT             optional (mailhog)
# Output: appends DATABASE_URL, REDIS_URL [, SMTP_PORT] to $GITHUB_ENV; the
# step-level values override the workflow-level defaults in api-ci.yml.
set -euo pipefail
: "${PG_PORT:?postgres host port missing}"
: "${REDIS_PORT:?redis host port missing}"
out="${GITHUB_ENV:?GITHUB_ENV not set}"
{
  echo "DATABASE_URL=postgresql://root:lawbid@localhost:${PG_PORT}/lawbid_ci?schema=public"
  echo "REDIS_URL=redis://localhost:${REDIS_PORT}"
  if [ -n "${SMTP_MAPPED_PORT:-}" ]; then echo "SMTP_PORT=${SMTP_MAPPED_PORT}"; fi
} >> "$out"
echo "service ports: postgres=${PG_PORT} redis=${REDIS_PORT} smtp=${SMTP_MAPPED_PORT:-none}"
