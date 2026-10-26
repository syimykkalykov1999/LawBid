#!/usr/bin/env sh
# S11-9: which release does a rollback go back to when nobody typed a tag?
#   rollback-target.sh [cluster]     prints the image tag (and nothing else on stdout)
# SSM /lawbid-prod/deploy/last_good_tag is written by deploy.yml after the smoke
# and the synthetic check passed; previous_good_tag is the one before it. If the
# release running NOW is the last good one (it passed the checks and is still
# bad in real life), the target is the previous good one; otherwise (the running
# one is a failed/unfinished deploy) it is the last good one.
set -eu
CLUSTER="${1:-lawbid-prod}"
P="/${CLUSTER}/deploy"
get() { aws ssm get-parameter --name "$P/$1" --query Parameter.Value --output text 2>/dev/null || true; }
LAST=$(get last_good_tag); PREV=$(get previous_good_tag)
TD=$(aws ecs describe-services --cluster "$CLUSTER" --services api --query 'services[0].taskDefinition' --output text)
NOW=$(aws ecs describe-task-definition --task-definition "$TD" \
  --query "taskDefinition.containerDefinitions[?name=='api'].environment[]|[?name=='APP_VERSION'].value|[0]" --output text 2>/dev/null || true)
[ "$NOW" = "None" ] && NOW=""
if [ -z "$LAST" ] || [ "$LAST" = "None" ]; then echo "no last_good_tag recorded yet: pass image_tag" >&2; exit 1; fi
if [ "$NOW" = "$LAST" ]; then
  if [ -z "$PREV" ] || [ "$PREV" = "None" ]; then echo "the running release is the last good one and no earlier one is recorded: pass image_tag" >&2; exit 1; fi
  echo "running=$NOW is the last good release; going back to previous_good_tag=$PREV" >&2
  echo "$PREV"
else
  echo "running=${NOW:-unknown} is not the last good release; going back to last_good_tag=$LAST" >&2
  echo "$LAST"
fi
