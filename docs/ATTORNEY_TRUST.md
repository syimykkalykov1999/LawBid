# Уровни доверия адвокатов (owner 2026-10-05)

Регистрация адвоката остаётся в один шаг: он сам вводит штат и номер лицензии (self-attestation, `docs/03 §2`). Защита от мошенника с чужим номером строится не на блокировке входа, а на том, **что адвокату разрешено** и **что видит клиент**: права растут вместе с подтверждёнными фактами, а клиент всегда видит, что именно проверено, и ссылку на реестр штата.

Код: `apps/api/src/modules/attorney-trust/` (`AttorneyTrustService` — глобальный модуль `AttorneyTrustCoreModule`; HTTP и админка — `AttorneyTrustModule`). Чистая логика уровня — `trust-level.ts` (юнит-тесты). e2e — `test/owner-attorney-trust.e2e-spec.ts`.

## 1. Уровни

| Уровень | В приложении | Условие (`computeLevel`) |
|---|---|---|
| 0 | Заявлен / Self-declared | статус `verified` и ≥1 лицензия `verified`, больше ничего |
| 1 | Реестр / Registry | лицензия подтверждена: реестром (`auto_check_result.result = 'pass'` и нет `registry_flag` ни на одной лицензии) **или** сотрудником (`attorney_trust.license_confirmed_at`) |
| 2 | Личность / Identity | уровень 1 **и** Stripe KYC (`stripe_kyc_at` + `stripe_charges_enabled`) с `name_check = 'match'` **или** `firm_link_status = 'confirmed'` |
| 3 | Документы / Documents | уровень 2 **и** `documents_verified_at` (сотрудник проверил bar card + ID + селфи) |

Факты — `attorney_trust` (одна строка на адвоката), история — `attorney_trust_events` (`kind`, `from_level → to_level`, `actor_type` system/admin/attorney/client, `details`). Зеркало для списков: `attorney_profiles.trust_level`, `trust_badge`. Пересчёт: при каждом факте, при `GET /trust/me`, ежедневно job `trust.recompute` (03:45 UTC), кнопка «Пересчитать» в админке.

Любая потеря факта (отзыв подтверждения, флаг реестра, suspend) понижает уровень; галочка снимается автоматически.

## 2. Правила («Борьба с мошенниками», решение владельца 05:54)

Админка Верификация → «Борьба с мошенниками», ключи `trust.*`. Вместо минимальных уровней — переключатели «что требовать от адвоката», чтобы открыть галочку и приём денег. Всё, что проверяется автоматически, проверяется само; остальное попадает сотруднику в очередь; «Подтвердить» сотрудником открывает всё навсегда (перепроверок нет, кроме жалоб и явного отзыва).

| Ключ | По умолчанию | Что делает |
|---|---|---|
| `trust.enabled` | true | **мастер-тумблер** (владелец 06:07). Выкл = режим «как раньше»: заявленный адвокат сразу получает галочку и приём денег, холды ничего не закрывают, очередь пуста, автозащиты не срабатывают. Всё ниже действует только при вкл. |
| `trust.manual_review` | true | ручная проверка сотрудниками. Выкл = только автопроверки: требование документов не действует, очередь на паузе (записи сохраняются), действия сотрудника остаются доступны владельцу |
| `trust.require_registry` | true | номер совпал с реестром штата (или сотрудник подтвердил лицензию) |
| `trust.require_identity` | true | Stripe KYC, где проверенный человек — адвокат (или представитель/владелец компании), либо подтверждённая связь с фирмой |
| `trust.require_documents` | false | сотрудник проверил ID + селфи + bar card |
| `trust.bids_require_cleared` | false | биды тоже ждут выполнения требований (иначе биды открыты каждому заявленному адвокату) |
| `trust.payout_delay_days` | 7 | задержка выплат Stripe, пока адвокат не «cleared» |
| `trust.auto_hold_on_complaint` | true | жалоба → холд оплат и бидов |
| `trust.complaints_to_suspend` | 2 | столько разных клиентов за окно → `verification_status = 'suspended'`, биды снимаются |
| `trust.complaint_window_days` | 90 | окно жалоб |
| `trust.auto_hold_on_name_mismatch` | true | имя в Stripe ≠ профиль/реестр → холд оплат + в очередь |
| `trust.flag_duplicate_claims` | true | второй аккаунт с тем же номером → `registry_flag = 'duplicate_claim'` у владельца, в очередь |
| `trust.firm_link_auto_registry` | true | фирма из реестра == `company.name` в Stripe → связь подтверждена автоматически |
| `trust.firm_link_auto_email` | true | код на почту на домене фирмы (== домен `business_profile.url`) → связь подтверждена |

Пресеты `POST /admin/trust/settings/preset {preset}`: `off` = «Выключить всё», `soft` (реестр, без задержки выплат, 3 жалобы), `standard` (значения по умолчанию), `strict` (всё требуется, биды ждут, 14 дней, 1 жалоба, связь с фирмой только вручную), `all` = «Включить всё». Каждое изменение правил пишется в аудит (`trust.settings` по ключам, `trust.preset`); требования пересчитываются сразу (`recomputeAll`), адвокаты, у которых галочка пропала, получают `trust_requirements_changed` со списком `missing`.

**Статус галочки** (`badgeStatus`, «Галочки → Адвокаты», `GET /admin/trust/attorneys?status&q&limit`): `not_verified` → `self_declared` → `registry_matched` → `pending_review` / `documents_requested` → `cleared`; сбоку `rejected`, `suspended`. Ручная смена `POST …/attorneys/:id/status {status: cleared|self_declared|documents_requested|rejected, note}` — причина обязательна, пишется запись решения и аудит `trust.set_status`. Статистика сотрудников принимает `from`/`to`.

`cleared` (`isCleared`) = заявлен и (сотрудник подтвердил `attorney_trust.staff_cleared_at` **или** все включённые требования выполнены); `missing` — список невыполненных. Галочка = `verified` && `cleared`; гейт оплат закрыт с `reason = 'requirements'` (403 `TRUST_LEVEL_REQUIRED`, details `{gate, missing, current}`) пока не cleared, `hold` при холде, `suspended`. Уровень 0–3 остаётся внутренней моделью и объяснением для клиента.

**Очередь сотрудника** (`GET /admin/trust/queue?reason&q`): адвокаты не cleared и не suspended, у которых есть что решать человеку: `documents` (загружены документы в заявке `submitted`/`in_review`, а требования не выполнены), `firm_link` (ожидает), `name_mismatch`, `duplicate_claim`, `registry_flag`, `complaint`. Строка: причины, что не хватает, сигналы, Stripe тип/представитель, ссылки в реестр, `requestId` с документами. Действия: `POST …/clear` («Подтвердить»: staff_cleared, документы и связь с фирмой считаются проверенными, холды name_mismatch/duplicate и флаги реестра снимаются, уведомление `trust_cleared`), `…/unclear`, `…/request-documents {template: id_selfie|bar_card|firm_letter|custom, note}` (уведомление `trust_documents_requested` с шаблоном), `…/reject` (suspend + снятие бидов), `POST /admin/trust/bulk {attorneyIds, action: clear|request_documents|reject|release}`.

Холды (`payments_hold`, `bids_hold`, `hold_note` с кодом complaint / name_mismatch / duplicate_claim / admin) — отдельно: уровень может быть 3, а оплаты на паузе. Снимает сотрудник (`release`) или `clear`.

## 3. Личность через Stripe Connect

`AttorneyTrustService.onStripeAccount(attorneyId, facts)` вызывается из webhook `account.updated` (PR #48 передаёт `business_type`, `individual.first_name/last_name`, `company.name`, `business_profile.url`, представителя и persons с relationship owner/executive).

- **individual** — юридическое имя сравнивается с именем профиля и с именем в реестре (`checkLegalName`, `normalizeName`). match → `name_check = 'match'`; mismatch → холд оплат (если включено), уведомление `trust_documents_requested`.
- **company (LLC/LLP/PC)** — сравниваются представитель и владельцы/руководители, **никогда** `company.name` с человеком. Совпал → как match. Не совпал → `tryAutoFirmLink`: (1) фирма в реестре (`auto_check_result.firm`) ≈ `company.name` (`firmNamesMatch`, без LLC/LLP/PC/«Law Offices»); (2) подтверждённая рабочая почта на домене `company.url`. Иначе `firm_link_status = 'pending'`, уведомление `trust_firm_link_required`; адвокат подтверждает почтой (`POST /trust/me/firm-email` → код 6 цифр на 15 минут, 5 попыток, 5 кодов в день, публичные домены отклоняются) или сотрудник (`confirm-firm-link`, письмо на бланке + bar card + ID).

В админке видно тип аккаунта Stripe, представителя, название компании, домен и результат сравнения; клиент видит только уровень.

## 4. Жалобы и дубликаты

- `POST /reports {targetType:'user', reason:'fraud'|'impersonation'}` → `onComplaint`: учитывается только если у клиента был бид на его кейс или чат с адвокатом (`dealtWith`); иначе только запись в отчётах. Холд + событие `complaint`; ≥ `complaints_to_suspend` разных заявителей за окно → `autoSuspend` (статус `suspended`, активные биды → withdrawn через `BidStateMachine`, журнал кейса, уведомление `suspended`).
- Добавление лицензии с чужим (state, bar_number) → 409 как раньше **и** `onDuplicateClaim`: владельцу `registry_flag = 'duplicate_claim'` (очередь «Сверка с реестром»), событие обоим; подтверждение реестра не считается, пока сотрудник не очистит флаг или не подтвердит лицензию вручную.

## 5. API

Приложение: `GET /trust/me` (OwnTrustDto: уровень, сигналы, гейты, `payoutDelayDays`, `nextSteps` hold_review | registry_check | stripe_kyc | firm_link | fix_name | documents, `firmLink`), `POST /trust/me/firm-email`, `POST /trust/me/firm-email/confirm`, `GET /trust/attorneys/:id` (PublicTrustDto + `registryLinks`). `trustLevel` добавлен в DTO профиля, бидов, подписок, списков.

Админка (`verifier`, `super_admin`; сегмент `trust` → область `verification`): `GET/PUT /admin/trust/settings`, `POST /admin/trust/settings/preset`, `GET /admin/trust/stats`, `GET /admin/trust/holds`, `GET /admin/trust/attorneys` («Галочки → Адвокаты»), `GET /admin/trust/attorneys/:id` (карточка + события), `POST …/status | confirm-license | unconfirm-license | confirm-documents | confirm-firm-link | clear | unclear | request-documents | reject | hold | release | recompute`, `POST /admin/trust/bulk`, `GET /admin/trust/queue`, `GET /admin/trust/staff-decisions`, `GET /admin/trust/cleared-by`, `POST /admin/trust/recompute-all`. Все действия — в audit log (`trust.*`).

Ручное одобрение заявки на верификацию сотрудником (`POST /admin/verification/requests/:id/approve`) = «Подтвердить»: сотрудник уже посмотрел документы и лицензию, поэтому `clearByStaff` вызывается в той же транзакции (без второго уведомления — адвокат получает `approved`), запись решения сохраняется. Автоматические одобрения по реестру очистку не дают.

### 5.1 Блок-лист номеров лицензий (владелец 2026-10-05 07:00)

Отклонённый сотрудником («Отклонить» в очереди, `reject` в верификации) или приостановленный адвокат не может зарегистрировать тот же номер лицензии снова — под другим именем или новым аккаунтом. Таблицы `bar_number_blocks` (уникально `(state_code, bar_key)`, где `bar_key` — номер без пробелов/знаков в верхнем регистре; `active`, `reason`, `source` staff_reject | verification_reject | suspend | manual, `attorney_id`, `blocked_by`, `block_contacts` + `email_lower`/`phone_e164`, `unblocked_*`, `attempts`) и `bar_number_block_events` (blocked / unblocked / attempt — append-only история). `POST /verification/requests/:id/licenses` с заблокированным номером (или с e-mail/телефоном заблокированного аккаунта при `block_contacts`) → 403 `BAR_NUMBER_BLOCKED`, попытка записывается в историю и счётчик.

Тумблеры: `trust.block_on_reject` (по умолчанию вкл., слушает главный выключатель) — отклонение/приостановка блокирует номер автоматически; `trust.block_contacts` (выкл.) — блок распространяется на e-mail и телефон. Пресеты soft/standard/all включают первый, strict — оба.

Админка «Борьба с мошенниками» → «Заблокированные номера»: `GET /admin/trust/blocked-bar-numbers?q&status=active|unblocked`, `GET …/:id` (с историей), `POST /admin/trust/blocked-bar-numbers` (вручную, причина обязательна), `POST …/:id/unblock` (причина обязательна — что объяснил/доказал человек). Audit: `trust.block_bar_number`, `trust.unblock_bar_number`. Для сотрудника в очереди, списке и карточке — `lookups[]`: ссылка на страницу реестра штата (`prefilled: true` — страница открывается сразу на номере, CA/FL; иначе поиск + «Скопировать номер»), `blocked` — номер в блок-листе.

Уведомления адвокату (тип `verification_update`, `payload.kind`): `trust_level_up`, `trust_payments_paused`, `trust_payments_resumed`, `trust_bids_paused`, `trust_hold_lifted`, `trust_documents_requested`, `trust_auto_suspended`, `trust_firm_link_required`, `trust_firm_link_confirmed`.

## 6. Интеграция с оплатами (PR #48) и планами (PR #47)

После слияния #48: в `CasePaymentsService.attorneyEntitled` → `trust.assertCanAcceptPayments(attorneyId)`; `syncAccount(account.updated)` → `trust.onStripeAccount(...)` с полями выше; при изменении уровня `desiredPayoutDelayDays` → `accounts.update({settings:{payouts:{schedule:{delay_days}}}})` и `markPayoutDelaySynced`. Виджет `TrustPaymentNotice` в приложении встраивается в лист оплаты. #47: `platform_payments` в entitlement проверяется до гейта доверия.

## 7. Миграции

`20261005140000_owner_trust_enums` (`report_reason` += `fraud`), `20261005140100_owner_attorney_trust` (`attorney_profiles.trust_level/trust_badge`, `attorney_trust`, `attorney_trust_events`), `20261005140200_owner_trust_staff_clearance` (`staff_cleared_*`, `documents_requested_*`), `20261005140300_owner_bar_number_blocks` (`bar_number_blocks`, `bar_number_block_events`). После деплоя один раз `POST /admin/trust/recompute-all` (или дождаться ночного job), чтобы заполнить уровни существующим адвокатам.

## 8. Юридические тексты

Черновик для юриста: `/mnt/project-files/legal/attorney-trust.md`; пункт «Trust levels» в Terms на сайте (lawbidsite). Формулировка везде: уровень — индикатор того, что совпало и когда, не гарантия и не сертификация.
