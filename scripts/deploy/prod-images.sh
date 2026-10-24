#!/usr/bin/env bash
# Builds the api and admin images for AWS (linux/amd64) and pushes them to
# ECR with the given tag (default: the current commit). Used for the first
# launch from the owner's Mac; afterwards .github/workflows/deploy.yml does
# the same on every merge. Prints the tag.
set -euo pipefail
cd "$(dirname "$0")/../.."
REGION="${AWS_REGION:-us-east-1}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"
TAG="${1:-$(git rev-parse HEAD)}"

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
for APP in api admin; do
  echo "Собираю lawbid-$APP:$TAG …"
  # Multi-arch (amd64 + arm64): the same image runs on x86 and Graviton tasks.
  docker buildx build --platform linux/amd64,linux/arm64 \
    -f "apps/$APP/Dockerfile" --build-arg "APP_VERSION=$TAG" \
    -t "$REGISTRY/lawbid-$APP:$TAG" --push .
done
# The antivirus sidecar image, copied once (tag stays 1.4).
CLAMAV="$REGISTRY/lawbid-clamav:1.4"
if ! aws ecr describe-images --repository-name lawbid-clamav --image-ids imageTag=1.4 >/dev/null 2>&1; then
  echo "Копирую ClamAV в ECR …"
  # NB: clamav/clamav:1.4 is amd64 only (checked 2026-10-24); see 1.4-debian below.
  docker buildx imagetools create -t "$CLAMAV" clamav/clamav:1.4
fi
# Multi-arch ClamAV (amd64 + arm64) for Graviton tasks; the plain
# clamav/clamav image is amd64 only. Same job: .github/workflows/mirror-clamav.yml.
CLAMAV_DEB="$REGISTRY/lawbid-clamav:1.4-debian"
if ! aws ecr describe-images --repository-name lawbid-clamav --image-ids imageTag=1.4-debian >/dev/null 2>&1; then
  echo "Копирую ClamAV (multi-arch) в ECR …"
  docker buildx imagetools create -t "$CLAMAV_DEB" clamav/clamav-debian:1.4
fi
echo "$TAG"
