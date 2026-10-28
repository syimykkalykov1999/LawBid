#!/usr/bin/env bash
# deploy.yml `build`: joins the per-arch images that `build-arch` pushed by
# digest (native amd64 + native arm64 runners) into ONE multi-arch manifest
# list tagged $IMAGE_TAG, checks that both platforms are in it, and writes the
# list's digest to $GITHUB_OUTPUT as `digest` (Trivy, cosign and the SBOM use it).
#   merge-arch-manifests.sh <repo> <digests-dir>
# Needs: ECR_REGISTRY, IMAGE_TAG, an ECR login, docker buildx, jq.
set -euo pipefail
REPO="${1:?repository, e.g. lawbid-api}"; DIR="${2:?directory with <name>-<arch> digest files}"
NAME="${REPO#lawbid-}"
: "${ECR_REGISTRY:?}" "${IMAGE_TAG:?}"
SOURCES=()
for ARCH in amd64 arm64; do
  F="$DIR/$NAME-$ARCH"
  [ -s "$F" ] || { echo "::error::no $ARCH digest for $REPO ($F)"; exit 1; }
  D=$(tr -d '[:space:]' < "$F")
  [[ "$D" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "::error::bad $ARCH digest for $REPO: $D"; exit 1; }
  SOURCES+=("$ECR_REGISTRY/$REPO@$D")
done
REF="$ECR_REGISTRY/$REPO:$IMAGE_TAG"
docker buildx imagetools create -t "$REF" "${SOURCES[@]}"
docker buildx imagetools inspect "$REF" | tee "${RUNNER_TEMP:-/tmp}/inspect-$NAME.txt"
grep -q "linux/amd64" "${RUNNER_TEMP:-/tmp}/inspect-$NAME.txt"
grep -q "linux/arm64" "${RUNNER_TEMP:-/tmp}/inspect-$NAME.txt"
DIGEST=$(docker buildx imagetools inspect "$REF" --format '{{json .Manifest}}' | jq -r .digest)
[[ "$DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "::error::no manifest-list digest for $REF"; exit 1; }
echo "digest=$DIGEST" >> "${GITHUB_OUTPUT:-/dev/stdout}"
echo "$REPO:$IMAGE_TAG -> $DIGEST (linux/amd64 + linux/arm64)"
