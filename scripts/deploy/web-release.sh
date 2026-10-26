#!/usr/bin/env bash
# Audit #10 (2026-10-22): the live web release switch (infra/modules/web,
# CloudFront KeyValueStore `<name>-web-release`). Used by web-deploy.yml
# and rollback.yml; needs the web deploy policy.
#
#   web-release.sh store <distribution-id>        → prints the store ARN ('' = not applied yet)
#   web-release.sh get   <store-arn> <key>        → prints the value ('' = unset)
#   web-release.sh put   <store-arn> <key> <value>
#   web-release.sh delete <store-arn> <key>       (a missing key is fine)
#
# The store is found through the distribution's viewer-request function,
# so the workflows need no new secret.
set -euo pipefail

cmd="${1:?command}"
case "$cmd" in
  store)
    dist="${2:?distribution id}"
    fn_arn=$(aws cloudfront get-distribution-config --id "$dist" \
      --query "DistributionConfig.DefaultCacheBehavior.FunctionAssociations.Items[?EventType=='viewer-request'].FunctionARN | [0]" \
      --output text 2>/dev/null || true)
    if [ -z "$fn_arn" ] || [ "$fn_arn" = "None" ]; then echo ""; exit 0; fi
    arn=$(aws cloudfront describe-function --name "${fn_arn##*/}" --stage LIVE \
      --query "FunctionSummary.FunctionConfig.KeyValueStoreAssociations.Items[0].KeyValueStoreARN" \
      --output text 2>/dev/null || true)
    [ "$arn" = "None" ] && arn=""
    echo "$arn"
    ;;
  get)
    arn="${2:?store arn}"; key="${3:?key}"
    aws cloudfront-keyvaluestore get-key --kvs-arn "$arn" --key "$key" \
      --query Value --output text 2>/dev/null || echo ""
    ;;
  put)
    arn="${2:?store arn}"; key="${3:?key}"; value="${4:?value}"
    etag=$(aws cloudfront-keyvaluestore describe-key-value-store --kvs-arn "$arn" --query ETag --output text)
    aws cloudfront-keyvaluestore put-key --kvs-arn "$arn" --key "$key" --value "$value" \
      --if-match "$etag" >/dev/null
    ;;
  delete)
    arn="${2:?store arn}"; key="${3:?key}"
    etag=$(aws cloudfront-keyvaluestore describe-key-value-store --kvs-arn "$arn" --query ETag --output text)
    aws cloudfront-keyvaluestore delete-key --kvs-arn "$arn" --key "$key" \
      --if-match "$etag" >/dev/null 2>&1 || true
    ;;
  *)
    echo "unknown command: $cmd" >&2
    exit 2
    ;;
esac
