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
# 13.11 (KNOWN_ERRORS 127): the ARM apply RECREATED the api service, and the
# «status» report landed in that window (ALB 503) — curl's 3 quick retries
# gave up, the request stayed «applying» for 3 h and blocked the next switch.
# Now a 5xx / no answer is retried with a fresh token every 20 s, up to 15
# minutes for «status» (the apply may have restarted the API) and 2 minutes
# for the other calls. A 4xx is final at once.
WINDOW=120; [ "$WHAT" = status ] && WINDOW=900
DEADLINE=$(( $(date +%s) + WINDOW ))
OUT=$(mktemp)
while :; do
  TOKEN=$(curl -fsS -H "Authorization: bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
    "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=lawbid-infra-apply" | jq -r '.value')
  # 2026-11-10: to STDERR. The callers keep this script's stdout as the API's
  # JSON (`> job.json`, `| jq`); the mask line on stdout made every automatic
  # cloud change fail at «start» (jq: parse error at line 1, column 1). The
  # runner reads workflow commands from stderr too.
  echo "::add-mask::${TOKEN}" >&2
  ARGS=(-sS -o "$OUT" -w '%{http_code}' -X "$METHOD"
    -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json'
    --max-time 30 --retry 3)
  [ -n "$BODY" ] && ARGS+=(--data "$BODY")
  CODE=$(curl "${ARGS[@]}" "${API%/}/api/v1/infra/workflow/requests/${ID}/${WHAT}" || echo 000)
  CODE=${CODE: -3}
  [ "${CODE:0:1}" = "2" ] && break
  if [ "${CODE:0:1}" = "4" ] || [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "api.sh: HTTP $CODE from $WHAT" >&2
    head -c 500 "$OUT" >&2; echo >&2
    rm -f "$OUT"
    exit 1
  fi
  echo "api.sh: HTTP $CODE from $WHAT, retrying in 20 s" >&2
  sleep 20
done
cat "$OUT"
rm -f "$OUT"
