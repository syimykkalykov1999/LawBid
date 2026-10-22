# Защита от больших счетов — чек-лист владельца

Код приложения уже ограничивает расходы (см. раздел «Что делает код»).
Но код — только одна линия обороны. Если в коде ошибка, украден ключ или
кто-то обошёл сервер, спасут только **лимиты в кабинетах провайдеров**.
Их может выставить только владелец аккаунта. Пройдите список ниже до
запуска и отмечайте галочки.

> Главное правило: **нигде не включать автопополнение баланса** и везде
> ставить оповещения о расходах на свою почту и телефон.

---

## 1. Twilio (SMS-коды)

Самый опасный провайдер: атака «SMS pumping» — бот заказывает коды на
дорогие иностранные номера, а оператор делится выручкой с мошенником.

- [ ] **Geo Permissions**: Console → Messaging → Settings → Geo
      permissions. Оставить включённой **только United States**. Всё
      остальное (включая Канаду и Карибские острова) — выключить.
- [ ] **SMS Pumping Protection**: Messaging → Settings → General →
      включить *SMS Pumping Protection* (если используется Verify —
      включить *Fraud Guard* там же).
- [ ] **Автопополнение выключено**: Billing → Payment methods →
      *Auto-recharge* = **Off**. Держать на балансе небольшую сумму
      (например, $20–50) и пополнять вручную.
- [ ] **Usage Triggers** (оповещения о расходе): Monitor → Usage
      Triggers → создать триггеры на *SMS: Price* например на $10, $25,
      $50 в день, действие — email/webhook.
- [ ] **Отдельный субаккаунт для продакшна**: Account → Subaccounts →
      создать `lawbid-prod`; ключи продакшна только от него. Тесты и
      разработка — в другом субаккаунте. Так утечка тестового ключа не
      тратит деньги продакшна, а расходы видны раздельно.
- [ ] Ключи (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`) — только в AWS
      Secrets Manager, никогда в репозитории или чатах.

## 2. AWS (сервер, почта SES, хранилище)

- [ ] **AWS Budgets**: Billing → Budgets → Create budget → *Cost budget*
      на месяц (например, $100). Оповещения на **50 %, 80 %, 100 %**
      (фактический и прогнозный расход) на почту владельца.
- [ ] **Budget action** (автоматическое действие при 100 %): в том же
      бюджете → *Actions* → применить IAM-политику, запрещающую запуск
      новых ресурсов (например, `ec2:RunInstances`, `ses:SendEmail`) для
      роли приложения. Это единственный способ в AWS *остановить*, а не
      просто предупредить.
- [ ] **Billing alarm** в CloudWatch (регион us-east-1): Billing → Billing
      preferences → включить *Receive CloudWatch billing alerts*, затем
      CloudWatch → Alarms → *EstimatedCharges* > вашего порога.
- [ ] **SES квота**: SES → Account dashboard → проверить *Sending quota*
      (сообщений в сутки и в секунду). Не запрашивать увеличение больше,
      чем реально нужно (код ограничивает 2000 писем/сутки).
- [ ] **WAF на ALB**: WAF → Web ACL для балансировщика → *Rate-based
      rule*: для путей `/api/v1/auth/otp/*` не более ~20 запросов за
      5 минут с одного IP, действие *Block*. Плюс AWS Managed Rules
      (Bot Control / IP reputation) по желанию.
- [ ] **Cost Anomaly Detection**: Billing → Cost Anomaly Detection →
      создать монитор по сервисам, оповещения на почту.
- [ ] После деплоя проверить, что в продакшне задан
      `TRUST_PROXY_HOPS=1` (иначе лимиты по IP не работают — все
      пользователи будут «одним IP» балансировщика).

## 3. Stripe (подписки) — Radar

- [ ] Dashboard → Radar → Rules: включить стандартные правила; добавить
      **Block if :risk_level: = 'highest'** и **Review if = 'elevated'**.
- [ ] Включить 3D Secure для рискованных платежей (*Request 3D Secure if
      3D Secure is recommended*).
- [ ] Ограничить повторные попытки с одной карты/IP (Radar rules по
      `:card_count_for_ip_address:` и т. п.) — защита от «card testing»,
      за который Stripe берёт комиссию за каждую попытку.
- [ ] Если будет использоваться **Stripe Identity** (проверка
      документов) — там оплата за каждую проверку; см. раздел 4.

## 4. Persona / Stripe Identity (проверка личности адвокатов)

Ещё не подключены в коде (этап файла 03). Когда будут:

- [ ] В договоре/кабинете Persona установить **месячный лимит (cap)
      количества проверок** и оповещения о приближении к нему.
- [ ] Для Stripe Identity — отдельное оповещение в Stripe о расходах.
- [ ] Код уже готов ограничить проверки: провайдер `id_check` в
      `CostGuardService` (по умолчанию 5/мин, 20/сутки, 200/месяц).
      Разработчик должен вызвать `consume('id_check')` перед каждой
      проверкой.

## 5. Google Cloud / Firebase (вход через Google, push-уведомления)

- [ ] **Firebase App Check**: включить для приложения (Play Integrity на
      Android, App Attest на iOS) и перевести в режим *Enforce* для
      используемых сервисов.
- [ ] **Ограничения API-ключей**: Google Cloud Console → APIs &
      Services → Credentials → каждый ключ:
      - *Application restrictions*: Android — имя пакета + SHA-1
        сертификата подписи; iOS — bundle id;
      - *API restrictions*: разрешить только реально используемые API.
- [ ] **Дневные квоты на каждый API**: APIs & Services → нужный API →
      Quotas → уменьшить *Requests per day* до разумного значения.
      **Именно квоты реально останавливают расход.**
- [ ] **Budget alerts**: Billing → Budgets & alerts → бюджет с
      оповещениями 50/80/100 %. Важно: **в Google Cloud бюджеты только
      оповещают и не останавливают расход** — поэтому нужны квоты выше.
- [ ] Не включать платные API «на всякий случай».

## 6. Карты (Google Maps / Yandex / 2GIS)

**Приложение сейчас НЕ использует никакие карты.** Ключей карт в проекте
нет — ничего подключать и оплачивать не нужно.

Если когда-нибудь карты понадобятся, обязательны три условия:

1. Каждый платный вызов идёт через `CostGuardService` (новый провайдер,
   например `maps`, со своими лимитами в `app_config`).
2. Запросы идут **через наш сервер (прокси)**, а не напрямую из
   приложения с ключом внутри — ключ из приложения легко украсть.
3. Для автодополнения адресов использовать **session tokens** (Google
   Places), чтобы серия подсказок оплачивалась как один запрос.
   И, как в разделе 5, — квоты и ограничения ключей в кабинете.

---

## Что делает код (уже реализовано)

| Защита | Значение по умолчанию | Где меняется |
|---|---|---|
| SMS: в минуту (антивсплеск, на всех) | 30 | `budget.sms.per_minute_max` |
| SMS: в сутки | 300 | `budget.sms.daily_max` |
| SMS: в месяц | 5000 | `budget.sms.monthly_max` |
| Email: в минуту / сутки / месяц | 100 / 2000 / 30000 | `budget.email.*` |
| Проверки личности: минута / сутки / месяц | 5 / 20 / 200 | `budget.id_check.*` |
| Загрузки файлов в S3 (выдача ссылок): минута / сутки / месяц | 120 / 5000 / 100000 | `budget.storage.*` |
| Перевод сообщений чата (Google Translate): минута / сутки / месяц | 60 / 5000 / 50000 | `budget.translate.*` |
| Загрузки видео (Bunny Stream): минута / сутки / месяц | 30 / 1000 / 10000 | `budget.video.*` |
| Загрузки файлов с одного пользователя | 60 в час | env `FILES_PRESIGN_LIMIT_PER_USER_PER_HOUR` |
| Страны для SMS | только США (`["US"]`) | `sms.allowed_country_codes` |
| Premium / toll-free номера | всегда запрещены | — (код) |
| OTP на один номер/email | 5 в час | env `OTP_RATE_LIMIT_PER_IDENTIFIER_PER_HOUR` |
| OTP с одного IP | 10 в час | env `OTP_RATE_LIMIT_PER_IP_PER_HOUR` |
| OTP с одного устройства | 10 в час | env `OTP_RATE_LIMIT_PER_DEVICE_PER_HOUR` |
| Смена контакта (код на новый номер/email) | 3 в час, 10 в сутки на пользователя | env `CONTACT_OTP_LIMIT_PER_USER_PER_*` |
| Все запросы с одного IP | 100 в минуту | код (throttler) |

Как это работает:

- При **80 %** суточного или месячного лимита в логах один раз
  появляется предупреждение с меткой `alert: 'cost_budget'`
  (`stage: 'threshold_80'`). При **100 %** — ошибка в логах
  (`stage: 'exhausted'`), а пользователи получают «Сервис временно
  недоступен» (`503 PROVIDER_BUDGET_EXCEEDED`) до начала следующих
  суток/месяца (UTC). Лишние SMS **не отправляются и не оплачиваются**.
- Если хранилище счётчиков (Redis) недоступно, платные вызовы
  **запрещаются** (безопаснее отказать, чем потратить без учёта).
- Счётчики считают *попытки отправки*: если провайдер вернул ошибку,
  единица всё равно списана (консервативно).

### Режим «Авто» (по умолчанию, с 2026-10-05)

Админка → Система → Настройки → карточка **«Лимиты расходов»**. Для
каждого сервиса (SMS, письма, проверка личности, загрузки файлов,
перевод, видео) и каждого окна (в минуту / в день / в месяц) есть
переключатель **Авто / Вручную**.

- **Авто** — раз в час (и через ~20 секунд после запуска сервера)
  лимит пересчитывается по реальной нагрузке:
  - в день = 2 × самый загруженный день за последние 7 дней;
  - в месяц = 1,5 × больше из «прошлый месяц» и «прогноз этого месяца»
    (и не меньше дневного);
  - в минуту = 30 × средняя скорость самого загруженного дня (запас
    на всплески).
  Лимит **никогда не опускается ниже «Минимума»** (по умолчанию —
  значения из таблицы выше) и **не поднимается выше «Потолка»** (по
  умолчанию — минимум × 10). Нагрузка выросла — лимит растёт; упала —
  снижается обратно, но не ниже минимума.
- Если автоматический лимит хочет вырасти выше потолка, в логах один
  раз в сутки появляется `alert: 'cost_budget_ceiling'`, и приходит
  письмо «упёрлись в потолок». Рост настоящий — поднимите «Потолок»;
  роста не было — это может быть злоупотребление, и потолок вас защищает.
- **Вручную** — лимит равен введённому «Значению» и сам не меняется;
  `0` — выключить сервис. Сервис, который был выключен (лимит `0`) до
  появления режима «Авто», остаётся выключенным в ручном режиме.
- Настройки режима хранятся в `app_config` ключом `budget.autoscale`;
  итоговый лимит пишется в обычные ключи `budget.<сервис>.*`, поэтому
  защита работает так же, как раньше. История расхода по дням — в Redis
  (`budget:{<сервис>}:hist`, 40 дней). Изменения админа пишутся в журнал
  действий; автоматические изменения — в логи
  (`event: 'cost_budget_autoscaled'`).

### Как изменить лимит

Лимиты хранятся в таблице `app_config` и применяются без передеплоя
(в течение ~30 секунд). Проще всего — в карточке «Лимиты расходов»
(режим «Вручную» или «Минимум»/«Потолок» в режиме «Авто»). Без админки
разработчик может выполнить, например (в режиме «Авто» такой лимит
перезапишется при следующем пересчёте):

```sql
UPDATE app_config SET value = '500' WHERE key = 'budget.sms.daily_max';
UPDATE app_config SET value = '["US","PR"]' WHERE key = 'sms.allowed_country_codes';
```

- `0` — полностью выключить провайдера.
- Если ключа нет или значение испорчено — используется запасное
  значение из переменных окружения (`BUDGET_SMS_DAILY_MAX` и т. п.,
  значения по умолчанию — как в таблице).
- **Лимит в коде должен быть меньше лимита в кабинете провайдера**, а
  не наоборот: тогда при ошибке в коде сработает кабинет.

Прикидка стоимости: SMS в США ≈ $0.008–0.01 за сообщение + сборы
операторов, т. е. 300 SMS/сутки ≈ $3–5 в сутки, 5000/месяц ≈ $50–80.
Уточните актуальные цены в кабинете Twilio.


## Economy guard (owner 2026-10-16)

The per-provider caps above stop one abuser; the **economy guard** stops the
sum. Admin → Система → Экономика shows revenue (last 30 days) against the
projected third-party spend and applies one rule: spend ≤ X % of revenue, not
below $Y (defaults 50 % and $150). Over the rule the `economy.guard` job cuts
every cap to its floor, pauses new video uploads, keeps SMS for sign-in and
password reset only and holds autoscaling at the minimum; it lets go by itself
below 90 % of the allowance. The switch `economy_guard` (Функции) turns the
whole thing off and restores everything it changed.

## Логи запросов (owner 2026-10-22)

CloudWatch Logs стоит $0.50 за ГБ. Раньше API писал строку на **каждый**
запрос с полным объектом запроса (заголовки и т. п.) — при миллионе
пользователей в день это терабайты и ~$3 000 в месяц. Теперь
(`apps/api/src/common/logging/http-log-policy.ts`):

| Что | Пишется | Где меняется |
|---|---|---|
| Ошибки (код ответа ≥ 500 или исключение) | всегда, уровень `error` | — |
| Ответы 4xx | всегда, уровень `warn` | — |
| Медленные запросы | всегда, уровень `warn` | env `HTTP_LOG_SLOW_MS` (по умолчанию 1000 мс) |
| Остальные (быстрые и успешные) | случайная выборка | env `HTTP_LOG_SAMPLE_PERCENT` (по умолчанию 1 %) |

Строка короткая: метод, адрес (значения параметров после `?` и секретные
части пути — токен вебхука Bunny, приглашение админа, код вступления в
группу — убраны), код ответа, время ответа, id запроса и id пользователя.
Заголовков и тела запроса нет. Чтобы на время разбора проблемы видеть все
запросы, поставьте `HTTP_LOG_SAMPLE_PERCENT=100` и перезапустите API.

## Money caps (owner 2026-10-22, audit #4 §6)

The call caps above count calls; a translation of 5 000 characters and an SMS to Kazakhstan cost far more than one "unit". On top of them every guarded call now reserves its **estimated price** (millicents, `apps/api/src/common/cost-guard/cost-prices.ts`) in three daily counters before the call caps run:

| Counter | Cap (US cents / day) | Default | Over the cap |
|---|---|---|---|
| All paid services | `budget.money.global_daily_cents` → `BUDGET_GLOBAL_DAILY_CENTS` | 50 000 ($500) | 503 `PROVIDER_BUDGET_EXCEEDED` |
| One provider | `budget.<provider>.daily_cents` → `BUDGET_<PROVIDER>_DAILY_CENTS` → the call cap × nominal price | e.g. 300 SMS × $0.0083 | 503 |
| One person (translate, uploads, video) | `budget.money.user_daily_cents` → `BUDGET_USER_DAILY_CENTS` | 500 ($5) | 429 `PROVIDER_BUDGET_EXCEEDED` (`details.scope = user`) |

- Prices: translate per character ($20 / 1 M), SMS per destination country (Twilio tiers: US/CA $0.0083, tier B ~$0.08, expensive routes ~$0.30, unknown $0.10), e-mail $0.0001, identity check $1.50, upload $0.00005, video per minute $0.005, image moderation $0.001.
- The old `BUDGET_<P>_*_MAX` call caps keep working unchanged (spike breaker) and, when no money cap is set for a provider, are converted into one.
- 80 % of any money cap logs `alert: cost_budget, stage: threshold_80, money: true` once a day (the same CloudWatch metric filter as the call caps); exhaustion logs `stage: exhausted`.
- 0 = no money cap for that counter. Edit live in Админка → Настройки (`budget.money.*`, `budget.<p>.daily_cents`).
