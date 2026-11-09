#!/usr/bin/env bash
# Zero maintenance (owner 2026-10-05): the daily «всё ли на месте» check of
# .github/workflows/self-check.yml. Read-only. Fails (→ GitHub e-mails the
# owner) when something that is supposed to protect the system silently
# stopped doing it:
#   1. the API answers /health/ready (DB + Redis reachable)
#   2. every CloudWatch alarm exists, has its actions on and is not firing
#   3. the alert e-mail subscription is confirmed (else nobody gets alerts)
#   4. the monthly AWS budget exists
#   5. api and worker run as many tasks as they should
#   6. the newest database backup is fresh (scripts/deploy/check-backup.sh)
#   7. the restore drill was done within 100 days (docs/runbooks/restore-drill.md)
# Usage: scripts/ops/self-check.sh <env> <api url>   e.g. prod https://api.lawbid.dev
set -uo pipefail
ENV="${1:?env (prod|staging)}"
API_URL="${2:?api url}"
NAME="lawbid-${ENV}"
MIN_ALARMS="${MIN_ALARMS:-20}"
FAIL=0
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/stdout}"

ok()   { echo "✅ $1" | tee -a "$SUMMARY"; }
warn() { echo "⚠️ $1" | tee -a "$SUMMARY"; echo "::warning::$1"; }
bad()  { echo "❌ $1" | tee -a "$SUMMARY"; echo "::error::$1"; FAIL=1; }

echo "## Самопроверка ${NAME} — $(date -u '+%Y-%m-%d %H:%M UTC')" >> "$SUMMARY"

# 1. API
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${API_URL%/}/health/ready" || echo 000)
if [ "$code" = "200" ]; then ok "Приложение отвечает, база и Redis доступны"
else bad "Приложение не отвечает как надо (/health/ready = $code). Инструкция: docs/runbooks/db-redis-unavailable.md"; fi

# Automation audit 2026-11-08: a missing permission used to read as «0
# alarms», «no topic», «no budget» (the role was never re-applied in
# infra/bootstrap). Say which one it is.
denied() { grep -qiE 'AccessDenied|not authorized|AuthorizationError' "$1"; }
ROLE_FIX="у роли GitHub нет прав на чтение: владелец — terraform apply в infra/bootstrap (docs/dev/AUTOMATION_AUDIT_2026-11-08.md)"

# 2. Alarms
alarms=$(aws cloudwatch describe-alarms --alarm-name-prefix "${NAME}-" --output json 2>/tmp/alarms.err || echo '{}')
denied /tmp/alarms.err && bad "Тревоги не проверены: $ROLE_FIX"
count=$(echo "$alarms" | jq '.MetricAlarms | length // 0')
off=$(echo "$alarms" | jq -r '[.MetricAlarms[]? | select(.ActionsEnabled == false) | .AlarmName] | join(", ")')
firing=$(echo "$alarms" | jq -r '[.MetricAlarms[]? | select(.StateValue == "ALARM") | .AlarmName] | join(", ")')
if [ "$count" -lt "$MIN_ALARMS" ]; then bad "Тревог в CloudWatch $count, ожидалось не меньше $MIN_ALARMS: запустите «ставь на AWS» (terraform apply)"
else ok "Тревог в CloudWatch: $count"; fi
[ -n "$off" ] && bad "У тревог выключены действия (письма не придут): $off"
[ -n "$firing" ] && bad "Сейчас горят тревоги: $firing (что делать — в письме от AWS и в docs/runbooks/OWNER.md)"

# 3. E-mail subscription confirmed
topic=$(aws sns list-topics --output json 2>/tmp/sns.err | jq -r --arg n "${NAME}-alerts" '.Topics[].TopicArn | select(endswith(":" + $n))' | head -1)
if denied /tmp/sns.err; then bad "Подписка на тревоги не проверена: $ROLE_FIX"
elif [ -z "$topic" ]; then bad "Нет темы оповещений ${NAME}-alerts"
else
  subs=$(aws sns list-subscriptions-by-topic --topic-arn "$topic" --output json)
  confirmed=$(echo "$subs" | jq '[.Subscriptions[] | select(.Protocol == "email" and .SubscriptionArn != "PendingConfirmation")] | length')
  pending=$(echo "$subs" | jq -r '[.Subscriptions[] | select(.SubscriptionArn == "PendingConfirmation") | .Endpoint] | join(", ")')
  if [ "$confirmed" -ge 1 ]; then ok "Письма-тревоги приходят на почту ($confirmed адрес(а))"
  else bad "Никто не подтвердил подписку на тревоги: откройте письмо «AWS Notification - Subscription Confirmation» и нажмите Confirm"; fi
  [ -n "$pending" ] && warn "Не подтверждена подписка: $pending"
fi

# 4. Budget
acct=$(aws sts get-caller-identity --query Account --output text)
if aws budgets describe-budget --account-id "$acct" --budget-name "${NAME}-monthly" --output json > /tmp/budget.json 2>/tmp/budget.err; then
  spent=$(jq -r '.Budget.CalculatedSpend.ActualSpend.Amount // "0"' /tmp/budget.json)
  limit=$(jq -r '.Budget.BudgetLimit.Amount' /tmp/budget.json)
  ok "Бюджет AWS есть: потрачено \$${spent%.*} из \$${limit%.*}"
elif denied /tmp/budget.err; then bad "Бюджет не проверен: $ROLE_FIX"
else bad "Нет бюджета AWS ${NAME}-monthly: запустите «ставь на AWS» (terraform apply)"; fi

# 5. Services
svc=$(aws ecs describe-services --cluster "$NAME" --services api worker --output json 2>/dev/null || echo '{}')
for s in api worker; do
  run=$(echo "$svc" | jq --arg s "$s" '[.services[]? | select(.serviceName == $s) | .runningCount][0] // 0')
  want=$(echo "$svc" | jq --arg s "$s" '[.services[]? | select(.serviceName == $s) | .desiredCount][0] // 0')
  if [ "$run" -ge 1 ] && [ "$run" -ge "$want" ]; then ok "Сервис $s: работает $run из $want"
  else bad "Сервис $s: работает $run из $want. Инструкция: docs/runbooks/ecs-capacity.md"; fi
done

# 6. Backups
if out=$(sh "$(dirname "$0")/../deploy/check-backup.sh" 2>&1); then ok "Бэкап базы: ${out##*: }"
else bad "Свежего бэкапа базы нет: $out. Инструкция: docs/runbooks/backup-failed.md"; fi

# 7. Restore drill (a backup nobody ever restored is a hope, not a backup)
last=$(grep -oE '^\| 20[0-9]{2}-[0-9]{2}-[0-9]{2}' "$(dirname "$0")/../../docs/runbooks/restore-drill.md" | tr -d '| ' | sort | tail -1)
if [ -z "$last" ]; then warn "Учебного восстановления базы ещё не было (docs/runbooks/restore-drill.md) — сделать после запуска"
else
  age=$(( ( $(date +%s) - $(date -d "$last" +%s) ) / 86400 ))
  if [ "$age" -le 100 ]; then ok "Учебное восстановление было $age дн. назад"
  else warn "Учебное восстановление было $age дн. назад — пора повторить (scripts/ops/restore-drill.sh)"; fi
fi

# 8. Rollback target (automation audit 2026-11-08): deploy.yml writes the
# release that passed smoke to SSM last_good_tag. It had stayed at 28.10
# while many releases went out (the role lacked ssm:PutParameter), so a
# rollback would have gone two weeks back.
running=$(aws ecs describe-task-definition --task-definition "$(aws ecs describe-services --cluster "$NAME" --services api --query 'services[0].taskDefinition' --output text 2>/dev/null)" \
  --query 'taskDefinition.containerDefinitions[0].image' --output text 2>/dev/null | sed 's/.*://')
if lg=$(aws ssm get-parameter --name "/${NAME}/deploy/last_good_tag" --query Parameter.Value --output text 2>/tmp/ssm.err); then
  if [ -n "$running" ] && [ "$lg" = "$running" ]; then ok "Точка отката совпадает с работающей версией (${lg:0:9})"
  else bad "Точка отката (last_good_tag ${lg:0:9}) не совпадает с работающей версией ${running:0:9}: откат вернул бы старую версию. Деплой не смог записать её — $ROLE_FIX"; fi
elif denied /tmp/ssm.err; then bad "Точка отката не проверена: $ROLE_FIX"
else warn "Точки отката last_good_tag ещё нет"; fi

exit $FAIL
