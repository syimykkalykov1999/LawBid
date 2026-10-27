#!/usr/bin/env bash
# Body of .github/workflows/notify-failure.yml. Never fails the caller: an
# alert that cannot be sent is a warning, the red run itself stays visible.
set -uo pipefail
: "${TITLE:?}" "${KIND:?}" "${RUN_URL:?}"
SEVERITY="${SEVERITY:-error}"; REMIND_MIN="${REMIND_MIN:-60}"
MSG="LawBid CI: ${TITLE}
workflow: ${GITHUB_WORKFLOW:-?} | branch: ${GITHUB_REF_NAME:-?} | commit: ${GITHUB_SHA:0:9}
run: ${RUN_URL}"
echo "$MSG"
{ echo "### ${TITLE}"; echo; echo "$MSG"; } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"

# 1. GitHub issue (dedup by kind)
if [ "$SEVERITY" = "error" ] && [ -n "${GH_TOKEN:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ]; then
  gh label create ci-alert --color B60205 --description "CI / deploy alert (notify-failure)" 2>/dev/null || true
  KEY="[ci-alert:${KIND}]"
  NUM=$(gh issue list --label ci-alert --state open --search "\"${KEY}\" in:title" --json number,title \
        --jq "[.[] | select(.title | contains(\"${KEY}\"))][0].number // empty" 2>/dev/null || true)
  if [ -z "$NUM" ]; then
    gh issue create --label ci-alert --title "${KEY} ${TITLE}" --body "$MSG

Close this issue when it is fixed; the next failure opens a new one." >/dev/null 2>&1 \
      || echo "::warning::could not open the ci-alert issue"
  else
    LAST=$(gh issue view "$NUM" --json comments,createdAt --jq '[.comments[].createdAt, .createdAt] | max' 2>/dev/null || true)
    AGE=999999
    [ -n "$LAST" ] && AGE=$(( ( $(date +%s) - $(date -d "$LAST" +%s 2>/dev/null || echo 0) ) / 60 ))
    if [ "$AGE" -ge "$REMIND_MIN" ]; then gh issue comment "$NUM" --body "$MSG" >/dev/null 2>&1 || true; fi
  fi
fi

# 2. SNS (the owner's existing alert topic)
if [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
  if [ -z "${SNS_TOPIC_ARN:-}" ]; then
    ACCT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)
    SNS_TOPIC_ARN="arn:aws:sns:${AWS_REGION:-us-east-1}:${ACCT}:${ALERTS_TOPIC_NAME:-lawbid-prod-alerts}"
  fi
  aws sns publish --topic-arn "$SNS_TOPIC_ARN" --subject "LawBid CI: ${TITLE}" --message "$MSG" >/dev/null 2>&1 \
    && echo "SNS notified" || echo "::warning::SNS publish failed"
fi

# 3. Chat webhook (Slack-style {"text": ...})
if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
  jq -n --arg t "$MSG" '{text: $t}' | curl -fsS -m 15 -H 'content-type: application/json' -d @- "$ALERT_WEBHOOK_URL" >/dev/null \
    && echo "webhook notified" || echo "::warning::webhook failed"
fi
exit 0
