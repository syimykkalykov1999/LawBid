# 18+, СМС и письма: что включить и как

Основание: `docs/legal/LEGAL_REGISTER.md` (ветка `claude/legal-register`, PR #341), разделы COPPA, TCPA, CAN-SPAM, правила Gmail/Yahoo.
Всё выключено по умолчанию: пока вы ничего не включили, приложение работает как раньше.

## 1. Возраст 18+ (COPPA)

Что уже в сервере:
- `GET /api/v1/compliance/age-gate` отдаёт приложению: режим, минимальный возраст, версию текста.
- При первом входе нового аккаунта приложение может прислать `ageAttestation` (`confirmed`, `textVersion`, необязательно `birthDate`) вместе с кодом из СМС/почты, ссылкой из письма или входом через Google/Apple. Сервер записывает: когда, какая версия текста, дату рождения (если была).
- Дата рождения младше 18 лет: аккаунт не создаётся (ошибка `AGE_UNDER_MINIMUM`), даже если галочка стоит.
- Админка → Config: `compliance.age_gate.mode` = `off` (по умолчанию) / `record` (только записывать) / `enforce` (нет галочки — нет аккаунта, ошибка `AGE_ATTESTATION_REQUIRED`, код из СМС при этом не тратится).
- Правильный текст и версию меняют в `compliance.age_gate.text_version` и в приложении одновременно.

Что нужно сделать в приложении (мы дизайн не трогали, это решение владельца): на экране регистрации добавить галочку «Мне есть 18 лет» со ссылкой на Terms и отправлять `ageAttestation` (поле есть в запросах `/auth/otp/verify`, `/auth/otp/verify-link`, `/auth/social`). Пока этого нет, режим `enforce` включать нельзя: никто не сможет зарегистрироваться.

Инструмент для несовершеннолетних (админка, нужен 2FA-шаг для удаления):
- `GET /admin/compliance/minors` — помеченные аккаунты и те, у кого дата рождения младше 18.
- `POST /admin/compliance/minors/:id/flag` {reason} — аккаунт блокируется, сессии закрываются, телефон и почта попадают в стоп-листы (рекламы такому человеку не будет).
- `POST /admin/compliance/minors/:id/clear` — пометка была ошибкой, аккаунт возвращается.
- `POST /admin/compliance/minors/:id/delete` — удалить помеченный аккаунт сразу (обычная анонимизация). Если на аккаунте юридическая блокировка (legal hold), ответ `deletion_deferred`.

Заявление COPPA (текст для Privacy Policy, на согласование юристу): «LawBid is intended for people who are 18 or older. We do not knowingly collect personal information from anyone under 18. If you believe a child has created an account, contact us and we will delete it promptly.»

## 2. СМС (TCPA)

- Код входа остаётся обычным служебным сообщением: согласие на рекламу для него не нужно и стоп-лист на него не действует.
- Любое другое СМС идёт только через `SmsComplianceService.sendNonOtp`: нужен главный выключатель `compliance.sms.marketing_enabled` (по умолчанию выключен), отдельное записанное согласие (текст и его версия, хэш текста), номер не в стоп-листе, не «тихие часы» (по умолчанию не раньше 8:00 и не позже 21:00 по местному времени человека; если пояс неизвестен, берётся самое строгое окно по США).
- Согласие: приложение показывает текст из `GET /compliance/sms-consent/disclosure` и отправляет `POST /compliance/sms-consent` {purpose, disclosureVersion}. Снять: `DELETE /compliance/sms-consent`.
- STOP/HELP/START: в Twilio для вашего Messaging Service (или номера) в поле «A message comes in» впишите `https://<ваш API>/api/v1/webhooks/twilio/sms` (метод POST). Подпись `X-Twilio-Signature` проверяется ключом Twilio из «Ключи и сервисы»; без ключей ответ 404.
  - STOP и синонимы (stop, quit, end, cancel, unsubscribe, revoke, opt out): номер сразу в стоп-листе, согласие снято (закон даёт 10 рабочих дней, мы делаем сразу).
  - START: стоп снимается, и возвращается согласие, которое забрал STOP.
  - HELP: по умолчанию отвечает сам Twilio (Advanced Opt-Out). Хотите свой текст: включите `compliance.sms.reply_to_help` и впишите `compliance.sms.help_text`.
- Синхронизация с Twilio: пока вебхук включён, список ведётся сам; если Twilio сообщает ошибку 21610 при отправке, номер тоже попадает в стоп-лист. Старый список из Twilio можно загрузить разом: Console → Messaging → Opt-out Management → экспорт, затем `POST /admin/compliance/sms/opt-outs/import` {phones} (нужен 2FA-шаг).
- Важно: после STOP Twilio блокирует на уровне оператора и коды входа на этот номер, пока человек не напишет START. Для таких людей остаётся вход по почте.

## 3. Письма (CAN-SPAM, Gmail/Yahoo)

- Рассылки «Привлечения»: в каждом письме уже есть почтовый адрес из Outreach → Settings, ссылка отписки и заголовки `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058). Теперь перед отправкой проверяется ещё и список недоставленных/жалоб.
- Письма-уведомления (тип `notification`) получают подвал с почтовым адресом: `compliance.email.footer_address`, а если пусто, то адрес из Outreach → Settings. Коды входа не меняются.
- Недоставленные письма и жалобы «это спам» от Amazon SES:
  1. AWS Console → SNS → Create topic (Standard), имя `ses-events`, регион тот же, что у SES.
  2. SES → Verified identities → ваш домен/адрес → Notifications → Feedback notifications: для Bounce и Complaint выбрать этот topic.
  3. SNS → тема → Create subscription: Protocol `HTTPS`, Endpoint `https://<ваш API>/api/v1/webhooks/ses`.
  4. Админка → Config: `compliance.sns.topic_arns` = ARN темы (пусто = приём выключен). Подписка подтвердится сама (подпись Amazon проверяется, чужие темы отклоняются). Порядок важен: сначала ARN в настройке, потом подписка.
- Что происходит с событием: «постоянная» недоставка (Permanent bounce) и жалоба попадают в список писем (`email_suppressions`) и в стоп-лист рассылки «Привлечения». Жалоба ещё делает лида «не беспокоить», как отписка. Временные сбои (почтовый ящик полон) игнорируются.
- Проверьте DNS (одноразово): SPF, DKIM и DMARC у домена отправителя; доля жалоб должна быть ниже 0,3 процента (правило Gmail/Yahoo).

## Что нужно от владельца

1. Решить, добавлять ли галочку 18+ и согласие на СМС в приложение (изменение внешнего вида).
2. Подключить вебхук Twilio и SNS по шагам выше (внешние кабинеты: Twilio Console, AWS).
3. Юристу: текст COPPA-заявления, текст согласия на СМС (`compliance.sms.disclosure_text`), политика «удалять аккаунты несовершеннолетних».
