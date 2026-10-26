#!/usr/bin/env bash
# S11-10: scan the image that is really shipped (the pushed multi-arch digest),
# not a separate local build. Blocks on CRITICAL (fixable ones; container-scan.yml
# keeps gating HIGH on PRs). Both platforms of the index are scanned.
#   trivy-image.sh <registry/repo@sha256:...> [severity]   (needs `docker`, an ECR login)
# TRIVY_USERNAME / TRIVY_PASSWORD are passed through for a private registry.
set -euo pipefail
REF="${1:?image ref with digest}"; SEV="${2:-CRITICAL}"
CACHE="${RUNNER_TEMP:-/tmp}/trivy-cache"; mkdir -p "$CACHE"
IMG=aquasec/trivy:0.58.0
ok=
for repo in mirror.gcr.io/aquasec/trivy-db:2 ghcr.io/aquasecurity/trivy-db:2 public.ecr.aws/aquasecurity/trivy-db:2; do
  if docker run --rm -v "$CACHE:/root/.cache/trivy" "$IMG" image --download-db-only --db-repository "$repo"; then ok=1; break; fi
  echo "Trivy DB from $repo failed, trying the next mirror"
done
[ -n "$ok" ] || { echo "::error::no Trivy DB mirror answered"; exit 1; }
rc=0
for PLATFORM in linux/amd64 linux/arm64; do
  echo "== Trivy $SEV on $REF ($PLATFORM)"
  docker run --rm -v "$CACHE:/root/.cache/trivy" -v "$PWD:/out" \
    -e TRIVY_USERNAME -e TRIVY_PASSWORD \
    "$IMG" image --skip-db-update --platform "$PLATFORM" \
    --severity "$SEV" --ignore-unfixed --exit-code 1 \
    --skip-dirs /usr/local/lib/node_modules/npm \
    --ignorefile /out/.trivyignore "$REF" || rc=1
done
exit $rc
