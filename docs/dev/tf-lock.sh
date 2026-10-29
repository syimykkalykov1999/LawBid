#!/usr/bin/env bash
# Serialises terraform machine-wide; kills a run over TF_MAX_SEC (600 s).
set -u
L=/tmp/lawbid-tf.lock; MAX=${TF_MAX_SEC:-600}
[ "${1:-}" = "--" ] && shift
start=$(date +%s)
while ! mkdir "$L" 2>/dev/null; do
  p=$(cat "$L/pid" 2>/dev/null)
  if [ -n "$p" ] && ! kill -0 "$p" 2>/dev/null; then rm -rf "$L"; continue; fi
  if [ $(( $(date +%s) - start )) -ge 1800 ]; then echo "[tf-lock] gave up" >&2; exit 124; fi
  sleep 5
done
echo $$ > "$L/pid"; trap 'rm -rf "$L"' EXIT
if [ "${1:-}" = "terraform" ] && [ "${2:-}" = "init" ]; then
  shift 2; set -- terraform init -plugin-dir="$HOME/.terraform.d/plugin-mirror-real" "$@"
fi
"$@" & cmd=$!
( sleep "$MAX"; kill -0 $cmd 2>/dev/null && { echo "[tf-lock] killed after ${MAX}s: $*" >&2; kill -9 $cmd; } ) & wd=$!
wait $cmd; rc=$?; kill $wd 2>/dev/null; wait $wd 2>/dev/null; exit $rc
