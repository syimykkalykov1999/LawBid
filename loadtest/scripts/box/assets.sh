#!/usr/bin/env bash
# ON generator box 0: puts N synthetic "web app files" (5-60 KB, average
# ~24 KB, random bytes) into the stack's web bucket, so the ~10 % static share
# of the mix is served by CloudFront from S3 like the real web app's files.
#   env: RUN_ID ARTIFACTS_BUCKET WEB_BUCKET [ASSETS=200]
set -euo pipefail
source "$(dirname "$0")/common.sh"
: "${WEB_BUCKET:?}"
n="${ASSETS:-200}"
d="$(mktemp -d)"
for i in $(seq 0 $((n - 1))); do
  kb=$(( 5 + (i * 7) % 56 ))
  head -c $((kb * 1024)) /dev/urandom >"$d/a-$i.bin"
done
aws s3 cp "$d" "s3://$WEB_BUCKET/assets/" --recursive --only-show-errors \
  --cache-control "public, max-age=31536000, immutable" --content-type application/octet-stream
echo "uploaded $n assets to s3://$WEB_BUCKET/assets/"
