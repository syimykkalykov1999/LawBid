#!/usr/bin/env bash
# KNOWN_ERRORS 182 (16.11): the admin switch aws.pgbouncer «Выкл» destroyed
# PgBouncer while api / api-admin / worker still ran task definitions with
# DB_POOLER_HOST (deploy.yml owns the services' revision, Terraform's
# lifecycle ignores it), so the API lost the database for ~25 minutes.
# Big platforms drain traffic before they remove a dependency; this does the
# same around the Terraform apply in infra-apply.yml, reusing the deploy's
# rolling update (scripts/deploy/roll-services.sh: min 100 % healthy,
# circuit breaker, waits for OUR revision COMPLETED):
#
#   pooler-roll.sh <cluster> drain <pooler.json>
#       BEFORE an apply that deletes the pooler (pooler.json from
#       scripts/infra/pooler-switch.mjs). Every service that still uses the
#       pooler is rolled to a copy of the revision it runs now with exactly
#       the PLANNED DB_POOL* variables (direct database, the pool size
#       Terraform computed), and the script waits until they run it. PgBouncer
#       keeps serving meanwhile. The planned values unknown = refuse (exit 1),
#       nothing has changed and the apply does not run.
#
#   pooler-roll.sh <cluster> align
#       AFTER every apply (also a failed one). A service whose running
#       revision has other DB_POOLER_* variables than the family's newest
#       revision (Terraform's) is rolled onto it: the switch ON takes effect
#       at once, after Terraform waited for healthy pooler tasks; a left-over
#       state (16.11: pooler gone, services direct, tfvars on) is healed the
#       same way. Never onto a pooler that does not run (exit 1 instead).
#
# ROLL_SERVICES overrides the roll helper (tests).
set -euo pipefail
CLUSTER="${1:?cluster}"; MODE="${2:?drain|align}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROLL_SERVICES="${ROLL_SERVICES:-$HERE/../deploy/roll-services.sh}"
APPS="api worker"

# Revision an ACTIVE service runs; "None" when the service is absent or deleted.
running_td() {
  aws ecs describe-services --cluster "$CLUSTER" --services "$1" \
    --query "services[?status=='ACTIVE'].taskDefinition | [0]" --output text
}
td_json() { aws ecs describe-task-definition --task-definition "$1" --query 'taskDefinition' --output json; }
# DB_POOLER_* of the app container (api / worker; api-admin runs api's), sorted "NAME=VALUE" lines.
pooler_vars() {
  local c="$1"; [ "$c" = api-admin ] && c=api
  jq -r --arg c "$c" '.containerDefinitions[] | select(.name == $c) | (.environment // [])[]
    | select(.name | startswith("DB_POOLER_")) | "\(.name)=\(.value)"' | sort
}
image_of() { jq -r --arg c "$1" '.containerDefinitions[] | select(.name == $c) | .image'; }
trim() { local a; read -r -a a <<< "$1" || true; echo "${a[*]-}"; }

# Roll SERVICES (space separated, from api worker), each with the image it
# runs now: one call (both rolled at once) when they run the same image, as
# after every deploy; one call per service otherwise.
roll() {
  local list="$1" img s imgs=""
  for s in $list; do
    img=$(td_json "$(running_td "$s")" | image_of "$s")
    case "$img" in */*:*) ;; *) echo "::error::$s: cannot read the image tag from '$img'"; exit 1 ;; esac
    imgs="$imgs $s=$img"
  done
  if [ "$(for p in $imgs; do echo "${p#*=}"; done | sort -u | wc -l | tr -d ' ')" = 1 ]; then
    img="${imgs##*=}"
    echo "rolling: $list (image tag ${img##*:})"
    ECR_REGISTRY="${img%%/*}" "$ROLL_SERVICES" "$CLUSTER" "${img##*:}" "$list"
  else
    for p in $imgs; do
      s="${p%%=*}"; img="${p#*=}"
      echo "rolling: $s (image tag ${img##*:})"
      ECR_REGISTRY="${img%%/*}" "$ROLL_SERVICES" "$CLUSTER" "${img##*:}" "$s"
    done
  fi
}

case "$MODE" in
  drain)
    PLAN="${3:?pooler.json}"
    LIST=""
    for s in $APPS; do
      TD=$(running_td "$s")
      if [ -z "$(td_json "$TD" | pooler_vars "$s")" ]; then echo "$s: already on the direct database ($TD)"; continue; fi
      jq -e --arg s "$s" '.env[$s] | type == "object"' "$PLAN" > /dev/null \
        || { echo "::error::$s: the planned database settings are unknown before the apply; not removing the pooler"; exit 1; }
      jq -e --arg s "$s" '.env[$s] | has("DB_POOLER_HOST") | not' "$PLAN" > /dev/null \
        || { echo "::error::$s: the plan still points at the pooler; refusing to drain"; exit 1; }
      LIST="$LIST $s"
    done
    # api-admin runs api's revision; drain it too when only it was left behind.
    if [ -n "$(td_json "$(running_td api-admin)" 2>/dev/null | pooler_vars api-admin)" ]; then
      case " $LIST " in *" api "*) ;; *) LIST="api $LIST" ;; esac
    fi
    LIST="$(trim "$LIST")"
    [ -n "$LIST" ] || { echo "nothing uses the pooler; nothing to drain"; exit 0; }
    TD_FROM=running; DB_POOL_ENV_JSON="$(jq -c '.env' "$PLAN")"; export TD_FROM DB_POOL_ENV_JSON
    roll "$LIST"
    for s in $LIST api-admin; do
      TD=$(running_td "$s") || continue
      [ "$TD" = None ] && continue
      [ -z "$(td_json "$TD" | pooler_vars "$s")" ] || { echo "::error::$s still uses the pooler ($TD)"; exit 1; }
    done
    echo "drained: $LIST run on the direct database; the pooler can go"
    ;;
  align)
    LIST=""; NEEDS_POOLER=""
    for s in $APPS; do
      LATEST=$(td_json "$CLUSTER-$s")
      WANT=$(pooler_vars "$s" <<< "$LATEST")
      for r in "$s" $( [ "$s" = api ] && echo api-admin ); do
        TD=$(running_td "$r" 2>/dev/null || echo None)
        [ "$TD" = None ] && continue
        HAVE=$(td_json "$TD" | pooler_vars "$r")
        if [ "$HAVE" != "$WANT" ]; then
          echo "$r: runs $TD with pooler settings [${HAVE//$'\n'/ }], Terraform's revision has [${WANT//$'\n'/ }]"
          case " $LIST " in *" $s "*) ;; *) LIST="$LIST $s" ;; esac
          [ -n "$WANT" ] && NEEDS_POOLER=1
        fi
      done
    done
    LIST="$(trim "$LIST")"
    [ -n "$LIST" ] || { echo "services match Terraform's pooler setting; nothing to roll"; exit 0; }
    if [ -n "$NEEDS_POOLER" ]; then
      # shellcheck disable=SC2016 # JMESPath backticks, not shell
      N=$(aws ecs describe-services --cluster "$CLUSTER" --services pgbouncer \
        --query 'services[?status==`ACTIVE`].runningCount | [0]' --output text 2>/dev/null || echo 0)
      case "$N" in ''|None|0) echo "::error::Terraform's revision points at the pooler, but PgBouncer runs no task; not moving the services"; exit 1 ;; esac
    fi
    roll "$LIST"
    echo "aligned: $LIST"
    ;;
  *) echo "usage: pooler-roll.sh <cluster> drain <pooler.json> | align" >&2; exit 2 ;;
esac
