#!/usr/bin/env bash
# Одна кнопка для владельца: подтянуть настройки сервера (Terraform, прод) до
# актуального кода. Инструкция: docs/runbooks/TF_CATCHUP.md.
#
#   bash scripts/dev/tf-catchup.sh plan    # 1) только ПЛАН: ничего не меняет
#   bash scripts/dev/tf-catchup.sh apply   # 2) применить ровно тот план (после вашего «ДА»)
#
# Правила (жёсткие):
#   * Скрипт сам НИКОГДА ничего не применяет. `plan` только считает и печатает
#     по-русски; `apply` — отдельная команда, которую запускаете вы, и она ещё
#     раз спрашивает «ДА».
#   * Без входа в AWS (`aws sts get-caller-identity` не прошёл) — отказ.
#   * Любое удаление (кроме новых версий описания задач ECS) или замена
#     (-/+) серверов ECS, базы, Redis — красный СТОП, `apply` такой план не примет.
#   * Применяется только сохранённый план (tfplan), не «свежий»: Terraform
#     откажется, если состояние сменилось; плюс скрипт сверяет версию кода на
#     сервере (иначе apply откатил бы свежую выкладку).
#   * Секреты (tfvars, план) лежат в папке ~/.lawbid-tf-catchup (права 700) и
#     удаляются после apply. В экран и в git не попадают.
set -euo pipefail
umask 077

MODE="${1:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
TF_DIR="$ROOT/infra/envs/prod"
WORK="${LAWBID_TF_WORK:-$HOME/.lawbid-tf-catchup}"
SECRET_ID="${TFVARS_SECRET_ID:-lawbid-prod/terraform-tfvars}"
CLUSTER="${CLUSTER:-lawbid-prod}"
MAX_PLAN_AGE_SECONDS=$((2 * 3600))

RED=$'\033[1;31m'; GREEN=$'\033[1;32m'; YELLOW=$'\033[1;33m'; BOLD=$'\033[1m'; OFF=$'\033[0m'
say()  { printf '%s\n' "$*"; }
die()  { printf '%s%s%s\n' "$RED" "$*" "$OFF" >&2; exit 1; }
stop() {
  printf '\n%s############################################%s\n' "$RED" "$OFF"
  printf '%s#   СТОП. НЕ ПРИМЕНЯЙТЕ. Напишите Claude.   #%s\n' "$RED" "$OFF"
  printf '%s############################################%s\n' "$RED" "$OFF"
}

usage() {
  say "Использование:"
  say "  bash scripts/dev/tf-catchup.sh plan    — посмотреть, что изменится (ничего не меняет)"
  say "  bash scripts/dev/tf-catchup.sh apply   — применить тот самый план (спросит «ДА»)"
  exit 2
}
[ "$MODE" = "plan" ] || [ "$MODE" = "apply" ] || usage

# --- 0. инструменты -----------------------------------------------------------
for tool in aws terraform jq git; do
  command -v "$tool" >/dev/null 2>&1 || die "Не найдена программа «$tool». Напишите Claude: она нужна для этого шага."
done

# --- 1. вход в AWS (без него — отказ) -----------------------------------------
if ! IDENTITY="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)" || [ -z "$IDENTITY" ]; then
  die "Вы не вошли в AWS. Сначала выполните:  aws login   (откроется браузер, войдите в аккаунт AWS), потом запустите эту команду ещё раз."
fi
# Terraform не умеет читать вход `aws login` напрямую: отдаём ему временные ключи
# этого входа (живут в памяти этого запуска, на экран не печатаются).
if [ -z "${AWS_ACCESS_KEY_ID:-}" ]; then
  if CREDS="$(aws configure export-credentials --format env 2>/dev/null)"; then
    eval "$CREDS"
  fi
fi
if [ -z "${AWS_REGION:-}" ] && [ -z "${AWS_DEFAULT_REGION:-}" ]; then
  REGION_FROM_BACKEND=""
  for f in "$TF_DIR/backend.hcl" "$TF_DIR/backend.hcl.example"; do
    [ -f "$f" ] && [ -z "$REGION_FROM_BACKEND" ] && REGION_FROM_BACKEND="$(sed -n 's/^region[[:space:]]*=[[:space:]]*"\(.*\)"/\1/p' "$f" || true)"
  done
  export AWS_REGION="${REGION_FROM_BACKEND:-us-east-1}"
fi
export TF_IN_AUTOMATION=1 TF_INPUT=0

mkdir -p "$WORK"
chmod 700 "$WORK"
PLAN_FILE="$WORK/tfplan"
PLAN_JSON="$WORK/plan.json"
META="$WORK/plan.meta"
IMAGES="$WORK/current-images.tfvars"
TFVARS="$WORK/terraform.tfvars"

# --- общие функции ---------------------------------------------------------------
current_images() {
  # Какие версии кода на сервере прямо сейчас (Deploy создаёт их мимо Terraform).
  CLUSTER="$CLUSTER" sh "$ROOT/scripts/deploy/current-tag.sh"
}

# Печатает русскую сводку по $PLAN_JSON. Возврат 0 = можно дальше, 1 = красный СТОП.
summarize() {
  local json="$1"
  local add change replace destroy
  add=$(jq '[.resource_changes[]? | select(.change.actions == ["create"])] | length' "$json")
  change=$(jq '[.resource_changes[]? | select(.change.actions == ["update"])] | length' "$json")
  replace=$(jq '[.resource_changes[]? | select((.change.actions | index("delete")) and (.change.actions | index("create"))) | select(.type != "aws_ecs_task_definition")] | length' "$json")
  newrev=$(jq '[.resource_changes[]? | select(.type == "aws_ecs_task_definition" and (.change.actions | index("create")) and (.change.actions | index("delete")))] | length' "$json")
  destroy=$(jq '[.resource_changes[]? | select(.change.actions == ["delete"])] | length' "$json")

  say ""
  say "${BOLD}=== ПЛАН ДЛЯ ПРОДА (аккаунт AWS $IDENTITY) ===${OFF}"
  say "  Будет добавлено:       $add"
  say "  Будет изменено:        $change"
  say "  Будет заменено (-/+):  $replace"
  say "  Будет удалено:         $destroy"
  if [ "$newrev" -gt 0 ]; then
    say "  Новых версий описаний задач ECS: $newrev (обычное дело при смене настроек, не замена серверов)"
  fi

  say ""
  say "Что именно (по видам, имена ресурсов без значений):"
  jq -r '
    def human:
      if . == "aws_cloudwatch_metric_alarm" then "тревоги CloudWatch"
      elif . == "aws_cloudwatch_event_rule" or . == "aws_cloudwatch_event_target" then "правила событий (EventBridge)"
      elif . == "aws_cloudwatch_log_metric_filter" then "счётчики из журналов"
      elif . == "aws_iam_role_policy" or . == "aws_iam_policy" or . == "aws_iam_role_policy_attachment" then "права доступа (IAM)"
      elif . == "aws_ecs_task_definition" then "описания задач ECS (новые версии)"
      elif . == "aws_ecs_service" then "серверы ECS (перезапуск по очереди)"
      elif . == "aws_ssm_parameter" then "параметры SSM"
      elif . == "aws_secretsmanager_secret" then "оболочки секретов (без значений)"
      else . end;
    [.resource_changes[]?
      | select(.change.actions != ["no-op"] and .change.actions != ["read"])
      | {type: .type, a: (.change.actions | join("+"))}]
    | group_by([.type, .a])
    | map({k: "\(.[0].type | human)", a: .[0].a, n: length})
    | sort_by(-.n)
    | .[:25][]
    | "  \(.n) × \(.k)  [\(.a)]"' "$json"

  local rc=0
  local bad
  # Красный СТОП: любое удаление/замена, кроме новых версий описаний задач ECS.
  bad=$(jq -r '
    .resource_changes[]?
    | select(.change.actions | index("delete"))
    | select((.type == "aws_ecs_task_definition" and (.change.actions | index("create"))) | not)
    | select(.type | test("^(aws_ecs_service|aws_db_instance|aws_rds_cluster|aws_elasticache_.*)$") | not)
    | "  - \(.address)  [\(.change.actions | join("+"))]"' "$json")
  # Отдельно по именам — самые опасные.
  local critical
  critical=$(jq -r '
    .resource_changes[]?
    | select(.change.actions | index("delete"))
    | select(.type | test("^(aws_ecs_service|aws_db_instance|aws_rds_cluster|aws_elasticache_.*)$"))
    | "  - \(.address)  [\(.change.actions | join("+"))]"' "$json")

  if [ -n "$critical" ]; then
    stop
    say "${RED}План заменяет или удаляет серверы, базу или Redis:${OFF}"
    say "$critical"
    rc=1
  fi
  if [ -n "$bad" ]; then
    if [ "$rc" = 0 ]; then stop; fi
    say "${RED}План что-то удаляет или пересоздаёт:${OFF}"
    say "$bad"
    rc=1
  fi
  if [ "$rc" = 0 ]; then
    if [ "$(jq '[.resource_changes[]? | select(.type == "aws_ecs_service" and .change.actions == ["update"])] | length' "$json")" -gt 0 ]; then
      say ""
      say "${YELLOW}Внимание:${OFF} серверы (api, worker, admin) перезапустятся по очереди, без остановки сайта."
      say "Версия кода при этом остаётся ТЕКУЩЕЙ (скрипт подставил её с сервера)."
    fi
    say ""
    say "${GREEN}Опасных удалений и замен нет.${OFF}"
  fi
  return "$rc"
}

# --- 2. plan -------------------------------------------------------------------------
if [ "$MODE" = "plan" ]; then
  say "${BOLD}Шаг 1 из 2: считаю план (ничего не меняется)...${OFF}"

  # Код должен быть свежим main: иначе планируем вчерашнее.
  if git -C "$ROOT" fetch -q origin 2>/dev/null; then
    BEHIND="$(git -C "$ROOT" rev-list --count HEAD..origin/main 2>/dev/null || echo 0)"
    if [ "${BEHIND:-0}" -gt 0 ]; then
      die "У вас старая версия кода (на $BEHIND коммитов позади). Сначала:  cd $ROOT && git pull   — потом запустите команду заново."
    fi
  fi

  # Старый локальный terraform.tfvars мешал бы: настоящие значения берём из Secrets Manager.
  if [ -f "$TF_DIR/terraform.tfvars" ]; then
    mv "$TF_DIR/terraform.tfvars" "$TF_DIR/terraform.tfvars.old-$(date +%Y%m%d%H%M%S)"
    say "Старый локальный terraform.tfvars отложен в сторону (значения берутся из Secrets Manager)."
  fi

  rm -f "$PLAN_FILE" "$PLAN_JSON" "$META"
  aws secretsmanager get-secret-value --secret-id "$SECRET_ID" --query SecretString --output text > "$TFVARS" \
    || die "Не смог прочитать настройки прода из Secrets Manager ($SECRET_ID). Проверьте вход: aws login. Если вошли — напишите Claude."
  chmod 600 "$TFVARS"
  [ -s "$TFVARS" ] || die "Файл настроек прода пустой. Напишите Claude."

  current_images > "$IMAGES" || die "Не смог узнать текущую версию кода на сервере. Напишите Claude."
  grep -q '^api_image = "' "$IMAGES" && grep -q '^admin_image = "' "$IMAGES" && ! grep -q '"None"' "$IMAGES" \
    || die "Текущая версия кода на сервере не определилась. Напишите Claude."
  chmod 600 "$IMAGES"

  BACKEND="$TF_DIR/backend.hcl"
  [ -f "$BACKEND" ] || BACKEND="$TF_DIR/backend.hcl.example"
  cd "$TF_DIR"
  say "Подготовка Terraform (init)..."
  terraform init -input=false -backend-config="$BACKEND" > "$WORK/init.log" 2>&1 \
    || { grep -E '^(Error|│ Error)' "$WORK/init.log" | cut -c1-200 | head -5; die "Terraform init не прошёл. Напишите Claude."; }

  say "Считаю план (это 2-10 минут)..."
  set +e
  terraform plan -input=false -no-color -lock-timeout=120s \
    -var-file="$TFVARS" -var-file="$IMAGES" -out="$PLAN_FILE" > "$WORK/plan.log" 2>&1
  PRC=$?
  set -e
  if [ "$PRC" != 0 ]; then
    grep -E '^(Error|│ Error)' "$WORK/plan.log" | cut -c1-200 | head -10 || true
    rm -f "$PLAN_FILE" "$TFVARS" "$IMAGES"
    die "План не получился. Ничего не изменено. Скопируйте строки выше и напишите Claude."
  fi

  terraform show -json "$PLAN_FILE" > "$PLAN_JSON"

  RESULT="OK"
  summarize "$PLAN_JSON" || RESULT="STOP"
  # Готовая защита репозитория от потери данных (база, секреты, KMS, Redis, S3).
  if ! sh "$ROOT/scripts/deploy/plan-guard.sh" "$PLAN_FILE" > "$WORK/guard.log" 2>&1; then
    RESULT="STOP"
    stop
    say "${RED}$(cat "$WORK/guard.log")${OFF}"
  fi

  {
    echo "result=$RESULT"
    echo "created=$(date +%s)"
    echo "account=$IDENTITY"
    echo "plan_sha=$(shasum -a 256 "$PLAN_FILE" | cut -d' ' -f1)"
  } > "$META"
  rm -f "$WORK/plan.log" "$WORK/init.log" "$WORK/guard.log"

  say ""
  if [ "$RESULT" = "OK" ]; then
    say "${GREEN}План готов и безопасен.${OFF} Прочитайте сводку выше. Если всё понятно:"
    say "  ${BOLD}bash scripts/dev/tf-catchup.sh apply${OFF}"
    say "(план действует 2 часа; ничего ещё не изменено)"
    exit 0
  fi
  exit 1
fi

# --- 3. apply --------------------------------------------------------------------------
say "${BOLD}Шаг 2 из 2: применение сохранённого плана.${OFF}"
[ -f "$PLAN_FILE" ] && [ -f "$META" ] && [ -f "$PLAN_JSON" ] || die "Нет сохранённого плана. Сначала:  bash scripts/dev/tf-catchup.sh plan"

meta() { sed -n "s/^$1=//p" "$META" | head -1; }
[ "$(meta result)" = "OK" ] || { stop; die "Прошлый план был с красным СТОП. Применять нельзя. Напишите Claude."; }
[ "$(meta account)" = "$IDENTITY" ] || die "Вы вошли в другой аккаунт AWS, чем при плане. Сделайте план заново."
AGE=$(( $(date +%s) - $(meta created) ))
[ "$AGE" -le "$MAX_PLAN_AGE_SECONDS" ] || die "Плану больше 2 часов. Сделайте заново:  bash scripts/dev/tf-catchup.sh plan"
[ "$(shasum -a 256 "$PLAN_FILE" | cut -d' ' -f1)" = "$(meta plan_sha)" ] || die "Файл плана изменился. Сделайте заново:  bash scripts/dev/tf-catchup.sh plan"

# Выкладка кода между plan и apply: apply вернул бы старую версию.
NOW_IMAGES="$(current_images)" || die "Не смог узнать текущую версию кода на сервере. Напишите Claude."
[ "$NOW_IMAGES" = "$(cat "$IMAGES")" ] || die "За это время на сервере сменилась версия кода (прошла выкладка). Сделайте план заново:  bash scripts/dev/tf-catchup.sh plan"

# Повторная проверка тем же правилом (не доверяем одной записи «OK»).
cd "$TF_DIR"
summarize "$PLAN_JSON" || { stop; die "Применять нельзя."; }
sh "$ROOT/scripts/deploy/plan-guard.sh" "$PLAN_FILE" >/dev/null 2>&1 || { stop; die "Защита plan-guard не пропустила план."; }

say ""
say "Откат: эти изменения только ДОБАВЛЯЮТ (права, тревоги, настройку) и подтягивают сервер к коду."
say "Убрать их — отдельный план, а не «apply старого состояния» (см. docs/runbooks/TF_CATCHUP.md)."
if [ ! -t 0 ]; then
  die "Нужен живой Терминал для вопроса «ДА». Запустите команду вручную."
fi
printf '\n%sПрименить этот план на ПРОДЕ?%s Напишите заглавными  ДА  и нажмите Enter (всё другое — отмена): ' "$BOLD" "$OFF"
read -r ANSWER
[ "$ANSWER" = "ДА" ] || { say "Отменено. Ничего не изменено."; exit 0; }

say "Применяю..."
set +e
terraform apply -input=false -no-color -lock-timeout=120s "$PLAN_FILE" > "$WORK/apply.log" 2>&1
ARC=$?
set -e
grep -E '(Creating\.\.\.|Modifying\.\.\.|Destroying\.\.\.|Creation complete|Modifications complete|Apply complete)' "$WORK/apply.log" | cut -c1-160 | tail -60 || true
if [ "$ARC" != 0 ]; then
  grep -E '^(Error|│ Error)' "$WORK/apply.log" | cut -c1-200 | head -10 || true
  rm -f "$WORK/apply.log"
  die "Применение остановилось на ошибке. НЕ запускайте ничего руками: Terraform уже сохранил, что успел. Скопируйте строки выше и напишите Claude."
fi
rm -f "$WORK/apply.log" "$PLAN_FILE" "$PLAN_JSON" "$META" "$TFVARS" "$IMAGES"
say ""
say "${GREEN}Готово.${OFF} Настройки сервера подтянуты. Дальше — выкладка кода (Deploy → Approve), как обычно."
