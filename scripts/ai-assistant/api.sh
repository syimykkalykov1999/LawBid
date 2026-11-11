#!/usr/bin/env bash
# 09.11.2026: one call from .github/workflows/ai-assistant.yml to the LawBid
# API, authenticated with a FRESH GitHub Actions OIDC token (audience
# lawbid-ai-assistant; the API checks GitHub's signature, the repository, this
# workflow file and refs/heads/main). No stored secret. Same pattern as
# scripts/infra/api.sh. Needs `permissions: id-token: write`.
#
#   scripts/ai-assistant/api.sh gate|digest            -> prints the JSON body
#   scripts/ai-assistant/api.sh report @body.json      -> books the run
set -euo pipefail
WHAT=${1:?gate|digest|report}
BODY=${2:-'{}'}
API=${LAWBID_API_URL:?LAWBID_API_URL}
[[ "$WHAT" =~ ^(gate|digest|report)$ ]] || { echo "api.sh: bad call" >&2; exit 1; }
: "${ACTIONS_ID_TOKEN_REQUEST_URL:?the job needs permissions: id-token: write}"
TOKEN=$(curl -fsS -H "Authorization: bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
  "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=lawbid-ai-assistant" | jq -r '.value')
echo "::add-mask::${TOKEN}"
OUT=$(mktemp)
CODE=$(curl -sS -o "$OUT" -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
  --max-time 30 --retry 3 --data "$BODY" \
  "${API%/}/api/v1/ai-assistant/workflow/${WHAT}")
if [ "${CODE:0:1}" != "2" ]; then
  echo "api.sh: HTTP $CODE from $WHAT" >&2
  head -c 300 "$OUT" >&2; echo >&2
  rm -f "$OUT"
  exit 1
fi
cat "$OUT"
rm -f "$OUT"
