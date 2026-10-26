#!/usr/bin/env bash
# Owner 2026-10-26: infra switches from the admin. One call from the
# infra-apply workflow to the LawBid API, authenticated with a FRESH GitHub
# Actions OIDC token (audience lawbid-infra-apply; the API checks GitHub's
# signature, the repository, this workflow file and refs/heads/main). No
# stored secret. Needs `permissions: id-token: write` in the job.
#
#   scripts/infra/api.sh GET  <request-id> decision
#   scripts/infra/api.sh POST <request-id> plan  @body.json   (or a JSON string)
#
# Prints the response body; exit 1 on an HTTP error (body on stderr).
set -euo pipefail
METHOD=${1:?method}
ID=${2:?request id}
WHAT=${3:?start|plan|decision|status}
BODY=${4:-}
API=${LAWBID_API_URL:?LAWBID_API_URL}
[[ "$ID" =~ ^[0-9a-f-]{36}$ ]] || { echo "api.sh: bad request id" >&2; exit 1; }
[[ "$WHAT" =~ ^(start|plan|decision|status)$ ]] || { echo "api.sh: bad call" >&2; exit 1; }
: "${ACTIONS_ID_TOKEN_REQUEST_URL:?the job needs permissions: id-token: write}"
TOKEN=$(curl -fsS -H "Authorization: bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
  "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=lawbid-infra-apply" | jq -r '.value')
echo "::add-mask::${TOKEN}"
OUT=$(mktemp)
ARGS=(-sS -o "$OUT" -w '%{http_code}' -X "$METHOD"
  -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json'
  --max-time 30 --retry 3)
[ -n "$BODY" ] && ARGS+=(--data "$BODY")
CODE=$(curl "${ARGS[@]}" "${API%/}/api/v1/infra/workflow/requests/${ID}/${WHAT}")
if [ "${CODE:0:1}" != "2" ]; then
  echo "api.sh: HTTP $CODE from $WHAT" >&2
  head -c 500 "$OUT" >&2; echo >&2
  rm -f "$OUT"
  exit 1
fi
cat "$OUT"
rm -f "$OUT"
