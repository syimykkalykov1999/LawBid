# Звонок на телефон при аварии (PagerDuty Free)

> **Для владельца:** обычные тревоги приходят письмом (и в Slack). Самые
> серьёзные (6 «составных» тревог: SMS-коды, звонки, пуши — быстрая и
> медленная порча) **ещё и звонят/пишут на телефон** через PagerDuty. Это
> бесплатно: PagerDuty Free даёт 5 человек и **100 звонков/SMS в месяц**
> (пуши в приложение и письма без лимита), цена и лимит на 2026-10-24:
> <https://www.pagerduty.com/pricing/incident-management/>.
> Поэтому на телефон идут только тревоги, которые правда нужно знать
> сразу. Остальные не звонят и квоту не тратят.

Почему не другое (исследование 2026-10-24):

- **AWS Incident Manager** закрыт для новых клиентов.
- **Grafana OnCall OSS** заархивирован 2026-03-24 (<https://grafana.com/blog/grafana-oncall-maintenance-mode/>).
- **Amazon Q Developer in chat applications** (бывший AWS Chatbot) пишет в
  Slack/Teams, но не звонит: хороший второй канал, не пейджер.
- Better Stack: звонки только платно (от ≈ $29/мес, цена не проверена).

## Что делает код

- Второй SNS-топик `lawbid-prod-critical` (рядом с `lawbid-prod-alerts`).
- В него публикуют **только** 6 составных тревог `lawbid-prod-slo-<otp|call|push>-<fast|slow>`
  (`infra/modules/monitoring/slo.tf`), и при тревоге, и при «OK» (PagerDuty
  сам закрывает инцидент по OK).
- Подписка PagerDuty: HTTPS на ссылку интеграции. Есть **два пути, берите
  один**:
  1. **Из админки (с 2026-10-24, рекомендуется):** ссылка вставляется в
     «Ключи и сервисы» → PagerDuty, сервер сам подписывает её на топик
     через AWS (`sns:Subscribe`). Ни apply, ни tfvars не нужны. Эту
     подписку Terraform **не ведёт и не трогает** (её нет в его состоянии).
  2. Старый путь через Terraform: переменная `pagerduty_https_endpoint`
     (секретная, лежит только в Secrets Manager
     `lawbid-prod/terraform-tfvars`). Пока `null`, этой подписки нет.
  Письмо на `alert_emails` с топика critical приходит в любом случае
  (`critical_email_too = true`).
- Откат: из админки — «Ключи и сервисы» → PagerDuty → удалить ключи
  (сервер сам отпишет ссылку). Через Terraform —
  `pagerduty_https_endpoint = null` → apply. Тревоги продолжают
  приходить письмом.

## Что делает владелец (руками, агент это не может)

1. Зарегистрироваться на <https://www.pagerduty.com> (план Free, свой
   рабочий e-mail). Подтвердить телефон, поставить приложение PagerDuty на
   iPhone, **разрешить уведомления и критические (обходят «Не беспокоить»)**.
2. Services → Service Directory → **New Service** → имя `LawBid prod`.
   Escalation policy: один уровень, вы. Интеграция: **Amazon CloudWatch**
   (в списке интеграций; подойдёт и «Events API v2»).
3. Скопировать **Integration URL** вида
   `https://events.pagerduty.com/integration/<ключ>/enqueue`.
   Это секрет: не в чат, не в git.
4. User settings → Notification rules: для High urgency включить **Push,
   потом Phone call через 1 минуту**, для SMS не включать (экономим квоту).
5. **Из админки (рекомендуется).** Админка → Безопасность → «Ключи и
   сервисы» → карточка **PagerDuty (звонок на телефон при аварии)** →
   вставить Integration URL → «Сохранить» (код 2FA) → «Проверить» →
   «Включить». Сервер сам подпишет ссылку на топик
   `lawbid-prod-critical` и отпишет прежнюю, если вы её меняли.
   (Один раз нужен `terraform apply` с правами на SNS для сервера — см.
   ниже «Права AWS».)
6. Админка → Система → **Запуск** → блок «Тревоги на телефон»: статус
   **Pending** (ждёт) → через минуту **Confirmed** (PagerDuty подтверждает
   сам). Кнопка **«Отправить тестовую тревогу»** публикует тестовое
   сообщение в топик: телефон должен зазвонить (это 1 из 100 бесплатных
   звонков в месяц; не чаще 3 раз в час). Acknowledge, потом Resolve.
7. Старый путь (если не хотите админку): вставить ссылку в секрет
   `lawbid-prod/terraform-tfvars` одной строкой
   `pagerduty_https_endpoint = "https://events.pagerduty.com/integration/XXXX/enqueue"`,
   дальше обычный порядок: `terraform plan` через
   `scripts/deploy/plan-guard.sh` → смотреть план → «ставь на AWS».
   Статус **Confirmed** виден там же, на «Запуске».

## Права AWS (владелец применяет один раз)

В Terraform (`infra/modules/stack/main.tf`, роль задачи API) добавлены
минимальные права, только на топик `lawbid-prod-critical`:
`sns:Subscribe`, `sns:ListSubscriptionsByTopic`, `sns:Publish` на сам
топик и `sns:Unsubscribe` на подписки этого топика. Плюс (для «Запуска»,
«Масштаба», «Расходов»): `budgets:ViewBudget` на бюджеты аккаунта,
`budgets:ModifyBudget` только на `lawbid-prod-monthly` и «LawBid Monthly»,
`budgets:DeleteBudget` только на «LawBid Monthly», и чтение расходов
`ce:GetCostAndUsage`, `ce:GetCostForecast`, `ce:ListCostAllocationTags`
(только чтение, Cost Explorer берёт $0.01 за запрос, поэтому сервер
спрашивает его не чаще раза в 6 часов). Применить: `terraform plan` через
`scripts/deploy/plan-guard.sh` → смотреть план → «ставь на AWS». До apply
страницы работают, но кнопки AWS отвечают «нет прав».

Потолок расходов, который владелец меняет в админке («Масштаб» → Бюджеты
AWS), Terraform больше не перезаписывает (`ignore_changes = [limit_amount]`
в `modules/budget`): `monthly_budget_usd` — только стартовое значение.

## Проверка из терминала (запасной способ)

```sh
aws sns publish --region us-east-1 \
  --topic-arn "$(aws sns list-topics --query "Topics[?contains(TopicArn,'lawbid-prod-critical')].TopicArn" --output text)" \
  --message '{"AlarmName":"lawbid-test-page","NewStateValue":"ALARM","NewStateReason":"test","Region":"US East (N. Virginia)","StateChangeTime":"2026-01-01T00:00:00.000+0000","AlarmDescription":"TEST - ignore","Trigger":{"MetricName":"x","Namespace":"x"}}'
```

Телефон должен зазвонить в течение минуты. Нажать Acknowledge, потом
Resolve. Одна такая проверка = 1 из 100 звонков в месяц. Шаблон сообщения
CloudWatch (поля `AlarmName`, `NewStateValue`) PagerDuty понимает; если
инцидент не создался, смотреть в PagerDuty → Service → Integrations
«Recent events».

## Если квота 100 звонков кончается

В PagerDuty → Analytics видно, какая тревога звонит чаще всего. «Мигающая»
тревога (OK ↔ ALARM) сжигает квоту ночью: сказать Claude «тревога
звонит часто» — поднимем порог или уберём медленную пару
(`slow`) из пейджера. Пейджер на Free остаётся последним звеном; всё
остальное идёт письмом.
