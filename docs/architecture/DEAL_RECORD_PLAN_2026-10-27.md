# Запись о заключении сделки (deal record) — план, 2026-10-27

Статус: план + реализация в одной ветке `claude/deal-record-2026-10-27`.
Всё за выключателями админки, по умолчанию ВЫКЛ: `deal_record.enabled`,
`bids.rich_terms_enabled`. Исследование: `docs/dev/BID_TERMS_AGREEMENT_RESEARCH_2026-10-27.md`.
Решения владельца (NEXT_CLAUDE_START_HERE.md, 19:33): документ — НЕ договор,
всегда на английском, тексты сторон слово в слово, три фразы согласия и
строка-отказ редактируются в админке по языкам, без телефонов, каждая
страница с номером/датой/кодом/инициалами, принятие окончательно только после
двух подписей, «Отказаться» без последствий, Сохранить → Открыть, Печать,
адвокат может приложить свой договор, никаких платных e-sign сервисов.

## 1. Коротко (для владельца)

Дополнение владельца (2026-10-27, вечер): строка внизу каждой страницы
явно говорит, что LawBid — не сторона, не посредник, не принимает и не
удерживает никакой части оплаты или гонорара, не отвечает за результат
(англ. текст по умолчанию в `deal-record-texts.ts`, правится в админке).

1. Адвокат в ставке может указать вид оплаты подробнее (аванс + помесячно,
   почасово, процент, «уточним позже», смесь) — только если включён
   `bids.rich_terms_enabled`. Без него форма ставки как сегодня.
2. Клиент нажимает «Принять» → открывается экран «Запись о сделке»: таблица
   (дело, стороны, оплата, дата), вся история предложений по датам, три фразы
   на языке клиента, поле для подписи, серая кнопка «Подтвердить», которая
   становится синей после подписи. Пока нет двух подписей, ставка НЕ принята:
   любая сторона нажимает «Отказаться», и всё остаётся как было.
3. После подписи клиента адвокат получает пуш «Ставка принята — подпишите,
   чтобы начать» и проходит тот же экран. После его подписи ставка принята
   по-настоящему (как сегодня: чат, контакты, остальные ставки отклонены), а
   PDF с двумя подписями «запечатан» (хеш в базе) и лежит во вкладке Docs
   дела и на обзоре: «Сохранить» → «Открыть», «Печать».
4. Всё, что тяжёлое (PDF), делает фоновая задача, не запрос. Файл — обычный
   файл дела в S3; в базе только маленькие строки и SHA-256.

## 2. Модель данных

### 2.1 Новые колонки

| Таблица | Колонка | Тип | Зачем |
|---|---|---|---|
| `bids` | `payment_terms` | `jsonb NULL` | подробные условия оплаты (схема §2.3) |
| `bid_offers` | `payment_terms` | `jsonb NULL` | те же условия на каждом раунде (append-only) |

### 2.2 Новая таблица `deal_records` (семейство `case`, shard по `case_id`)

```
id                 uuid PK
case_id            uuid FK cases          (parent shard key)
bid_id             uuid FK bids
accepted_by        party_role             чья очередь была принять (client|attorney)
initiator_id       uuid                   кто нажал «Принять»
status             deal_record_status     preparing | awaiting_signatures | sealing | sealed | declined | failed
snapshot           jsonb                  всё, что печатается (§3), + версии текстов
snapshot_sha256    varchar(64)            SHA-256 канонического JSON снимка
record_code        varchar(24)            <8 символов id>-<8 символов snapshot_sha256> — печатается на каждой странице
text_version       int                    номер версии текстов админки на момент создания
sign_request_id    uuid NULL UNIQUE FK case_sign_requests  (подписи живут в case_signatures)
unsigned_file_id   uuid NULL              PDF без подписей (files, purpose case_attachment)
sealed_file_id     uuid NULL              PDF с двумя подписями
sealed_sha256      varchar(64) NULL       SHA-256 запечатанного файла
agreement_file_id  uuid NULL              договор адвоката (его собственный PDF), ссылка
declined_by        uuid NULL, decline_reason varchar(300) NULL
sealed_at, declined_at, failed_reason varchar(300) NULL
created_at, updated_at, shard_id smallint default 0
INDEX (case_id, created_at), INDEX (bid_id), INDEX (status)
```

Правило: на одно дело в один момент не больше одной «живой» записи
(`status IN (preparing, awaiting_signatures, sealing)`) — проверка в
транзакции под `SELECT … FOR UPDATE` строки дела.

Подписи: строки `case_signatures` (как в Docs-подписании: имя, PNG ≤150 KB,
`doc_sha256` = SHA-256 неподписанного PDF, IP, user agent). Журнал дела
(`case_journal`, хеш-цепочка, 5 лет): `signature_requested` /
`signature_signed` / `signature_completed` / `signature_declined` с
`payload.dealRecordId` — новых значений enum не нужно.

Файлы: `deal_records.unsigned_file_id / sealed_file_id / agreement_file_id`
добавлены в список «кто держит файл» уборщика хранилища
(`storage-cleanup.service.ts`), удаления через API нет (у файлов дела его и
не было). S3 Object Lock — вне объёма, см. инструкцию в админке.

Выключатели (`app_config`): `deal_record.enabled=false`,
`bids.rich_terms_enabled=false`. Оба отдаются приложению в
`GET /config/bootstrap.app_config` (префиксы `deal_record.`, `bids.`).

### 2.3 Условия оплаты (`payment_terms`, версия 1)

```json
{
  "version": 1,
  "type": "flat | hourly | contingency_pct | retainer_plus_installments | mixed | to_be_clarified",
  "currency": "USD",
  "flatCents": 250000,
  "hourlyRateCents": 35000, "estimatedHoursMin": 10, "estimatedHoursMax": 20,
  "contingencyBps": 3333,
  "retainerCents": 300000,
  "installmentCents": 50000, "installmentCount": 10, "installmentPeriod": "weekly | monthly | quarterly",
  "notes": "до 1000 знаков"
}
```

Правила (`payment-terms.ts`, юнит-тесты): суммы — целые центы 1..1e9,
проценты 1..10000 bps, `type` определяет обязательные поля (`flat` →
`flatCents`; `hourly` → `hourlyRateCents`; `contingency_pct` →
`contingencyBps`; `retainer_plus_installments` → `retainerCents` +
`installmentCents` + `installmentCount` 1..120 + `installmentPeriod`; `mixed`
→ хотя бы одно из полей сумм; `to_be_clarified` → только `notes`),
`estimatedHoursMin ≤ Max`, лишних полей нет. Старые поля `fee_type` /
`amount_cents` / `percent_bps` остаются «заголовком» ставки (фильтры, списки).

## 3. Снимок и PDF

Снимок (`snapshot`, канонический JSON с сортированными ключами) строится в
момент «Принять» и больше не меняется:

- `case`: id, title, practice, state codes; `acceptedAt` (UTC).
- `client`: fullName, email, username. `attorney`: fullName, barState,
  barNumber, email, username. Телефонов нет.
- `terms`: headline (fee_type / amount / percent) + `payment_terms` принятого
  раунда.
- `history[]`: все `bid_offers` ставки дословно: round, fromRole,
  createdAt, feeType, amountCents, percentBps, message, paymentTerms.
- `texts`: `notContract` (строка под заголовком), `footer`, их версии
  (`text_version`) — английские; три фразы согласия в PDF не входят.

PDF (`deal-record.pdf.ts`, pdfkit, `startPdf` из `pdf-common.ts`, шрифт
Inter-Variable — покрывает латиницу, кириллицу, ң ө ү; проверено fontkit):

```
┌──────────────────────────────────────────────────────────────┐
│ Deal record — LawBid                                          │
│ This is not a contract. The attorney and the client conclude  │
│ their legal-services agreement separately. This document only │
│ records how they agreed inside the LawBid app.                │
│                                                               │
│ Case            │ <title>                                     │
│ Client          │ <full name> · <email> · @<username>         │
│ Attorney        │ <full name> · <state> bar #<n> · <email> …  │
│ Payment terms   │ Flat fee $2,500.00 …                        │
│ Accepted        │ 2026-10-27 19:40 UTC (by the client)        │
│                                                               │
│ Offer history (verbatim, as written in the app)               │
│ ── 2026-10-25 ───────────────────────────────────────────────  │
│ 14:02 UTC · Attorney · Flat fee $3,000.00                     │
│ "<message exactly as typed>"                                  │
│ 18:30 UTC · Client · Counter-offer $2,500.00                  │
│ "<message>"                                                   │
│ ── 2026-10-27 ───────────────────────────────────────────────  │
│ 19:40 UTC · Client · Accepted                                 │
│                                                               │
│ Signatures (last page)                                        │
│ ┌ Client ──────────────┐  ┌ Attorney ────────────┐             │
│ │   [drawn PNG]        │  │   [drawn PNG]        │             │
│ └──────────────────────┘  └──────────────────────┘             │
│ Name · signed at (UTC) · IP   Name · signed at (UTC) · IP       │
│ SHA-256 of the unsigned record: …  Record code: ab12cd34-9f8e… │
├──────────────────────────────────────────────────────────────┤
│ LawBid is a listing board: clients post cases, attorneys make  │
│ offers. LawBid is not a party … is not an intermediary, does   │
│ not handle or take any part of any payment or fee … shown.     │
│ Record 1a2b3c4d-5e6f7a8b · 2026-10-27 · [ini] [ini] · Page 2 of 3 │
└──────────────────────────────────────────────────────────────┘
```

Футер на каждой странице: строка-отказ (из админки), код записи, дата,
миниатюры подписей-инициалов обеих сторон (только в запечатанном файле),
«Page N of M» (pdfkit `bufferPages` + второй проход). Хеш файла в самом
файле быть не может — печатается SHA-256 снимка (часть кода записи), а
SHA-256 запечатанного файла хранится в `deal_records.sealed_sha256` и в
журнале дела (`signature_completed`).

## 4. Эндпоинты (`modules/deals`, префикс `api/v1`)

| Метод | Путь | Кто | Что |
|---|---|---|---|
| POST | `/deal-records` `{bidId}` | сторона, чья очередь принимать | создаёт запись `preparing`, ставит задачу рендера. 409 `DEAL_RECORD_PENDING` если по делу уже есть живая запись; 404 если выключено |
| GET | `/deal-records/:id` | обе стороны | DTO: статус, снимок (для экрана), кто подписал, моя ли очередь, ссылки на PDF (presigned, 15 мин, с `Content-Disposition`) |
| GET | `/cases/:caseId/deal-record` | обе стороны | `{record: DTO|null}` — текущая (не отклонённая) запись дела для карточки Docs/обзора и экрана ставки |
| POST | `/deal-records/:id/sign` `{name, imagePngBase64}` | сторона, ещё не подписавшая | подпись → `case_signatures`; первая подпись: пуш другой стороне; вторая: в той же транзакции настоящее принятие ставки (`BidAcceptanceService.acceptInTx`) → `sealing`, задача финального рендера |
| POST | `/deal-records/:id/decline` `{reason?}` | обе стороны | пока нет двух подписей: `declined`, ставка и дело не тронуты, пуш другой стороне |
| POST | `/deal-records/:id/agreement` `{fileId}` | адвокат, после `sealed` | привязать собственный договор (обычный файл дела) |
| GET | `/admin/deal-record/preview` | админ | PDF с примером данных (проверить тексты) |

`POST /bids/:id/accept` при включённом `deal_record.enabled` отвечает 409
`DEAL_RECORD_REQUIRED` (старое приложение → «обновите приложение»).

Коды ошибок: `DEAL_RECORD_REQUIRED`, `DEAL_RECORD_PENDING`,
`DEAL_RECORD_INVALID_STATE`, `PAYMENT_TERMS_INVALID`,
`PAYMENT_TERMS_DISABLED`.

## 5. Фоновая задача (`deal-record` очередь BullMQ)

- `render-unsigned` (jobId `<id>:unsigned`): снимок → PDF → `FilesService.storeGenerated`
  (case_attachment, S3 private bucket, `Cache-Control: private, max-age=3600`,
  ETag — у S3) → `case_sign_requests` (title «Deal record», `source_sha256`)
  → `awaiting_signatures`.
- `render-sealed` (jobId `<id>:sealed`): снимок + две подписи → PDF с
  инициалами в футере и подписями на последней странице → файл →
  `sealed_sha256`, `case_sign_requests.final_*`, обе ссылки в `case_photos`
  (вкладка Files/Docs), журнал `signature_completed`, пуш обеим сторонам
  → `sealed`.
- attempts 3, exponential backoff 5 s, concurrency 2, `removeOnComplete`.
  Падение после всех попыток → `failed` + `failed_reason` (запись видна,
  «Отказаться» доступно; принятие уже произошло, если упал `render-sealed` —
  тогда задача перезапускается кнопкой владельца «повторить» позже; в этой
  волне: ручной `queue.add` из ops).

## 6. Машина состояний

```
POST /deal-records ──► preparing ──(job ok)──► awaiting_signatures
                          │                        │   │
                          │ decline                │   │ sign #1 (acceptor)   → пуш другой стороне
                          ▼                        │   ▼
                       declined ◄── decline ───────┘  awaiting_signatures (1 подпись)
                                                        │ sign #2 → acceptInTx (bid accepted, case in_progress)
                                                        ▼
                                                     sealing ──(job ok)──► sealed
                                                        └─(job failed)──► failed
```

Инварианты (юнит-тест `deal-record.machine.spec.ts`): подписать можно
только в `awaiting_signatures` и только одной стороне один раз; `decline`
только до второй подписи; после `sealing` запись неизменна (нет UPDATE
снимка/подписей через API).

## 7. Экраны (Flutter, дизайн-токены как есть)

```
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ ‹  Deal record               │   │ Docs                          │
│ ─────────────────────────── │   │ ┌──────────────────────────┐ │
│ Case        Divorce filing   │   │ │ Deal record   ● Sealed    │ │
│ Client      Anna Ivanova     │   │ │ Flat fee $2,500 · Oct 27  │ │
│ Attorney    John Doe, NY #…  │   │ │ [Save ▸ Open]  [Print]    │ │
│ Payment     Flat fee $2,500  │   │ │ Attorney's agreement: —   │ │
│ Accepted    Oct 27, 19:40    │   │ └──────────────────────────┘ │
│ ─────────────────────────── │   │ … existing sign requests …    │
│ ▸ Oct 25  (2 messages)       │   └──────────────────────────────┘
│ ▾ Oct 27  (1 message)        │
│   19:40 · You · Accepted     │   Статусы карточки: «Ждёт вашей
│ ─────────────────────────── │   подписи» / «Ждёт другой стороны» /
│ • This is not a contract     │   «Запечатано». Компактная копия на
│ • The platform is not a      │   обзоре дела (клиент и адвокат).
│   party and does not take    │
│   part in payment            │
│ • By signing I confirm this  │
│   record of the negotiation  │
│   is accurate                │
│ ┌──────────────────────────┐ │
│ │   [signature pad] clear  │ │
│ └──────────────────────────┘ │
│ [   Confirm  (grey→accent) ] │
│        Decline               │
└──────────────────────────────┘
```

- Экран: `features/deals/deal_record_screen.dart`, маршрут `/deal-record/:id`.
  Тексты трёх фраз — ключи `deal_record.consent.*` (85 языков, редактируются в
  админке «Тексты» со сбросом к встроенному). Если у клиента нет фамилии —
  один раз спрашиваем полное имя перед подписью (поле `name`).
- Кнопка «Принять» в деталях ставки: при `deal_record.enabled` →
  `POST /deal-records` → экран записи; иначе — как сегодня.
- Карточка `DealRecordCard` в `SigningTab` (сверху) и на обзоре
  (`owner_case_screen`, `work_case_screen`). PDF через `FileOpenButton`
  (кэш `case_files/` на устройстве: первый тап «Сохранить», потом «Открыть»).
  «Печать»: на web — открыть PDF во вкладке (печать браузера), на телефоне —
  системный лист (в iOS/Android там есть Print); пакет `printing` не
  добавляем до релиза (нативные зависимости).
- Форма ставки: при `bids.rich_terms_enabled` — блок «Условия оплаты»
  (тип, суммы, график, заметка).

## 8. Админка

Страница `/deal-record` «Запись о сделке» (группа «Система», owner-only):
два переключателя (через `PUT /admin/config/{key}`), таблица текстов по языкам
(`GET/PUT /admin/i18n/texts`, `POST …/reset`): строка «не договор»
(`deal_record.pdf.not_contract`, en), футер (`deal_record.pdf.footer`, en),
три фразы (`deal_record.consent.*`, все языки); кнопка «Предпросмотр PDF».
Версии: каждая правка повышает версию перевода; снимок записи хранит сами
тексты и `text_version` — запечатанные записи текст не меняют.
Инструкция `apps/admin/content/guides/deal-record.md` (что это, стоимость,
как включить, как проверить, что не сделано: Object Lock, печать-пакет).

## 9. Нагрузка и стоимость (на 1 000 записей в день)

- 2 PDF на запись: ~60–150 KB каждый (шрифт-подмножество + 2 PNG ≤150 KB) →
  ≤ 0,3 GB/день, ≈ 9 GB/мес → S3 Standard ≈ $0,21/мес (+$0,005 за 1 000 PUT,
  ~$0,01/день). Через год ≈ 110 GB ≈ $2,5/мес (Glacier IR ещё дешевле).
- Рендер: ~150–300 ms CPU, память до ~60 MB на задачу, concurrency 2 →
  2 000 задач/день ≈ 10 минут CPU; существующий воркер справляется, новых
  контейнеров нет ($0).
- БД: 1 строка `deal_records` (~2–10 KB снимок) + 1 `case_sign_requests` +
  2 `case_signatures` (PNG до 150 KB как bytes — как в Docs-подписании) +
  3–4 строки журнала. ≈ 0,3 GB/мес данных при 1 000/день; индексы малы.
- Запросный путь: `POST /deal-records` — 1 транзакция, 5 коротких запросов;
  `sign` — 1 транзакция (вторая подпись = сегодняшнее принятие ставки + 2
  INSERT). Ничего не рендерится в запросе; скачивание — presigned S3 (ETag /
  Cache-Control отдаёт S3, CDN не нужен).
- Пуши: 2–3 на запись (существующая очередь push).

## 10. Что не входит

S3 Object Lock (отдельный бакет, решение владельца о сроке), пакет печати
`printing`, напоминания/истечение записи (можно «Отказаться» в любой
момент), юридическая проверка текстов (нужен US-юрист перед включением).
