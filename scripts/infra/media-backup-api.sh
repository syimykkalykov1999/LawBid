#!/usr/bin/env bash
# 26.11 (D10): one call from .github/workflows/media-backup.yml to the LawBid
# API with a FRESH GitHub Actions OIDC token (audience lawbid-media-backup; the
# API checks GitHub's signature, the repository, this workflow file and
# refs/heads/main). Same retry rules as scripts/infra/api.sh. No stored secret.
# Needs `permissions: id-token: write` in the job.
#
#   scripts/infra/media-backup-api.sh job    @ask.json
#   scripts/infra/media-backup-api.sh report @report.json
#
# Prints the response body; exit 1 on an HTTP error (body on stderr, cut).
set -euo pipefail
WHAT=${1:?job|report}
BODY=${2:?body}
API=${LAWBID_API_URL:?LAWBID_API_URL}
[[ "$WHAT" =~ ^(job|report)$ ]] || { echo "media-backup-api.sh: bad call" >&2; exit 1; }
: "${ACTIONS_ID_TOKEN_REQUEST_URL:?the job needs permissions: id-token: write}"
WINDOW=120; [ "$WHAT" = report ] && WINDOW=900
DEADLINE=$(( $(date +%s) + WINDOW ))
OUT=$(mktemp)
while :; do
  TOKEN=$(curl -fsS -H "Authorization: bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
    "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=lawbid-media-backup" | jq -r '.value')
  # To STDERR: stdout is the API's JSON (KNOWN_ERRORS: api.sh 2026-11-10).
  echo "::add-mask::${TOKEN}" >&2
  CODE=$(curl -sS -o "$OUT" -w '%{http_code}' -X POST \
    -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
    --max-time 30 --retry 3 --data "$BODY" \
    "${API%/}/api/v1/infra/workflow/media-backup/${WHAT}" || echo 000)
  CODE=${CODE: -3}
  [ "${CODE:0:1}" = "2" ] && break
  if [ "${CODE:0:1}" = "4" ] || [ "$(date +%s)" -ge "$DEADLINE" ]; then
    # The answer of «job» may hold the R2 token: never print a 2xx body here,
    # and only the first 300 characters of an error.
    echo "media-backup-api.sh: HTTP $CODE from $WHAT" >&2
    head -c 300 "$OUT" >&2; echo >&2
    rm -f "$OUT"
    exit 1
  fi
  echo "media-backup-api.sh: HTTP $CODE from $WHAT, retrying in 20 s" >&2
  sleep 20
done
cat "$OUT"
rm -f "$OUT"
