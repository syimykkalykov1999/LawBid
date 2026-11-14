#!/usr/bin/env bash
# Removes old web releases (releases/<sha>/, which holds that release's
# v/<sha>/ folder and its .br twins) and their `br_<sha>` markers in the
# CloudFront key-value store, so the bucket does not grow for ever.
#
# A release is removed only when ALL of these hold:
#   * it is not the live release (web_release) and not the previous one
#     (web_previous, the one `rollback.yml` goes back to with "previous");
#   * it is not among the KEEP newest (default 30) by index.html upload time;
#   * it is older than MIN_AGE_DAYS (default 3): an open browser tab, a
#     service worker or a cached page still asks for its own v/<sha>/ files
#     (the CloudFront function maps /v/<sha>/ to releases/<sha>/).
# If the live release cannot be read, nothing is removed.
#
# Engine folders (row 170, 14.11): releases/<engineRevision>/ holds only
# v/<engineRevision>/canvaskit (shared by every release built with that
# Flutter engine) and the marker `engine-complete`; it has no index.html. It
# is removed only when NO kept release's flutter_bootstrap.js points at it
# (canvasKitBaseUrl), every kept loader could be read, and it is older than
# MIN_AGE_DAYS. Anything unclear keeps it.
#
# Also drops the leftover root `v/` folder of the pre-switch layout (nothing
# is served from it once web_release is set).
#
#   web-prune-releases.sh <bucket> <store-arn>
# Env: KEEP=30  MIN_AGE_DAYS=3  DRY_RUN=1 (print only)  PRUNE_LEGACY_ROOT=1
set -euo pipefail
BUCKET="${1:?bucket}"
ARN="${2:?key-value store arn}"
KEEP="${KEEP:-30}"
MIN_AGE_DAYS="${MIN_AGE_DAYS:-3}"
DRY_RUN="${DRY_RUN:-0}"
PRUNE_LEGACY_ROOT="${PRUNE_LEGACY_ROOT:-1}"
R="$(dirname "$0")/web-release.sh"

LIVE=$("$R" get "$ARN" web_release)
PREV=$("$R" get "$ARN" web_previous)
if [ -z "$LIVE" ] || [ "$LIVE" = "None" ]; then
  echo "No live release readable: nothing is removed."
  exit 0
fi
[ "$PREV" = "None" ] && PREV=""
NOW=$(date +%s)
CUTOFF=$((NOW - MIN_AGE_DAYS * 86400))

run() {
  if [ "$DRY_RUN" = "1" ]; then echo "[dry-run] $*"; else "$@"; fi
}

PREFIXES=$(aws s3api list-objects-v2 --bucket "$BUCKET" --prefix releases/ --delimiter / \
  --query 'CommonPrefixes[].Prefix' --output text || true)
LIST=""
ENGINES=""
for P in $PREFIXES; do
  [ "$P" = "None" ] && continue
  T=$(aws s3api head-object --bucket "$BUCKET" --key "${P}index.html" \
    --query LastModified --output text 2>/dev/null || echo "")
  if [ -z "$T" ] || [ "$T" = "None" ]; then
    # No index.html: an engine folder (row 170) or a broken upload.
    M=$(aws s3api head-object --bucket "$BUCKET" --key "${P}engine-complete" \
      --query LastModified --output text 2>/dev/null || echo "")
    if [ -n "$M" ] && [ "$M" != "None" ]; then
      ENGINES="$ENGINES$(date -d "$M" +%s 2>/dev/null || echo "$NOW") $P"$'\n'
      continue
    fi
  fi
  # A release without index.html never went live (a broken upload): epoch 0.
  if [ -n "$T" ] && [ "$T" != "None" ]; then E=$(date -d "$T" +%s 2>/dev/null || echo 0); else E=0; fi
  LIST="$LIST$E $P"$'\n'
done

removed=0
kept=0
rank=0
KEPT=""
while read -r E P; do
  [ -n "${P:-}" ] || continue
  rank=$((rank + 1))
  REL=$(basename "$P")
  if [ "$REL" = "$LIVE" ] || [ "$REL" = "$PREV" ] || [ "$rank" -le "$KEEP" ] || [ "$E" -gt "$CUTOFF" ]; then
    kept=$((kept + 1))
    KEPT="$KEPT $REL"
    continue
  fi
  echo "Removing old release $REL (uploaded $(date -u -d "@$E" +%F 2>/dev/null || echo "?"))"
  run aws s3 rm "s3://$BUCKET/$P" --recursive --quiet
  run "$R" delete "$ARN" "br_$REL"
  run "$R" delete "$ARN" "br2_$REL"
  removed=$((removed + 1))
done < <(printf '%s' "$LIST" | sort -rn)
echo "Releases kept: $kept, removed: $removed (live: $LIVE, previous: ${PREV:-none})"

# Engine folders still pointed at by a kept release stay (see the top).
if [ -n "$ENGINES" ]; then
  USED=""
  SCAN_OK=1
  for REL in $KEPT; do
    if B=$(aws s3 cp "s3://$BUCKET/releases/$REL/flutter_bootstrap.js" - 2>/dev/null); then
      USED="$USED $(printf '%s' "$B" | grep -oE 'canvasKitBaseUrl:"v/[0-9A-Za-z]+/canvaskit"' | sed -E 's#.*v/([^/]+)/.*#\1#' | tr '\n' ' ')"
    else
      SCAN_OK=0
    fi
  done
  while read -r E P; do
    [ -n "${P:-}" ] || continue
    REL=$(basename "$P")
    case " $USED " in *" $REL "*) echo "Engine $REL: in use, kept"; continue ;; esac
    if [ "$SCAN_OK" != 1 ] || [ "$E" -gt "$CUTOFF" ]; then echo "Engine $REL: kept (unreadable loader or too young)"; continue; fi
    echo "Removing unused engine $REL"
    run aws s3 rm "s3://$BUCKET/$P" --recursive --quiet
    run "$R" delete "$ARN" "br_$REL"
  done <<< "$ENGINES"
fi

if [ "$PRUNE_LEGACY_ROOT" = "1" ] && aws s3api head-object --bucket "$BUCKET" \
  --key "releases/$LIVE/index.html" >/dev/null 2>&1; then
  if [ -n "$(aws s3api list-objects-v2 --bucket "$BUCKET" --prefix v/ --max-items 1 \
    --query 'Contents[0].Key' --output text 2>/dev/null | grep -v '^None$' || true)" ]; then
    echo "Removing the old root v/ folder (not served since the release switch)"
    run aws s3 rm "s3://$BUCKET/v/" --recursive --quiet
  fi
fi
