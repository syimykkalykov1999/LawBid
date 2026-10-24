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
- Подписка PagerDuty: HTTPS на ссылку интеграции (переменная
  `pagerduty_https_endpoint`, **секретная**, лежит только в Secrets
  Manager `lawbid-prod/terraform-tfvars`, в git её нет). Пока переменная
  `null`, подписки нет; письмо на `alert_emails` с топика critical
  по-прежнему приходит (`critical_email_too = true`).
- Откат: `pagerduty_https_endpoint = null` → apply (подписка удаляется,
  тревоги продолжают приходить письмом).

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
5. Вставить ссылку в секрет `lawbid-prod/terraform-tfvars` одной строкой:

   ```hcl
   pagerduty_https_endpoint = "https://events.pagerduty.com/integration/XXXX/enqueue"
   ```

   Дальше обычный порядок: `terraform plan` через `scripts/deploy/plan-guard.sh`
   → смотреть план → «ставь на AWS».
6. Подписка PagerDuty подтверждается сама (он открывает ссылку
   подтверждения). Проверить: AWS SNS → Topics → `lawbid-prod-critical` →
   Subscriptions: статус **Confirmed**.

## Проверка (после первого apply, один раз)

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
