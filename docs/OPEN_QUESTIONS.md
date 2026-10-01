# Открытые вопросы и решения владельца

Журнал по docs/06_PRODUCTION.md §14: «Если по ходу возникает потребность,
которой нет в ТЗ, она фиксируется в `docs/OPEN_QUESTIONS.md` и решается
владельцем». Формат: вопрос → решение → кем и когда → где реализовано.

---

## OQ-001. Защита от разорения на платных API (cost guard)

**Статус:** решено владельцем 2026-09-27.

**Вопрос.** ТЗ требует лимиты на OTP (01 §10.2, §10.6), но не ограничивает
общие расходы на платных провайдеров. Бот, меняющий номера/IP, может
заставить нас оплатить сотни и тысячи SMS/писем/проверок личности за
сутки. Владелец: «не хочу разориться в первый же день, если пользователь
или бот отправит сотни платных запросов».

**Решение (расширение ТЗ, decided by owner 2026-09-27):**

1. **Глобальный бюджет на каждого платного провайдера** —
   `CostGuardService.consume(provider)` вызывается *до* каждого платного
   вызова. Окна: минута (антивсплеск), сутки и месяц (UTC). Лимиты — в
   `app_config` (`budget.<provider>.per_minute_max|daily_max|monthly_max`),
   запасные значения — в env. При 80 % — одно предупреждение в логах
   (`alert: 'cost_budget'`) на окно; при 100 % — отказ `503
   PROVIDER_BUDGET_EXCEEDED` без увеличения счётчика. Если Redis
   недоступен — отказ (fail closed).
2. **SMS только на номера США.** Список стран — `app_config`
   `sms.allowed_country_codes` (по умолчанию `["US"]`). Номера +1 Канады и
   Карибских территорий (NANP), а также premium-rate/toll-free номера
   отклоняются с `400 PHONE_COUNTRY_NOT_SUPPORTED`. Это реализация пункта
   01 §10.6 «блок подозрительных префиксов стран (настраивается)».
3. **Лимит OTP на устройство** (01 §10.2 «10/час на IP/устройство») — по
   заголовку `X-Device-Id`, 10/час.
4. **Лимит на `POST /users/me/contacts/request`** — 3/час и 10/сутки на
   пользователя + общий лимит 5/час на номер/email (раньше был только
   глобальный 100 запросов/мин на IP).
5. **`trust proxy`** в `main.ts` (`TRUST_PROXY_HOPS`, 1 за ALB), иначе
   все пользователи делят один лимит по IP балансировщика.
6. Новые коды ошибок: `PROVIDER_BUDGET_EXCEEDED` (503),
   `PHONE_COUNTRY_NOT_SUPPORTED` (400).

**Где:** `apps/api/src/common/cost-guard/`, `OtpService`, `AuthService`,
`ContactsService`, `main.ts`, `prisma/seed.ts`. Настройки кабинетов
провайдеров, которые должен выставить владелец: `docs/COST_PROTECTION.md`.

**Остаётся открытым (нужен ответ владельца):**

- **OQ-001a.** Территории США (Пуэрто-Рико `PR`, Гуам `GU`, Виргинские
  острова `VI` и др.) сейчас *заблокированы* для SMS. Добавить их в
  `sms.allowed_country_codes`? (Юридически это США, но риск pumping выше.)
- **OQ-001b.** Мобильному клиенту нужен экран/текст для
  `PROVIDER_BUDGET_EXCEEDED` («Сервис временно недоступен, попробуйте
  позже») и `PHONE_COUNTRY_NOT_SUPPORTED` («Поддерживаются только номера
  США») — ключи перевода не добавлены (этап клиента).
- **OQ-001c.** Куда доставлять алерты `alert: 'cost_budget'` (email /
  Slack / PagerDuty) — решается в этапе наблюдаемости 6.10–6.11; до этого
  они только в логах.
- **OQ-001d.** Когда появится админка (файл 6), нужен экран изменения
  лимитов `budget.*` вместо правки `app_config` в БД.

---

## OQ-002. Автоматическое включение провайдеров по наличию ключей

**Статус:** решено владельцем 2026-09-27.

**Вопрос.** ТЗ задаёт выбор провайдера SMS/email через env, но не
описывает, как переходить с заглушек на реальные ключи. Владелец: «ключи
буду вставлять по одному, каждый должен сразу заработать».

**Решение:** `SMS_PROVIDER`/`EMAIL_PROVIDER=auto` (по умолчанию) —
реальный провайдер включается, как только заданы все его ключи; иначе
mock, но только в `development`/`test`. В `staging`/`production` mock
запрещён, отсутствие ключей останавливает старт с понятной ошибкой.
Форматы всех ключей проверяются при старте. Инструкция для владельца —
`docs/KEYS_SETUP.md`. Реализация: `apps/api/src/config/provider-selection.ts`,
`env.schema.ts`; мобильные id — `apps/mobile/lib/core/config/app_config.dart`.

---

## OQ-003. `users.role` может быть пустым до шага онбординга

**Статус:** решено владельцем 2026-09-27 («выбирай, ты больше знаешь о проекте»).

**Вопрос.** docs/02 §4.A: `role user_role NN`. Но по docs/01 §11 роль
выбирается на шаге 2 онбординга, *после* успешного входа, когда запись
`users` уже создана.

**Решение.** `role` остаётся nullable (сделано в этапе 1.4). Роль
выставляется ровно один раз через `POST /users/me/role` (атомарно,
`WHERE role IS NULL`), потом меняться не может (`ROLE_ALREADY_SET`).
Завершение онбординга без роли невозможно (`missing: ['role']`).
Аналогично `onboarding_state.current_step` nullable до первого шага.

## OQ-004. Пути API онбординга

**Статус:** решено владельцем 2026-09-27.

**Вопрос.** docs/01 §10.5 не перечисляет эндпоинты онбординга, хотя §11
требует хранить шаг на сервере и проверять контакты на сервере.

**Решение.** `GET/PATCH /users/me`, `POST /users/me/role`,
`PATCH /users/me/onboarding`, `POST /users/me/onboarding/complete`, заглушка
`POST /cases` (ошибка `CLIENT_CONTACTS_INCOMPLETE`). См. CHANGELOG «Stage
1.7 backend gap».

## OQ-005. Анимация «удар молотка» на кнопках

**Статус:** решено владельцем 2026-09-27: **не нужна** («на клики анимации
лишние»).

**Вопрос.** docs/07 §7 / этап D.2 описывают анимацию удара молотка на
главных кнопках.

**Решение.** По умолчанию выключена (`strike: false`) во всех кнопках;
код анимации остаётся, но не используется. Тесты виджета проверяют её
только при явном `strike: true`. Отклонение от D.2 зафиксировано здесь.

## OQ-006. Шаг «Язык» в онбординге убран

**Статус:** решено владельцем 2026-09-27.

**Вопрос.** docs/01 §11 «Шаг 1. Язык» описывает выбор языка первым шагом
онбординга, но язык уже выбирается иконкой-глобусом на экране приветствия
(docs/07 §6), и шаг дублировал её.

**Решение.** Шаг удалён: после входа сразу согласия. Язык меняется только
иконкой на Welcome; позже — в Настройках профиля (файл 3/5, экран профиля).

---

## OQ-007. Дизайн: вход/регистрация неизменны, внутри приложения — современный дизайн

**Статус:** решено владельцем 2026-09-27.

**Решение.**
1. Экраны до входа в приложение (Welcome с иконками темы и языка, ввод
   телефона/email, код, выбор роли, шаги онбординга) по внешнему виду не
   меняются. Туда добавляется только функциональность, которой требует ТЗ
   (например ссылка «Изменить номер»), в существующем стиле.
2. Остаются как есть и считаются согласованными отступлениями от docs/07:
   Welcome — заголовок над весами (ScalesLogo), переключатель темы и глобус
   языка в верхних углах, удлинённая стойка весов; белый текст чаш (светлая
   тема) и белая заливка чаш (тёмная тема), токен `ctaBright`.
3. Внутри приложения (лента, поиск, «Моё», профиль, настройки, карточки)
   разрешён современный дизайн с плавными анимациями по теме приложения —
   это исключение из docs/07 §1 «никаких других декоративных анимаций» и из
   строки `.cursorrules` о новых компонентах. Логотип в шапке ленты остаётся
   статичным (docs/07 §10). Цвета статусов — строго по docs/01 §8.1.

## OQ-008. Английские тексты — строго по docs/07 §8

**Статус:** решено владельцем 2026-09-27. Шесть расходившихся строк
(`auth.welcome.title`, `auth.welcome.legal`, `auth.phone.subtitle`,
`auth.phone.terms`, `auth.otp.submit`, `onboarding.role.attorney.desc`)
возвращаются к тексту ТЗ. Русские тексты не меняются.

## OQ-009. SMS только на 50 штатов + DC (территории заблокированы)

**Статус:** решено владельцем 2026-09-27 (закрывает OQ-001a). Номера +1
Пуэрто-Рико, Гуама, Виргинских о-вов и других территорий, а также Канады и
Карибских стран не принимаются (`PHONE_COUNTRY_NOT_SUPPORTED`). Включить
можно без релиза через `app_config` `sms.allowed_country_codes`.

## OQ-010. Twilio Messages вместо Twilio Verify

**Статус:** решено владельцем 2026-09-27. docs/01 §10.1 называет Twilio
Verify, но Verify сам генерирует и хранит код, что несовместимо с
требованием §10.6 хранить HMAC кода у нас, и стоит в разы дороже за
проверку. Используется Twilio Messages + собственные лимиты и CostGuard
(OQ-001). В кабинете Twilio обязательно включить Geo Permissions (только
США) и SMS Pumping Protection (docs/COST_PROTECTION.md).

## OQ-011. Технические отступления в схеме БД и CI (docs/02)

**Статус:** решено 2026-09-27 (технически вынужденные, эквивалентны по смыслу).

1. **`created_shard` вместо `USING HASH`** (§1.1): hash-sharded индексы
   CockroachDB роняют интроспекцию Prisma (паника schema engine), из-за чего
   проверка расхождений схемы молча ничего не видела. Явная вычисляемая
   колонка `created_shard = mod(fnv32(id), 16)` + индекс
   `(created_shard, created_at)` распределяет запись так же.
2. **`@unique` вместо частичного уникального индекса** для
   `users.email`/`users.phone_e164` (§4.A, §5.1): в CockroachDB обычный
   уникальный индекс допускает сколько угодно NULL — поведение идентично.
3. **Docker-контейнер CockroachDB в CI вместо библиотеки testcontainers**
   (§7.1): та же настоящая CockroachDB на чистой базе, без лишней
   зависимости; миграции гоняются и на чистой базе, и на базе прошлой
   версии.
4. **Trigram GIN-индексы частичные** (`WHERE col IS NOT NULL`): коннектор
   Prisma для CockroachDB не умеет объявлять `gin_trgm_ops`.
5. **Индексы производительности файла 04** (миграция
   `20260928120000_file04_scale_indexes`, 2026-09-28, по итогам проверки
   нагрузки): частичные индексы для ежечасных задач §10.2
   (`cases_open_unprompted_idx`, `cases_open_prompted_idx`) и
   `bids(attorney_id, updated_at DESC, id DESC)` для «Мои биды». Только
   индексы, данные не меняются; без них задачи и список обходили бы все
   открытые кейсы / все биды адвоката на цель 5k RPS.

## OQ-012. Фото адвоката в онбординге — вместе с загрузкой файлов (docs/03 3.2)

**Статус:** решено владельцем 2026-09-27. docs/01 §11 Шаг 3B требует фото адвоката,
но загрузка файлов (presign, антивирус, аватары) появляется в
docs/03 этап 3.2. Шаг фото добавляется в онбординг адвоката в этапе 3.2.

**Обновление 2026-09-27 (после этапа 3.9): фото адвоката теперь обязательно и
проверяется сервером** (docs/03 §4.1). `POST /users/me/onboarding/complete`
для адвоката без чистого аватара (свой файл `avatar`, `scan_status = clean`,
не удалён) возвращает 403 `ONBOARDING_INCOMPLETE` с `missing: ['photo']`;
`GET /users/me` отдаёт `photo` в `missing`. В приложении гард держит адвоката
на шаге профиля, строка фото показывает обязательность («Добавьте фото — для
адвоката оно обязательно.»). Фото — публичный контент профиля:
`GET /attorneys/:username` отдаёт `avatarUrl` / `avatarUrl256` (только файлы
`avatar`, документы верификации — никогда). Для клиента фото не требуется.

## OQ-013. Экран согласий «Прежде чем начать» — карточки, без необязательных пунктов

**Статус:** решено владельцем 2026-09-27 (прямое указание, исключение из OQ-007 для этого экрана).
Обязательные согласия (18+, Условия и Политика, дисклеймер) — карточки в
стиле выбора роли; документы — компактной сеткой в два столбца.
Необязательные согласия (маркетинг email/push, аналитика) на экране не
показываются и не отправляются; они появятся в Настройках позже.

## OQ-014. Профиль адвоката — редизайн, кнопка «Написать», фильтр отзывов

**Статус:** решено владельцем 2026-09-28 (прямые указания).
- Профиль адвоката переделан в стиле Instagram: аватар + 3 счётчика,
  имя с галочкой, «@username · Адвокат», рейтинг строкой «★ 4.5 · N
  отзывов» (тап → отзывы; большой карточки рейтинга нет), био, компактные
  строки фирма/практики/штаты/языки, ряд кнопок **Подписаться | Написать |
  иконка «поделиться»** над вкладками, вкладки-иконки.
- «Написать» в профиле **ведёт на экран «Чаты | Уведомления»** (docs/05
  §8.1). Сами беседы по-прежнему создаются только из кейса (docs/04 §9);
  эндпоинт «прямого чата» не создавался. Миграция
  `20260928150000_direct_chats_review_filter` уже сделала
  `conversations.case_id` необязательным (была применена до этого решения);
  код никогда не пишет NULL, колонка оставлена как есть, чтобы не менять
  применённую миграцию.
- Отзывы: тап по полосе распределения 5…1 показывает только отзывы с этой
  оценкой (`GET /attorneys/:id/reviews?rating=`), чипы «Новые / Старые»
  (`?sort=newest|oldest`); индекс `reviews(attorney_id, rating, created_at)`.
- Логотип весов в шапке ленты скрыт (`AppFeedHeader.showLogo = false`).

## OQ-015. Файл 05 — мелкие расхождения и отложенные пункты

**Статус:** зафиксировано 2026-09-28, решения владельца не требуют (реализовано
по букве ТЗ; перечислено для прозрачности).
1. `reports`: ТЗ §14 не добавляет уникальный индекс, повтор жалобы
   отсекается в сервисе (Redis-claim + проверка в БД), не схемой.
2. Перекрёстные ссылки в docs/05 «раздел 11.3 / 11.5» указывают на §10
   (бейджи) и §9.4–§9.5 (агрегация, push); реализовано по смыслу.
3. `posts.search_tsv` / `cases.search_tsv` — `to_tsvector('english')`
   (файл 02 §5.3): русский текст ищется хуже; смена конфигурации — миграция.
4. `notification_settings.email_enabled` по умолчанию `true` в схеме, а
   ТЗ §9.5 шлёт email только для `system`; ограничение реализовано в коде
   (`EMAIL_TYPES`), не флагом.
5. Категорию `system` нельзя отключить (§9.5) — `PUT
   /notification-settings` возвращает 400 при попытке.
6. `GET /conversations/:id` добавлен (нужен экрану беседы; в таблице §15
   присутствует, в §8.4 не описан).
7. Signed URL медиа через MinIO/S3; CloudFront — файл 06 (`MediaUrlService`
   остаётся единственной точкой).
8. Ограничения по нагрузке (см. CHANGELOG «File 05 review fixes»):
   непрочитанные считаются до 100 на беседу, лента берёт до 2000
   последних подписок.

## OQ-016. Файл 06, этап 6.2 — решения по админ-входу и панели

**Статус:** зафиксировано 2026-09-29; реализовано по букве §2.1–2.3, ниже —
детали, которые ТЗ оставляет на усмотрение реализации.
1. TOTP — собственная реализация RFC 6238 поверх `node:crypto` (без
   зависимости; вектора RFC в тестах). Секрет шифруется AES-256-GCM ключом
   из окружения `ADMIN_TOTP_ENC_KEY` (не из БД); пока ключ не задан, вход
   администратора отвечает 503 `ADMIN_AUTH_NOT_CONFIGURED`.
2. Recovery-коды: 10 штук формата `XXXXX-XXXXX`, показываются один раз,
   хранятся как SHA-256; после сброса 2FA супер-админом выдаются заново.
3. Между email-кодом и TOTP — 5-минутный «тикет» (JWT `aud=lawbid-admin-ticket`,
   одноразовый, 5 неверных кодов сжигают его). Тикет не даёт доступа ни к
   одному `/admin/*`.
4. Сессия: JWT 8 ч + ключ в Redis с TTL простоя 30 мин; отключение,
   смена роли и сброс 2FA завершают все сессии администратора сразу.
5. `apps/admin` не хранит admin-JWT в браузере: обмен TOTP → токен идёт через
   серверный route handler, токен лежит в httpOnly-cookie, все вызовы
   `/admin/*` проксируются сервером Next.js. Соответственно CORS для
   `ADMIN_ORIGINS` нужен только при прямых вызовах API из браузера.
6. Аудит «всех действий»: перехватчик пишет строку для каждого успешного
   изменяющего запроса и каждого просмотра с причиной; сервисы с собственной
   записью «до/после» помечены `@SkipAutoAudit()`, чтобы не дублировать.
7. Матрица §2.2 применена строго: споры и «Не могу связаться» — `support` и
   `super_admin` (в файле 04 временно допускался `moderator`); локализация —
   только `super_admin`.
8. Дашборд кэшируется в Redis на 60 с для всей команды; выручка =
   `active × $399` (§1.1).
9. Лимит запросов кода входа: 5/час на email, `ADMIN_LOGIN_LIMIT_PER_IP_PER_HOUR`
   (20) на IP — офисный NAT делит один IP.

## OQ-017. Файл 06, этап 6.3 — детали раздела «Пользователи»

**Статус:** зафиксировано 2026-09-29; реализовано по §2.3 п. 3 и §3.4.
1. Контакты (email/телефон) в карточке скрыты; отдельный запрос
   `GET /admin/users/:id/contacts` требует причину (`X-Justification`) и
   пишется в аудит — остальная карточка (роль, статус, профиль, сессии,
   кейсы/биды, подписка) открывается без причины.
2. Предупреждение: пользователь получает шаблонное `moderation_notice`
   (текст причины остаётся во внутреннем журнале и `moderation_actions`,
   в payload только id действия — §9.5 файла 05 «без чувствительных данных»).
3. Архивирование `open` кейсов приостановленного клиента переиспользует
   путь авто-архива §10.2 файла 04 (событие журнала `auto_archive`,
   биды `rejected_auto`, чаты до принятия закрываются, адвокаты получают
   `bid_rejected`), по одной транзакции на кейс после фиксации статуса.
4. Санкции недоступны для аккаунтов с ролью `admin` (403) — ими управляет
   раздел «Администраторы»; удалённые аккаунты — 404.
5. Поиск по имени — подстрока по `users.full_name_lower` (триграммный
   индекс файла 02), телефон нормализуется в E.164 (10 цифр ⇒ +1…).

## OQ-018. Файл 06, этап 6.4 — детали модерации

**Статус:** зафиксировано 2026-09-29; реализовано по §3, ниже — решения там,
где ТЗ оставляет свободу.
1. «Подтверждённые жалобы» для автоскрытия = жалобы со статусом `open` или
   `actioned` от разных пользователей (отклонённые не считаются); порог —
   `moderation.auto_hide_reports` (3). Автоскрытие меняет только статус
   объекта (без строки `moderation_actions`: у неё обязателен admin_id).
2. Сообщение чата не имеет статуса `hidden`: «скрыть» = `deleted_at`
   (исчезает из беседы), «восстановить» снимает `deleted_at`.
3. Кейс не скрывается модерацией (его состояния принадлежат жизненному
   циклу файла 04): по жалобе на кейс доступны предупреждение и
   приостановка клиента (последняя архивирует его открытые кейсы, §3.4).
4. Пороги «массовых ссылок» и «повторяющегося текста» вынесены в `app_config`
   (`moderation.max_links` = 3, `moderation.duplicate_window_hours` = 24);
   0 отключает правило. Повтор считается по нормализованному тексту (NFKC,
   нижний регистр, без пунктуации) на автора.
5. Отказ публикации по стоп-слову — `422 CONTENT_BLOCKED` (ранее заглушка
   отвечала `VALIDATION_ERROR`); приложение показывает общее сообщение.
6. Отзывы жалуются через `POST /reviews/:id/report` (только адвокат, файл 03
   §7.4); автоскрытие по порогу для них учитывает и жалобы других
   пользователей, если такие появятся из других каналов.

## OQ-019. Файл 06, этап 6.5 — детали очередей кейсов и запросов госорганов

**Статус:** зафиксировано 2026-09-29; реализовано по §2.3 п. 5, 11 и §5.4.
1. Решения по спору и по обращению остаются на эндпоинтах файла 04;
   админка добавляет только очереди и карточки. При возврате кейса в
   работу обе стороны теперь получают `case_updated` (при закрытии —
   `case_closed`, как и раньше); отдельного типа уведомления
   `dispute_resolved` в файле 05 нет — так называется событие журнала.
2. Автоприостановка клиента по порогу §8.4 дополнена эффектами §3.4
   (отзыв сессий, архив открытых кейсов) — в файле 04 менялся только статус.
3. «Пакет данных» — JSON, собираемый из выбранных разделов (профиль,
   контакты, кейсы, биды, раскрытия контактов, сообщения) по одному
   пользователю за раз; каждая сущность пишется в `data_access_log` до
   выдачи, причина (`X-Justification`) попадает в аудит. Передача
   госоргану — вне приложения (файл 04 §12). Хранение файла пакета в S3
   не делается: выгрузка одноразовая, журнал доступа — источник правды.
4. Сообщения в пакете — все сообщения бесед, где пользователь сторона
   (включая удалённые, с `deleted_at`), не более 5000.

## OQ-020. Файл 06, этап 6.6 — детали флагов, конфига, локализаций, документов

**Статус:** зафиксировано 2026-09-29; реализовано по §2.3 п. 7–10.
1. «Наличие ключей провайдера» проверяется по переменным окружения:
   `stripe_identity` → `STRIPE_SECRET_KEY`; `profile_promotion` →
   `STRIPE_SECRET_KEY` + `STRIPE_PRICE_ID`; `persona_verification` →
   `PERSONA_API_KEY`; `video_posts` → `MUX_TOKEN_ID` + `MUX_TOKEN_SECRET`;
   `auto_bar_check` → `BAR_LOOKUP_API_KEY`. Сами интеграции (Persona, Mux,
   адаптеры bar lookup) — вне файла 06; ключи объявлены необязательными.
2. Процент раскрытия (`rollout_percent`) редактируется и аудируется, но, как
   и в файле 01, приложением не применяется (флаги глобальные вкл/выкл).
3. Схема `app_config` выводится из типизированных значений по умолчанию
   (`APP_SETTINGS`), плюс явно описанные `budget.*`, `sms.allowed_country_codes`,
   `min_app_version_*`. Ключи вне схемы через админку создать нельзя.
4. Повторное принятие: сравнивается версия документа в последнем согласии
   пользователя с текущей версией того же типа для его языка (fallback `en`);
   устаревшим считается только согласие, ссылающееся на прежнюю версию;
   согласия без `document_id` (age_18, записи до появления версий) не
   требуют повторного принятия; `client_contact_sharing` не участвует.
   Публикация новой версии для одного языка требует повторного принятия
   только от пользователей этого языка.
5. Язык `en` — резервный, выключить нельзя (409).

## OQ-021. Файл 06, этап 6.7 — детали подписки Stripe

**Статус:** зафиксировано 2026-09-29; реализовано по §1.1–1.6.
1. Без ключей Stripe сервер использует `FakePaymentProvider` (тот же
   `PaymentProvider`, те же эндпоинты и вебхуки): dev и e2e проходят полный
   сценарий без внешних вызовов; приёмка в Stripe test mode с тестовыми
   часами выполняется теми же тестами при заданных `STRIPE_*` ключах —
   ключи предоставляет владелец (docs/KEYS_SETUP.md).
2. При `invoice.payment_failed` статус сразу `past_due` с льготным сроком
   (§1.5); повторное чтение подписки из Stripe в этот момент не делается
   (Stripe может ещё отвечать `active` и снять льготу) — синхронизация
   приходит со следующим `customer.subscription.updated`.
3. Уведомление `subscription_status` при переходе «неактивна → активна»
   не отправляется при первичном оформлении (incomplete → trialing/active):
   пользователь только что сам это сделал; отправляется при восстановлении.
4. `unpaid` и `incomplete_expired` → `expired`; отмена без единого
   успешного платежа → `expired` (триал закончился без списания).
5. Повторная подписка после `expired/canceled`: отметка о использованном
   триале сохраняется, поэтому второй триал невозможен ни адвокату, ни
   карте; приложение подтверждает списание $399 (`chargeNow: true`).
6. Продление админом реализовано через `trial_end` подписки Stripe
   (`proration_behavior: none`) от максимума из «сейчас / конец периода /
   конец льготы» + N дней; причина обязательна и пишется в аудит.
7. Автоотзыв бидов при потере доступа — `withdrawn` (файл 04 §2), не
   `rejected_auto` (это статус для архива кейса).

## OQ-022 — Journal chain heads after retention (stage 6.9)
Once `journal.retention` removes rows past `retain_until`, the oldest
remaining row of a long-lived case points (`prev_hash`) at a row that no
longer exists. The daily chain check accepts such a head only when the
head itself is older than 4 years (retention is 5); a younger head with a
non-null `prev_hash` is reported as a break (a recent row was deleted).
Decision taken (no check-in requested): the 4-year threshold is a
constant next to `JOURNAL_RETENTION_YEARS`; confirm or change before
launch (docs/06 §5.3).

## OQ-023 — Admin panel hosting (stage 6.10)
docs/06 §6.1 lists CloudFront "для медиа и админки", but the admin built
in stage 6.2 keeps the admin JWT in an httpOnly cookie and proxies every
API call server-side (docs/06 §2.1 security), so it is not a static site.
Decision taken: a third ECS Fargate service `admin` (Next.js standalone
image, `apps/admin/Dockerfile`) behind the same ALB on `admin.<domain>`;
CloudFront stays for media. Revisit only if the owner wants a static
admin (would require moving the token to the browser).

## OQ-024 — Admin audit IP behind the admin service (file 06 review)
The admin panel calls the API server-side. The API trusts one proxy hop
(`TRUST_PROXY_HOPS=1`), so the audited IP and the per-IP admin login limit
see the admin service's NAT address, not the operator's. The proxy no
longer forwards a client-supplied `X-Forwarded-For` (spoofable). Options
for the owner: an internal ALB path for admin → API with
`TRUST_PROXY_HOPS=2`, or accept NAT-level IPs in `audit_log` (the per-email
login limit still applies).

## OQ-025 — Data kept after anonymization (file 06 review)
docs/06 §5.1 names what is scrubbed; the anonymizer additionally empties
verification provider payloads (`verification_checks.details`). Left as
they are, on purpose: attorney bar numbers (`attorney_licenses`),
verification request rows (regulatory trail, files already deleted),
client-authored case text and bid messages (business records tied to the
counterpart). Confirm with counsel before launch.

## OQ-026 — Clients are searchable and have usernames (owner, 2026-09-29)
docs/05 §7.1 limits the people search to attorneys and docs/03 §5 gives
clients no public profile. Owner decision 2026-09-29: "клиент может найти
адвоката, адвокат может найти клиента в поисковике" — People search
(both roles) finds attorneys AND clients by @username and by first/last
name, like Instagram. Consequences implemented: `client_profiles.username`
(same rules as attorney usernames, auto-generated for existing clients),
a public client mini-profile (name, @username, state, avatar — no contacts,
docs/06 §1.5 masking unchanged), and a people-search endpoint that returns
both roles. Contact details still open only through an accepted bid.

## OQ-027 — In-app header, tabs and status bar (owner, 2026-09-29)
Owner decisions that replace the spec wording, applied to the signed-in
shell only (pre-app screens unchanged):
- Feed header: a centered text wordmark "LawBid" (Source Serif 4), Chats
  icon right, empty left slot, lower bar (52) — instead of docs/07 §10's
  scales logo on the left.
- The system status bar (clock/battery/wifi) is hidden in-app for both
  roles (`SystemUiMode.manual`, bottom overlay only); it returns on the
  welcome/sign-in screens.
- Tabs everywhere (feed Posts/Cases, search People/Cases/Posts/Topics,
  Mine, topic sort): equal-width segments, centered labels, one rounded
  container with separators, gold tint + underline on the selected one.
- Bottom nav: rounded top corners.
- "Mine" and "Profile" screens have no title bar; profile screens show
  "@username" centered (avatar or back button left, gear right); the
  "@username · Attorney" caption under the name is removed.
- Search: no permanent field; a magnifier at the right of the tabs row
  opens a full-width field over the row, with the Filters button inside on
  the left and the magnifier inside on the right (Android back closes it).

## OQ-027 (addendum, owner 2026-09-29, 2nd pass)
After testing the first pass on his phone the owner asked for: no avatar
in the profile header's left slot; segmented tabs without the gold tint
and underline (bold text only); the Search tab with a big field on top
and the sections under it (the "magnifier reveals the field" variant is
gone); the cases-feed filters over every US state and every practice
(searchable sheets that drag up to the top), not only the attorney's own;
in-app header icon buttons without frames (`AppIconButton(plain: true)`);
the language sheet draggable to the top; "Publish" in the case wizard dim
until the consent box is ticked; Telegram-style bubble alignment (mine
right, theirs left); no "Messages" title in the inbox; the client's own
profile laid out like the attorney's (avatar left, name/state beside it,
"@username" centered on top); iOS swipe-back on every pushed screen
(`CupertinoPage` on iOS/macOS, shared-axis motion stays on Android).
Followers of an attorney now list clients too (they have profiles since
OQ-026). The scales logo file stays in the repo but is not shown in-app.

## OQ-028 — Block / unblock any user (owner, 2026-09-29)
Not in docs/01–07. Owner: "кнопку заблокировать для всех пользователей и
разблокировка, систему целиком для всех". Implemented: `user_blocks`
(blocker, blocked), `PUT/DELETE /users/:id/block`, `GET /users/me/blocks`.
While a block exists in either direction: no messages in any conversation
between the two (403 USER_BLOCKED), no follows (existing follows removed
at block time), both drop out of each other's People search, public
profiles carry `isBlocked` / `hasBlockedMe` and the app hides Follow /
Message. Cases and bids already in progress are NOT touched (business
records, docs/04) — confirm with the owner whether an accepted case should
also be paused by a block. App: "⋯ → Block/Unblock, Report" on attorney
and client profiles and in the chat menu; Settings → "Blocked users".

## OQ-029 — Name / username changes never reset verification (owner, 2026-09-30)
docs/03 §4.1 sent a verified attorney's profile back to `pending` after a
name change (so the name matches the documents). Owner 2026-09-30: this is
wrong — an attorney with a paid subscription fixed a typo and was locked
behind the verification gate ("подтвердить документы"). Decision: a name or
@username change keeps `verified`; `startNameRecheckIfVerified` is a no-op.
Admins still see the current name next to the documents in the admin panel;
a manual re-check stays possible there. The subscription was never touched
by the old rule — only the gate was shown.

## OQ-030 — Several firms per attorney; states through licenses (owner, 2026-09-30)
Owner: an attorney must list several states, languages, practices and
firms in Edit. Languages and practices were already multi (practices up to
500 leaves, `PUT /attorneys/me/practice-areas`; the 403 the owner saw came
from the OQ-029 `pending` status). Firms: `attorney_profiles.firm_names`
(≤ 5), `firms` in the profile DTOs, `firm_name` mirrors the first entry.
States remain licenses (bar number + verifier check per state, docs/03):
Edit → "Add a state (license)" opens the verification wizard for an extra
license while the profile stays verified; the feed matches on verified
licenses only.

## OQ-027 (addendum 2, owner 2026-09-30)
Status bar: the owner reversed the hidden status bar — clock, network and
battery stay visible in-app (`SystemUiMode.edgeToEdge` in MainShell).

## OQ-029 (update, owner 2026-09-30): no manual work
Owner: no admin review for name changes. Rule (automatic): the name at
verification approval is stored (`verified_first_name/last_name`). A later
change close to it (typo, case, accents, order, one added middle name) keeps
the blue check; a different name sets `name_mismatch` and hides the check
everywhere (profile, posts, comments, bids, chats, lists) while the account,
cases, bids, chats and subscription keep working. Changing the name back
restores the check. Nothing reaches the admin queue.

## OQ-031 — Case photos (owner, 2026-09-30)
Not in docs/04. Owner: a client may attach up to 9 photos to a case; only
the attorney whose bid the client accepted sees them. Implemented: file
purpose `case_photo` (private documents bucket, antivirus scan, 320/1080
variants, short signed links — never the public CDN), `case_photos` table,
`photoFileIds` (0-9) on `POST /cases`, `photos` on the owner case detail,
`photos` + `photosCount` on the attorney case detail (photos only for the
accepted attorney; others see "N photos — open after acceptance").

## OQ-029 (final, owner 2026-09-30): phone-based confirmation
Owner: the account and the blue check rest on the confirmed phone number;
attorneys and clients change name, @username, states, languages,
practices and firms freely, the check never disappears and admins never
re-check. Attorneys keep the one-time license verification before their
first check (docs/03 — the badge still means "license verified" to
clients). Clients get a blue check for a confirmed phone. The automatic
"different name hides the check" rule and "Confirm new name" are removed.

## OQ-032 — Feed and card redesign (owner, 2026-09-30)
Floating pill bottom bar; client feed header: scales mark left, "LawBid"
centred, chats right, topic slider (hashtag topics) under it; attorney
header: "LawBid" left, Posts | Cases centred, chats right. Post card:
author + working Follow, topic chips (main one navy), time, bold title
(first line), 4 lines + "Read more", rounded photo, like/comment counts,
share, save. Case card: practice chip, place chip, title, 180-char
excerpt, budget, views, bids, practice artwork dissolving on the right
(bundled photos per category, icon fallback).

## OQ-033 — Full-height feed cards, default photos, 9 photos per post (owner, 2026-09-30)

Decided by the owner from phone review (replaces parts of OQ-032):
- Feed cards (posts and the attorney's case feed) fill the visible area
  down to the nav bar and run edge to edge (Instagram style). The photo
  takes all the space the text leaves, full width.
- A post has up to 9 photos (was 10 in docs/05 §3.2) — same as cases.
  A post without photos shows our default photo for its practice (from
  its hashtags). Case cards always show our default practice photo; the
  client's own case photos stay private until a bid is accepted (OQ-031).
- The topic slider is shown to attorneys too (Posts tab); the two case
  filters share the row evenly. The "⋯" menu of a profile sits in the top
  bar, opposite the @username.
- Topic slider: a filter button left of "All" opens a searchable
  multi-select of all 42 practice categories; the slider shows only the
  chosen ones (kept on the device). Each category's topic is a hashtag.
- Feed cards touch each other and fill the space from the slider to the
  nav bar; 3 lines of text, then "Read more"; the time and "Public" sit
  left of Save so the photo gets more room. Header logo and chats sit
  closer to the screen edges; the slider starts at the left edge.

## OQ-034 — Case cards like post cards; case comments; case documents; state filter (owner, 2026-09-30)

- Case comments: a full system like post comments (one reply level, likes,
  delete by author or case owner, reports `case_comment`, moderation,
  counters, notification `case_comment`, data export). Only the case owner
  and attorneys who can see the case read/write them; the client is shown
  as "Case owner"/"Client" (never named); contacts are refused
  (CASE_CONTAINS_CONTACT_INFO).
- Case feed card = post card: our practice photo, comments count, share
  link `lawbid.app/case/:id`, time, Save. Filter: the same topic slider as
  posts (practice category, `GET /cases?practiceCategory=`), plus a state.
- Posts: the filter sheet has "Choose topics" and "Choose state"; a state
  filters to attorneys licensed there (`GET /tags/:tag/posts?state=`,
  `GET /search/latest-posts?state=`).
- Case documents: besides photos a client can attach PDF and Word (.docx)
  files (`case_attachment`, private bucket); 9 files total. Only the owner
  and the accepted attorney open them; the feed shows only our photos.
- Post photos are shown whole (contain over a blurred copy); the open post
  opens a full-screen gallery with zoom.
- Default practice photos for every category (Unsplash License, credits in
  docs/PHOTO_CREDITS.md); a CDL case shows a truck.
- Header logos (feed, own profile) are the animated scales, swinging for
  6 s after they appear and easing to rest.

## OQ-035 — Search tab redesign (owner, 2026-09-30)

- Top: the search field; tabs People / Cases / Posts / Topics.
- People: a list of accounts (attorneys and clients) by name or @username.
- Cases: attorneys search open cases they can see (clients' cases); a
  client's tab is "My cases" (their own) — other clients' cases are
  private. Shown as an Instagram-like 2-column grid of tiles that say
  what they are ("Case · <practice>", title, budget · state).
- Posts: the same grid ("Post · <topic>", title, author); photo = the
  post's own or our practice photo.
- Topics: explained ("post hashtags by area of law"), each with our practice
  photo, name, #tag and post count; practices matching the text come first.
- Before typing, every tab shows recent searches, "Based on your search"
  (that tab's results for the latest search) and explore content
  (suggested people / cases for you / fresh posts / popular and all topics).
- API: `GET /search/latest-posts` state is optional now.

## OQ-036 — Search filters per tab (owner, 2026-09-30)

The filter button in the Search field opens the open tab's own filters:
- People: who (everyone / attorneys / clients), state (attorney licence or
  client's state), practice area, minimum rating, language, verified only.
- Cases (attorney): practice area (category), state, posted, budget range,
  "clarify later" only, no bids yet. My cases (client): status, practice.
- Posts: topic (area of law → its hashtag), author's licensed state,
  posted, sort (best match / newest / popular), with photos only.
- Topics: show all / areas of law / hashtags; sort popular / A–Z.
The filters also shape each tab's suggestions before typing.
API: `/search/people?role&verifiedOnly`, `/search/cases?practiceCategory&
budgetMin&budgetMax&budgetUnknown&noBids`, `/search/posts?tag&state&period&
withPhotos&sort`; e2e `owner-search-filters`.

## OQ-037 — Compact counters, share counter, double-tap like, swipe back (owner, 2026-09-30)

- Every counter in the app (likes, comments, shares, views, bids,
  followers, reviews…) is compact: 999, 1.3K, 12K, 500K, 1.3M, 2B. The
  admin panel keeps exact numbers.
- Posts and cases count shares: a completed share sheet calls
  `POST /posts/:id/share` / `POST /cases/:id/share` (rows in post_shares /
  case_shares, `shareCount` on the DTOs, counters + nightly reconcile).
- Double tap anywhere on a post likes it (never unlikes) with the heart.
- Pages slide in from the right and a swipe from the LEFT edge goes back
  on every platform (Android too), like on iPhone.

## OQ-038 — Instagram-like client profile, client posts, reviews of clients (owner, 2026-09-30)

The owner: the client profile looked too plain next to the attorney's.
Differs from docs/03 §5 (private client profile without counters):
- A client profile is public like an attorney's: avatar, posts / followers /
  following counters, name, "Client · state", Edit (own) or Follow.
- Clients can publish posts ("+" → New case / New post); clients can be
  followed; followers / following lists work for both roles.
- Two tabs: "Posts" and "Reviews from attorneys". An attorney whose bid was
  accepted can rate the client (1–5 + text) from the case at work
  (`PUT /cases/:id/client-review`, one per case). Reviews and the client's
  rating are visible only to attorneys and the client (`GET /clients/:id/
  reviews` → 403 for other clients).
- The client's cases stay in "Mine" only; the "My cases" tab is removed
  from the client's Search.
- "Mine" cards (client cases, my bids, in progress / closed) now carry the
  practice photo banner with the practice chip and status, a bold title,
  a meta line with icons and a footer (bids / terms). `WorkItemDto` and
  the bid's case ref now include the practice (`practiceAreaCode` …).
API: migration `20260930150000_owner_client_profile_social`, module
`client-reviews`; e2e `owner-client-profile`.

## OQ-039 — Privacy note when publishing a case (owner, 2026-09-30)

Above "Publish" the case wizard explains, in three lines: other clients
never see the case; attorneys see only the description — not documents,
photos or contact details — until the client accepts a bid; files are
opened only to the attorney the client chooses. "Not sure / other" cases
are shown (as before, docs/04 §4.1) only to attorneys with General
Practice licensed in the case's state.

## OQ-040 — Voice messages in chats, like Telegram (owner, 2026-09-30)

Differs from docs/05 §8.2 ("text only"): chats take voice messages.
- Hold the mic to record (AAC .m4a, mono 64 kbit/s), slide left to cancel,
  slide up to lock and record hands-free; 0.5 s … 15 min.
- Bubble: play/pause, waveform that fills while playing (tap/drag to
  seek), time, speed 1× / 1.5× / 2×, one note plays at a time; a dot until
  the recipient has played it (`POST /conversations/:id/messages/:mid/
  listened`, realtime `message:listened`).
- Server: `chat_voice` files (m4a checked by magic bytes, private bucket,
  antivirus), `messages.type = voice` with `file_id`, `duration_ms`,
  `waveform`, `listened_at`; a note is sent once; same rules as text
  (blocks, closed chats, attorney subscription, rate limit). Push says
  "🎤 Voice message"; reports show moderators a link to listen; data export
  lists notes; account deletion removes the audio.
- The app downloads a note once and plays it from the cache.

## OQ-041 — In-app audio calls, no video (owner, 2026-09-30)

Not in the ТЗ. Two chat members call each other inside the app (not over
the phone network), audio only.
- Decision: calls open once the bid is accepted (contacts unlocked) —
  before that a call would bypass the contact masking of docs/04 §8.3.
  Same rules as messages: blocks, closed chats, the attorney's active
  subscription. One call at a time; the other side busy → "Busy".
- Flow: ring (realtime + push) → accept / decline → WebRTC audio
  (echo cancellation, earpiece/speaker, mute) → hang up. Unanswered 45 s
  (app) / 60 s (server sweep) → missed; missed calls notify the callee.
  Every call lands in the chat log (outgoing / incoming with talk time,
  missed, declined, busy, failed) with "call back".
- Server relays signaling only (`call:signal`); audio goes device to
  device or through TURN (coturn, short-lived HMAC logins, STUN by
  Google). `calls` table, `missed_call` notification.
- Background / locked screen: Android rings from a data-only FCM push
  through the system call screen (flutter_callkit_incoming); iOS gets a
  time-sensitive push. Needs the Firebase keys (docs/KEYS_SETUP.md);
  true iOS CallKit ringing on a locked phone additionally needs an APNs
  VoIP key (PushKit) — owner step at App Store setup.
- Verified on the emulator: outgoing, incoming, accept, decline, end,
  chat log. Two-way audio needs two real phones (emulator has no audio).

## OQ-042 — @username mentions in posts and comments (owner, 2026-09-29/30)

Like Instagram: typing "@" in a post or a comment suggests people
(attorneys and clients, by @username or name); a mention is gold and
opens the profile; the mentioned person gets a "mentioned you"
notification once (an edit notifies only newly added people; nobody for
their own mention; not across a block; no duplicate when they already get
a comment/reply notification). The API returns `mentions` on posts and
comments (real people only). Owner decisions the same day: attorneys do
not publish cases; the case city stays visible as before.

## OQ-043 — "Message" on a profile opens a direct chat; message requests like Instagram (owner, 2026-09-30)

Differs from OQ-014 / docs/04 §9 (chats only from a case).
- "Message" on an attorney's profile (for clients) or a client's profile
  (for attorneys) opens the one direct chat of that pair. Attorney ↔
  attorney and client ↔ client have no direct chats (the button is hidden).
- The first messages are a request: the recipient sees them under
  "Message requests" (a row with the count at the top of Chats), without
  a badge and with one push; the requester sees "Request sent" and may
  send up to 3 messages, without "Seen", until the answer.
- Accept (or simply replying) moves the chat to the main list; Delete
  stops the requester ("This person isn't accepting your messages");
  Block blocks and deletes.
- Owner decision (same day): one common "Chats" list — case chats
  (labelled with the case) and direct chats (labelled @username) together.
  An accepted request is a full chat: contacts are not masked and calls
  are available (only attorneys with an active subscription can write or
  call, so what they agree with a client is their business). While a
  request is pending: contacts masked, no calls. Case chats keep docs/04:
  masked, no calls until the bid is accepted. Blocks apply everywhere.

## OQ-044 — App sounds, call tones, ring timeout, tighter top bars (owner, 2026-09-30)

- Calls: the caller hears ringback tones (like a real phone) while it rings
  there; "busy" beeps when the other side is in a call; a calm two-note
  tone when a call ends. An unanswered call ends by itself after 30 s
  (about six rings); the server marks forgotten ones missed after 40 s.
- Chats: a soft two-note chime for the other side's message in an open,
  unmuted chat; a short soft "tick" when you send (text or voice).
- Pushes and the incoming-call screen keep the phone's own sounds.
- Sounds are generated in-house (no third-party files), calm and warm,
  in `assets/sounds/`.
- A quick tap on the mic no longer records by itself (only a hold does).
- Top bars: the back arrow and right-hand icons sit near the screen edges
  (chat, profiles, every screen with a back arrow); welcome/login screens
  untouched.

## OQ-045 — Layout polish, "Calls" notification category, clearer message requests (owner, 2026-09-30)

- Rows placed straight on a screen (e.g. "Comments" under a case
  description) line up with the text above — no left inset.
- Chat list: the name takes all the room the time leaves; only long names
  get an ellipsis.
- Case photos and files sit centred (wizard and case cards, client and
  attorney); more than fit scroll sideways.
- Notification settings get a separate "Calls" category (incoming-call
  ring push and missed calls), on by default; it was part of "Messages".
- A direct chat whose request is not accepted yet has no call button, and
  my own pending request is labelled "@username · Request sent" in the
  list. Case chats keep docs/04 (calls once the bid is accepted).

## OQ-046 — Qualifications everywhere, News, outside-practice bids, opt-in alerts, open client reviews, Mine grid (owner, 2026-09-30)

Differs from docs/04 §4.1–4.2 (attorneys see only their own practices),
docs/05 §3 (a post is text + photos) and OQ-038 (only the hired attorney
reviews a client).
- Every filter and picker lists all qualifications — the 42 categories and
  every subcategory (e.g. Civil Litigation → Arbitration) — with
  suggestions while typing (best match first, every word must match, a
  subcategory also matches by its category).
- Posts: "+" asks for a title, a description, the qualification (required,
  category or subcategory) and up to 9 photos; without photos the card
  shows our art of that qualification (stored with the post, not guessed
  from hashtags). Attorneys choose Post or News; News is attorneys only.
  Older posts keep working (title from the first line, topic by hashtag).
- The topic slider (posts) has "News" for everyone and any qualification;
  a category includes its subcategories. Attorney profiles get a News tab.
- Attorney case feed: "All" stays their own practices; a qualification
  picked in the slider shows every open case of it in the attorney's
  verified-license states. They may bid outside their practices: the bid
  is marked and the client sees "outside the attorney's practices —
  discuss before accepting"; the attorney is told before bidding.
- Opt-in notifications (off by default, Settings → Notifications):
  "Following" — new posts / news of people I follow; "New cases"
  (attorneys) — a new case in my practices and licensed states.
- Client reviews: any attorney or client may review a client once
  (editable), with or without a shared case; every signed-in user reads
  them. The author deletes theirs at any time. The reviewed client may
  appeal once ("…" → Appeal); admins accept (remove) or reject (keep),
  one by one or in bulk (admin "Review appeals"); an appeal nobody decided
  in 30 days removes the review automatically (hourly job). Reviews of
  attorneys stay as they were (only clients who worked with them).
- "Mine": client tabs Open (with Archive) · In progress · Completed ·
  Saved; attorney tabs My bids · In progress · Completed · Saved. Cases
  show as a 3-column grid of squares (first photo, or the qualification's
  art; short title; status), with search by title and filters
  (qualification, state) so long lists need no scrolling.

## OQ-047 — Photos and documents in chats after acceptance (owner, 2026-09-30)

- Once the bid is accepted (contacts unlocked — case chats, and accepted
  direct chats) both sides send any number of photos and documents:
  JPG, PNG, HEIC, WEBP, GIF, PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, ODT/ODS/ODP,
  RTF, TXT, CSV; up to 25 MB each (`files.chat_max_size_mb`, editable in
  the admin panel). Before acceptance the paperclip is hidden and the API
  answers `CHAT_ATTACHMENTS_LOCKED`.
- The server checks the real type from the bytes (the declared type must
  match), scans every file with the antivirus, keeps them private (short
  signed links for the two members only) and makes photo previews.
- A caption can go with the first file; chat menu → "Files and photos"
  lists every photo and document of the chat. Pushes say "📎 File" without
  the file name. Reports show the moderator a link to the file; deleting
  an account deletes the files it sent.

## OQ-048 — Plans, Stripe page checkout, attorney assistants, Tasks, admin sections (owner, 2026-09-30)

**Plans and payment**
- Two plans: **Monthly** $399 + $100 per assistant seat (0–6, picked on the
  plan screen, chosen by default) and **Yearly** $9,590 (attorney + all six
  seats, −20%) shown below it. The 7-day trial applies to both.
- Payment is Stripe's hosted page in the in-app browser (store-compliant,
  only Stripe's fee); the app waits for the session and applies it
  (`POST /subscriptions/checkout`, `/checkout/complete`; webhook
  `checkout.session.completed`). Branding: logo/colours in the Stripe
  Dashboard + `custom_text`. Env: `STRIPE_PRICE_SEAT_ID`,
  `STRIPE_PRICE_YEARLY_ID` (see KEYS_SETUP). The in-app card sheet
  (SetupIntent) stays in the API for older builds, the app no longer uses it.
- Monthly seats change later from Subscription → "Your plan"
  (`POST /subscriptions/seats`, prorated by Stripe); fewer seats than
  assistants is refused (`ASSISTANT_SEATS_IN_USE`).

**Assistants**
- New role "Attorney's assistant" (onboarding: phone + name). An assistant
  has no profile or subscription of their own: after joining they use the
  attorney's account (the server swaps the account per request; their own
  login, notifications and devices stay theirs).
- Joining: a phone the attorney added (at purchase or in Team) joins with
  one tap; otherwise a code goes to the **attorney's** phone and the
  attorney tells it.
- Duties per assistant (one duty to many assistants, many to one): calls,
  chats, files, cases, bid drafts, publications, tasks, profile. New
  assistants get everything but calls.
- Never: bids (they save a **bid draft** the attorney sees on the bid form
  and sends), billing, verification, team, deleting publications.
  Publications, comments and profile edits go to the attorney as
  **approval requests**; approved ones are published in the attorney's
  name.
- Chats: messages show "Assistant · Name"; files need the "files" duty.
  Calls to the attorney also ring assistants with "calls".
- Every change an assistant makes is logged (Inbox → **Team** → Activity,
  hidden from assistants); requests are approved/rejected there too; a
  badge shows pending requests.

**Tasks** (Mine → «Задачи» — named "Tasks", not "Plans": clearer)
- The attorney and assistants add tasks from "+ Add task" (also "+" →
  Task): kind (call, meeting, court, deadline, documents, print, visit,
  other), title, date/time, place, contact, case, notes, documents.
- Calendar list by day (Overdue · Today · Tomorrow · dates · No date) with
  round checkboxes: tap = done; a task opens with Take / Done / Not done
  (+ note, + move to another time — it stays open at the new time) /
  Cancel. The assistant who set a task gets the result (push + "Results").

**Admin**
- New sections: Teams (seats, members, duties, remove with reason,
  activity), Content (posts/news, post and case comments, reviews — remove
  or hide with a reason, the author gets a moderation notice), Bids,
  Qualifications (rename, reorder, switch off, add), Broadcasts (push +
  in-app to all / attorneys / clients / assistants, optional state), CSV
  exports (users, cases, bids, payments, posts, teams), dashboard numbers
  (plans, seats, revenue 30 d, assistants, tasks, chats, calls).
- Not done yet (in REMAINING): support tickets, promo codes and refunds
  from the panel, editable push/email templates (push texts are already
  editable via Localization keys `notif.*`).

**Also in this pass**
- Rate limit counts per signed-in user instead of per IP (an attorney and
  six assistants often share one office IP); anonymous requests per IP.
- UI: News badge and "NEW" flush right; Search — sections on top, field
  below; Mine — filter button inside the field on the left, magnifier on
  the right; My bids shows only bids waiting for the client (accepted →
  In progress, finished → Completed); News is the first item of the
  topics picker and on by default.

## OQ-049 — Access switches with the attorney's responsibility, one device per account, Planner (owner, 2026-10-01)

- Every assistant access (calls, chats, files, cases, bid drafts,
  publications for approval, tasks, profile, **bids and negotiation**,
  **publishing without approval**) is a switch the attorney turns on in
  Team. Turning one on shows a warning: the attorney accepts full
  responsibility for the assistant's actions; LawBid is a bulletin board,
  not a law firm, and is not responsible for assistants; state ethics rules
  on supervising non-lawyer staff apply. A tick is required. Each grant and
  withdrawal is stored append-only (`assistant_liability_acceptances`: who,
  which duties, terms version, IP, device, time). New assistants start with
  no access; admins can only take access away.
- With "bids" an assistant places bids and counters / accepts / declines /
  withdraws in the attorney's name; with "publish" they post / comment
  directly. Without them: drafts and approval requests as before.
- One phone + one website per account at a time (attorneys, assistants,
  clients). Signing in on another phone first asks "This account is open on
  another device (name, last active) — continue and sign out there?"; the
  other phone is then signed out with a clear message and stops getting
  pushes. A website sign-in never signs the phone out (and vice versa).
- Mine: two tabs — My bids (Active · In progress · Completed · Saved) and
  Planner (19 task kinds incl. consultation, hearing prep, deposition,
  mediation, filing, review, email, signing, payment, research, facility
  visit). Task cards: colour strip by status, big time, place / contact /
  case, status mark bottom-right; a double tap marks done.
- Files: no count limit in chats and tasks (25 MB each, common formats,
  scanned); publications and cases keep 9 photos.
- The client sees an assistant's message as "Assistant of <attorney>"
  (and the push says "Attorney's assistant:").

## OQ-050 — Checklists in tasks, Prime switch, phone changes by support, share to social networks (owner, 2026-10-01)

- One task holds any number of steps (5 calls, 6 meetings, several
  addresses) instead of a card per item. Each step has its own time, place
  and contact; the attorney checks steps off one by one; the task is done
  when every step is checked (all done → done, any not done → not done).
  Assistants plan steps (add / move / note) but never check them off.
  Technical cap: 100 steps per task.
- Task cards use only the brand palette (navy medallion, gold icon and
  progress, ink for "not done"); red is kept only for an overdue time.
- An active monthly plan can switch to yearly "Prime" from the
  subscription screen; the difference is charged at once (Stripe
  `always_invoice`).
- Phone change: users change their phone themselves (code to the new
  number). When the old phone is lost, a **super admin** changes it from
  the admin panel after checking identity; the reason is mandatory, the
  old number stops working, every session is signed out and the user gets
  a push + email. New states: an attorney adds a license with its bar
  document in Verification; admins approve or reject per state.
- Share: Instagram and TikTok have no link-share API — the link is copied
  and the app opened with "paste it in …".
- Spending protection: SMS only to US mobiles, per-number / per-IP /
  per-account limits on every SMS (incl. the assistant join code), global
  SMS / email / storage budgets (fail closed), one data export a day.
  Deployed environments must set `TRUST_PROXY_HOPS=1` (startup refuses 0).

