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
  docker buildx build --platform linux/amd64 \
    -f "apps/$APP/Dockerfile" --build-arg "APP_VERSION=$TAG" \
    -t "$REGISTRY/lawbid-$APP:$TAG" --push .
done
# The antivirus sidecar image, copied once (tag stays 1.4).
CLAMAV="$REGISTRY/lawbid-clamav:1.4"
if ! aws ecr describe-images --repository-name lawbid-clamav --image-ids imageTag=1.4 >/dev/null 2>&1; then
  echo "Копирую ClamAV в ECR …"
  docker pull --platform linux/amd64 clamav/clamav:1.4
  docker tag clamav/clamav:1.4 "$CLAMAV"
  docker push "$CLAMAV"
fi
echo "$TAG"
