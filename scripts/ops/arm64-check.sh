#!/usr/bin/env bash
# ARM64 readiness (Batch A item 12; docs/runbooks/batch-a-owner.md, section 6).
# Read-only. Checks that every image the ECS tasks use is a multi-arch
# manifest list with BOTH amd64 and arm64, so `cpu_architecture = "ARM64"`
# can be applied without a task that cannot start.
#
#   scripts/ops/arm64-check.sh lawbid-api:<tag> lawbid-admin:<tag> lawbid-clamav:1.4-debian lawbid-pgbouncer:<tag>
#
# Each argument is <ecr-repository>:<tag>. Exit 1 when any image lacks arm64.
# Needs the AWS CLI (ecr:BatchGetImage) and python3.
set -euo pipefail
REGION="${AWS_REGION:-us-east-1}"
[ "$#" -gt 0 ] || { echo "usage: $0 <repo>:<tag> [...]"; exit 2; }
bad=0
for ref in "$@"; do
  repo="${ref%%:*}"
  tag="${ref#*:}"
  manifest=$(aws --region "$REGION" ecr batch-get-image --repository-name "$repo" --image-ids "imageTag=$tag" \
    --accepted-media-types application/vnd.oci.image.index.v1+json application/vnd.docker.distribution.manifest.list.v2+json \
    application/vnd.oci.image.manifest.v1+json application/vnd.docker.distribution.manifest.v2+json \
    --query 'images[0].imageManifest' --output text 2>/dev/null || true)
  if [ -z "$manifest" ] || [ "$manifest" = "None" ]; then
    echo "MISSING  $ref (no such image)"
    bad=1
    continue
  fi
  archs=$(printf '%s' "$manifest" | python3 -c '
import json, sys
m = json.load(sys.stdin)
a = sorted({x.get("platform", {}).get("architecture", "?") for x in m.get("manifests", [])
            if x.get("platform", {}).get("architecture") != "unknown"})
print(",".join(a) if a else "single-arch")')
  if [[ ",$archs," == *,arm64,* && ",$archs," == *,amd64,* ]]; then
    echo "OK       $ref  [$archs]"
  else
    echo "NO ARM64 $ref  [$archs]"
    bad=1
  fi
done
exit "$bad"
