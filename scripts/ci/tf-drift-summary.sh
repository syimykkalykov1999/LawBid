#!/usr/bin/env sh
# Turns `terraform show -json plan.bin` into a SHORT, secret-free drift report:
# resource address + action + the NAMES of the changed attributes. Never any
# value (before/after can hold passwords, webhooks, keys).
#
# Usage: tf-drift-summary.sh plan.json > drift.md ; exit 0 = no drift,
#        exit 2 = drift (report written to stdout).
#
# Known benign difference, ignored: deploy.yml registers new task-definition
# revisions OUTSIDE Terraform (scripts/deploy/current-tag.sh explains), so the
# three ECS services always point at a newer revision than the state. An
# aws_ecs_service whose ONLY changed attribute is task_definition (or
# force_new_deployment) is not reported.
set -eu
OUT=$(mktemp)
PLAN="${1:?plan.json from: terraform show -json plan.bin}"
jq -r '
  def changed_keys:
    (.change.before // {}) as $b | (.change.after // {}) as $a
    | ((($b | keys) + ($a | keys)) | unique)
    | map(select(($b[.]) != ($a[.])))
    | map(select(. != "id"));
  [ .resource_changes[]?
    | select(.change.actions != ["no-op"] and .change.actions != ["read"])
    | . as $rc
    | ($rc | changed_keys) as $keys
    | select(
        ($rc.type == "aws_ecs_service" and ($rc.change.actions == ["update"])
          and (($keys - ["task_definition","force_new_deployment"]) | length == 0)
          and ($keys | length > 0)
        ) | not)
    | { address: $rc.address, actions: ($rc.change.actions | join("+")), keys: ($keys | join(", ")) }
  ] as $items
  | if ($items | length) == 0 then empty
    else
      "Terraform plan on prod is NOT empty: \($items | length) resource(s).\n",
      "| Resource | Action | Changed attributes |",
      "|---|---|---|",
      ($items[] | "| `\(.address)` | \(.actions) | \(.keys) |")
    end
' "$PLAN" > "$OUT" || { echo "could not read $PLAN" >&2; exit 1; }
if [ -s "$OUT" ]; then
  cat "$OUT"
  rm -f "$OUT"
  exit 2
fi
rm -f "$OUT"
exit 0
