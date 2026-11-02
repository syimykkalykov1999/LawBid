#!/usr/bin/env bash
# Starts the pinned MinIO build on a FREE port and exports S3_ENDPOINT.
# Data and log live in $RUNNER_TEMP, not /tmp, so two jobs on one host do not
# share a store. Port 9000 was fixed before and collided on shared hosts.
set -euo pipefail
dir="${RUNNER_TEMP:?}/minio"
mkdir -p "$dir/data"
port=$(node -e "const s=require('net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})")
# setsid: own session, so the runner's step cleanup cannot take it down.
MINIO_ROOT_USER=lawbid MINIO_ROOT_PASSWORD=lawbid_dev_only \
  setsid nohup /tmp/minio-bin/minio server "$dir/data" --address ":${port}" > "$dir/minio.log" 2>&1 < /dev/null &
pid=$!
echo "$pid" > "$dir/pid"
for _ in $(seq 1 30); do
  if ! kill -0 "$pid" 2>/dev/null; then break; fi
  if curl -sf -o /dev/null "http://127.0.0.1:${port}/minio/health/live"; then
    echo "S3_ENDPOINT=http://localhost:${port}" >> "${GITHUB_ENV:?}"
    echo "MINIO_PORT=${port}" >> "$GITHUB_ENV"
    echo "minio on ${port}"
    exit 0
  fi
  sleep 1
done
echo "MinIO did not start"; cat "$dir/minio.log"; exit 1
