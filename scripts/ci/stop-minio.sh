#!/usr/bin/env bash
# Stops the MinIO started by start-minio.sh (random port, so a leftover would pile up on a shared host).
f="${RUNNER_TEMP:?}/minio/pid"
[ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null || true
exit 0
