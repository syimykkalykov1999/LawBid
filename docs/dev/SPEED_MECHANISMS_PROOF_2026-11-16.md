# Все механизмы скорости и медиа: версия, включено ли на проде, доказательство — 16–17.11.2026

Приказ владельца 16.11: «Убедись что кэширование, деление по кусочкам, сжатие и загрузка-выгрузка параллельно и тому подобные вещи … все на новых версиях и работают ахуенно».

**Как проверял.**
- Код: `origin/main` @ `21bb8b99f` (16.11). Открытые находки взяты из `DETECTIVE_SPEED_MEDIA_2026-11-16.md`, `DETECTIVE_R2-web-speed_2026-11-14.md`, `MEDIA_PIPELINE_AUDIT_2026-11-13.md`, `SPEED_MATRIX_2026-11-09.md`. То, что они уже доказали и что с тех пор исправлено, только отмечено, а не перепроверялось заново.
- Прод: только чтение. `curl` заголовков `lawbid.dev`, `api.lawbid.dev`, `admin.lawbid.dev`, медиа-CDN `d29guz2byn57ac.cloudfront.net`, `media.lawbid.dev` (R2), 16.11 ≈ 21:00–22:00 по Тихоокеанскому. CloudWatch и CloudFront под профилем `lawbid-monitor` (только чтение). Mac ходит через фильтрующий прокси, поэтому к TTFB добавляется 0,1–0,5 с; сравнения между собой честные.
- Новейшие версии: реестры npm и pub.dev, maven Google, архив Flutter, сайт PgBouncer, 16.11. «Новейшая» = последняя стабильная, вышедшая не меньше 7 дней назад (STRICT_RULES 10).
- Тесты: `scripts/dev/heavy.sh`, `--maxWorkers=2`, только затронутые.

Обозначения: ✅ работает и доказано; ⚠️ работает, но есть остаток; ❌ было выключено или отставало — исправлено в PR из этого обхода; 👤 нужен шаг владельца.

## 1. Кэширование

| Механизм | Где | Версия → новейшая | На проде | Доказательство | PR |
|---|---|---|---|---|---|
| ETag / 304 на ответах API | `common/cache/http-cache.ts`, cheap ETag `cache.cheap_etag_sec=60` | своё на Nest 12.4 | ✅ | `GET /api/v1/config/bootstrap` 15 266 Б br, `ETag W/"boot-226-…"`; повтор с `If-None-Match` → **304, 0 Б**. То же `/i18n/languages`, `/plans`, `/i18n/bundle/ru` (163 КБ → 304, 0 Б) | — |
| Кэш у гостей на CDN-уровне | `Cache-Control: public, max-age=60, stale-while-revalidate=300` | — | ✅ | заголовки bootstrap / plans / languages | — |
| ETag / 304 + диск + «stale-on-error» 8 ч в приложении | `apps/mobile/lib/core/network/http_cache_interceptor.dart` | dio 5.11.1 = 5.11.1 | ✅ (код) | детектив 16.11 A6; на телефоне не мерил | — |
| Локальная копия списков (local-first) | `CachedMessageStore`, `ThreadMemory`, drift | drift 2.35.3 → **2.35.4**, sqlite3 3.9.0 → **3.9.1** | ✅ | `cache.limit_mb.messages=50`, `feed=8` в bootstrap прода | PR Б (версии) |
| Кэш картинок на диске и в памяти | `app_image_cache.dart`, cached_network_image | 4.0.6 → 4.0.7 (11.11, < 7 дней — ждать до 18.11) | ✅ | `cache.limit_mb.images=0` (без потолка) | следующий обход |
| `ImageCache` Flutter в памяти | по умолчанию Flutter 100 МБ / 1000 картинок | — | ⚠️ оставлено | поднимать без замера памяти на слабом Android опасно (OOM); не меняю без замера на телефоне | — |
| Кэш Valkey в API (L1 в процессе + lease `SET NX`) | `common/cache/cached.ts` | ioredis 6.0.0 = 6.0.0; Valkey 9.1.0 = 9.1 | ✅ | живой ElastiCache valkey 9.1.0 (детектив A0) | — |
| Автоконвейер Valkey (`enableAutoPipelining`) | `redis/redis.module.ts`, `REDIS_AUTOPIPELINE` | ioredis 6.0.0 | ⚠️ ВЫКЛ (оставлен) | локально чтения кэша 126,6 → 73,8 мс (×1,7), но с ним e2e `owner-channel-calls` / `owner-crash-reports` красные и в 3–8 раз дольше, без него 4/4 наборов и 27/27 тестов; причина остановки найдена и исправлена (KNOWN_ERRORS 194), вторая — нет | PR А (только защита, не включение) |
| CDN веба: `immutable` для версионных файлов, Origin Shield | `infra/modules/web`, `web-immutable.py` | — | ✅ | `v/<sha>/main.dart.wasm` `public,max-age=31536000,immutable`; движок `v/<engineRevision>/canvaskit/` (меняется только с Flutter); 7 дней: 28 758 запросов, 60 ГБ | — |
| Origin Shield у медиа-CDN | `infra/modules/s3/main.tf` | — | ❌ нет (`OriginShield.Enabled=false` живьём) → код готов | аватар: первый просмотр 0,50 с `Miss`, второй 0,25 с `Hit` | PR А, 👤 apply |
| Кэш-доля медиа-CDN | CloudFront additional metrics | — | ✅ метрики включены | 9–16.11: 26 запросов, CacheHitRate 44 % — трафика почти нет, доля пока ни о чём не говорит | — |
| Кэш админки | react-query 5.107.1 + persist (idb-keyval 6.3.0) | 5.107.1 = 5.107.1 | ✅ | — | — |
| Service worker / офлайн-кэш веба | `coi_sw.js` (изоляция), `firebase-messaging-sw.js` | — | ⚠️ офлайн-кэша нет | Workbox 7.4.1 (MIT) — отдельная задача M, риск обновления версий (детектив Б13) | не в этом обходе |
| R2 для публичных медиа | `media.public_store` | — | ✅ `r2` в bootstrap прода | старые аватары остаются на AWS CDN (ссылка из `/public/directory/attorneys`) | — |

## 2. Деление на куски и докачка

| Механизм | Где | Версия → новейшая | На проде | Доказательство | PR |
|---|---|---|---|---|---|
| S3/R2 multipart, части 8 МиБ, до 8 параллельно | `s3-storage.service.ts`, `upload_queue.dart` | @aws-sdk 3.1164.0 → **3.1165.0** | ✅ `files_multipart: true`, `chat_upload_parallel: true` | флаги в живом bootstrap | PR Б (версии) |
| Докачка после убийства приложения / сети | `uploads_background_parts`, `background_downloader` | 9.6.6 = 9.6.6 | ✅ `true` | живой bootstrap | — |
| Android: загрузка как foreground service | `uploads_android_foreground` | — | ✅ `true` | живой bootstrap | — |
| TUS в Bunny с параллельной склейкой | `core/transfers/tus_upload.dart` | — | ✅ `reels_tus_parallel: true` | живой bootstrap | — |
| Параллельное скачивание кусками (Range) | `core/files/resumable_download.dart` | — | ✅ `downloads_parallel: true` (детектив 16.11 писал «выкл» — уже включено) | медиа-CDN и веб отвечают `206` с `content-range` на `Range: bytes=0-1023` | — |
| Начало видео параллельными блоками | `video_cache_parallel` | — | ✅ `true` | живой bootstrap | — |

## 3. Параллельность и сеть

| Механизм | Где | Версия → новейшая | На проде | Доказательство | PR |
|---|---|---|---|---|---|
| HTTP/2 + QUIC в приложении | Cronet (Android), URLSession (iOS) | cronet_http 1.10.1 = 1.10.1, cupertino_http 3.1.1 = 3.1.1 | ✅ (код) | — | — |
| HTTP/3 на CDN веба и медиа (AWS) | CloudFront `http2and3` | — | ✅ | `alt-svc: h3=":443"` на `lawbid.dev` и `d29guz2byn57ac.cloudfront.net` | — |
| HTTP/3 на `media.lawbid.dev` (Cloudflare R2) | зона Cloudflare | — | ❌ | нет `alt-svc` в ответе Cloudflare | 👤 включить HTTP/3 в Cloudflare |
| HTTP/3 на `api.lawbid.dev` | ALB | — | ⚠️ только HTTP/2 | ALB HTTP/3 не умеет; нужен CloudFront перед API (деньги, terraform) | 👤 решение |
| Подгрузка следующих видео (как TikTok) | `video_prefetch_smart`, `client.video_prefetch_ahead=3` | — | ✅ | живой bootstrap | — |

## 4. Сжатие

| Механизм | Где | Версия → новейшая | На проде | Доказательство | PR |
|---|---|---|---|---|---|
| Brotli/gzip ответов API | `app.setup.ts` `compression` | 1.8.2 = 1.8.2 | ✅ | `content-encoding: br` на bootstrap/plans/i18n | — |
| zstd ответов API | — | `compression` не умеет zstd | ⚠️ | Brotli уже на 15–25 % лучше gzip; zstd браузеры берут только как запасной; не меняю | — |
| Brotli веб-файлов | `web-gzip-big.sh`, CloudFront | — | ✅ | `main.dart.wasm` 3,03 МБ br, `skwasm.wasm` 1,21 МБ br, `NOTICES` gzip 128 КБ (было 1,6 МБ сырьём, R2 #7 закрыт) | — |
| Админка: сжатие | Next 16.4.5 → **16.4.6** (09.11) | — | ⚠️ только gzip, без CDN | `admin.lawbid.dev/login` `content-encoding: gzip` | PR Б (версия); 👤 CDN для админки |
| Урезка веб-шрифтов | #1148 | — | ✅ | текстовые шрифты 300,5 → 254 КБ br | — |
| Фото на сервере: WebP q88 / JPEG mozjpeg q90 | `image-processor.ts`, sharp | sharp 0.35.5 = 0.35.5, libheif-js 1.23.5 = 1.23.5 | ✅ | аватар `image/webp`, 139 КБ | — |
| AVIF-двойники фото (веб) | `images.avif_enabled` | aom 3.15.1 (в sharp) | ❌ был ВЫКЛ → **ВКЛ** для фото с 17.11 | замер #1167: AVIF q75 по SSIM/PSNR равен или лучше WebP q88 при **84 %** байт; аватар прода с `Accept: avif` отдаётся WebP — двойников не было | PR А |
| Цветовой профиль P3, 4:4:4 для документов, прозрачность | `image-processor.ts` | — | ⚠️ открыто | файл правит открытый #1098 (медиа-проверка); чтобы не конфликтовать, не трогаю — следующий PR поверх #1098 | после #1098 |
| Декод-лимит картинки для модерации | `media-moderation.service.ts` | — | ❌ не было → `limitInputPixels` | детектив A1-6; тесты media-moderation зелёные | PR А |
| Видео на телефоне аппаратно | Android Media3 Transformer, iOS AVAssetWriter, веб Mediabunny | Media3 1.9.2 → **1.11.1** (10.09); Mediabunny 1.65.2 → 1.66.0 (13.11, < 7 дней) | ✅ | одно кодирование для Bunny (#1165); API, которые мы зовём, в 1.10–1.11 не удалены (RELEASENOTES Media3) | PR Б (Media3) |
| Превью кадра видео | `video_frames.dart` | — | ✅ | все обложки берут качество фото из `photoLimitsOf` (#1165); 30 только у ленты кадров редактора | — |
| Голосовые | AAC-LC 16 кГц / 32 кбит/с, `record` | record 7.1.2 → 7.2.0 (11.11, < 7 дней) | ✅ | WhatsApp — Opus, частота официально не опубликована; оставлено как есть, меняется в админке (`media.voice_sample_rate_hz`); #1083 (голос для iPhone) открыт | — |

## 5. Потоковое видео

| Механизм | Где | Версия → новейшая | На проде | Доказательство | PR |
|---|---|---|---|---|---|
| HLS с адаптивным битрейтом | Bunny Stream | — | ✅ (код) | `media.bunny_one_encode: true`; публичного видео на проде нет, заголовки Bunny не мерил | — |
| Первый кадр / постер | Bunny `thumbnail.jpg`, blurhash 2.0.5 | — | ✅ | детектив 16.11 | — |
| Range-запросы | CloudFront | — | ✅ | `206 Partial Content` на медиа и вебе | — |

## 6. База и API

| Механизм | Где | Версия → новейшая | На проде | Доказательство | PR |
|---|---|---|---|---|---|
| Пул соединений | Prisma 7.10.1 + adapter-pg, pg 8.23.1 | = новейшие (Prisma 8 только rc) | ✅ | `pg-adapter.ts` (connection_limit → max) | — |
| PgBouncer transaction mode | `infra/pgbouncer` | 1.26.1 = 1.26.1 (14.10.2026, закрыты 3 CVE) | ✅ | #1162 | — |
| Курсорная (keyset) пагинация | сервисы API | — | ✅ | 540 упоминаний `cursor` в сервисах, `skip:` осталось 20 (админка и малые списки) | — |
| Postgres / Valkey | RDS 18.6, ElastiCache valkey 9.1.0 | новейшие | ✅ | живое AWS (детектив A0) | — |
| NestJS | 12.4.0 → **12.4.2** (09.11); 12.5.x моложе 7 дней | | | | PR Б |
| undici | 8.12.3 → **8.12.4** (05.11) | | | | PR Б |
| Flutter | 3.47.9; 3.50.0 вышел 11.11 (< 7 дней, можно с 18.11) | | | | следующий обход |

## Список исправлений

**PR А — сервер + infra (этот PR, ветка `claude/speed-switches-on`).**
- Автоконвейер Valkey НЕ включён (KNOWN_ERRORS 194): в CI и локально с ним падали e2e. В коде осталась защита на случай включения: клоны pub/sub без конвейера (`pubSubClient`), остановка через `quitGracefully()`, `.catch` у брошенного `del`; тесты `redis-autopipeline-quit.spec.ts` и `redis-throttler-storage.autopipeline.spec.ts` (живой Redis).
- `apps/api/src/throttler/redis-throttler-storage.autopipeline.spec.ts` (новый): лимитер на живом Redis с конвейером и без, холодный кэш скриптов, 300 параллельных ударов.
- `app-settings.defaults.ts` + `switch-contract.spec.ts`: `images.avif_enabled: true`, `images.avif_since: 2026-11-17T00:00:00.000Z`.
- `files.public.ts` + `media-moderation.service.ts`: `limitInputPixels` в копии для модерации.
- `infra/modules/s3/main.tf`: `media_origin_shield_region` + блок `origin_shield` (как у веба, #171).
- Проверено 16–17.11 (heavy.sh, 2 воркера, Node 26): unit 25 наборов / 381 тест зелёные (throttler, switch-contract, redis-connection, files/processing, files.service, files/jobs, media-moderation, config); e2e `files`, `owner-case-photos`, `r2-public-store`, `auth-hardening` 4 / 63 зелёные; `tsc` чисто; eslint + prettier на затронутых файлах чисто; `terraform fmt` чисто. Новый спек реально шёл против Redis (ключи `throttle:default:autopipe-*` появились в Redis).
- Перед пушем: commit с хуками, слияние свежего main, повтор затронутых проверок; полные e2e-шарды и two-db, `terraform validate` и `terraform test` — в CI.
- Риск и откат: AVIF — `images.avif_enabled` Выкл в админке, ссылки сразу снова WebP; Origin Shield — `media_origin_shield_region = "off"`.

**PR Б — версии (не начат, только список).** Все вышли ≥ 7 дней назад:
- API: `@nestjs/common|core|platform-express|platform-socket.io|websockets|testing` 12.4.0 → 12.4.2; все `@aws-sdk/*` 3.1164.0 → 3.1165.0; `undici` 8.12.3 → 8.12.4 (`npm install --package-lock-only`, затем unit + e2e).
- Админка: `next` и `eslint-config-next` 16.4.5 → 16.4.6.
- Телефон: `drift` 2.35.3 → 2.35.4, `sqlite3` 3.9.0 → 3.9.1, `connectivity_plus` 7.3.1 → 7.3.2 (`flutter pub upgrade <пакеты>`, build_runner не нужен — drift_dev не меняется); `androidx.media3:*` 1.9.2 → 1.11.1 в `apps/mobile/android/app/build.gradle.kts:178-180`. По RELEASENOTES Media3 ни один из вызываемых API (`Transformer.Builder`, `Composition.Builder.setHdrMode`, `DefaultEncoderFactory`, `VideoEncoderSettings.setBitrate`, `Presentation.createForShortSide`, `FrameDropEffect`) не удалён; 1.11 требует Kotlin ≥ 2.2 — у нас 2.4.21. Компиляцию докажет `flutter build apk --debug` в mobile-ci. Нужен «## Веб» в теле PR (веб: без изменений, кроме drift/sqlite3 в web-воркере).
- С 18.11 (исполнится 7 дней): Flutter 3.50.0, cached_network_image 4.0.7, octo_image 2.1.5, record 7.2.0, mediabunny 1.66.0, NestJS 12.5.x — следующим обходом версий.

**PR В — фото на сервере (после слияния #1098, тот же файл `image-processor.ts`).** WebP `smartSubsample: true` для снимков документов; цветовой профиль P3 (`keepIccProfile`/`withIccProfile('p3')`) и ICC из HEIC. Прозрачность (`flatten`) не трогать без вашего слова: меняется вид PNG-логотипов в тёмной теме.

## Шаги владельца
1. **Cloudflare → lawbid.dev → Speed → Optimization → Protocol Optimization → HTTP/3 (with QUIC): On.** Сейчас `media.lawbid.dev` отдаёт только HTTP/2.
2. **`terraform apply` для `envs/prod`** после слияния PR А: включится Origin Shield у медиа-CDN (≈ $0.0075–0.01 за 10 тыс. запросов к щиту).
3. По желанию: CDN (CloudFront) перед админкой и API — Brotli для админки и HTTP/3 для API. Это деньги и terraform, поэтому только по вашему слову.
4. Телефоны: после следующей сборки проверить запись видео на Android (Media3 1.11.1) — 1 короткое видео в чат.

## Не проверено
- Работа кэшей на самих телефонах (нужна сборка, по правилу — только по слову владельца).
- Заголовки Bunny HLS: на проде нет публичного видео.
- Описание задач ECS: вызов запрещён контролем.

## Источники (16.11.2026)
- npm registry: NestJS 12.4.2 — 09.11.2026, 12.5.1 — 16.11.2026; @aws-sdk/client-s3 3.1165.0 — 09.11.2026; undici 8.12.4 — 05.11.2026; next 16.4.6 — 09.11.2026; mediabunny 1.66.0 — 13.11.2026; bullmq 6.7.x — 07–17.11.2026.
- pub.dev: drift 2.35.4 — 08.11.2026; sqlite3 3.9.1 — 08.11.2026; connectivity_plus 7.3.2 — 01.10.2026; cached_network_image 4.0.7 — 11.11.2026; record 7.2.0 — 11.11.2026.
- Media3 RELEASENOTES: 1.11.1 — 10.09.2026, 1.11.0 — 05.08.2026, 1.10.0 — 25.03.2026 (https://github.com/androidx/media/blob/release/RELEASENOTES.md).
- Flutter releases: 3.50.0 stable — 11.11.2026, 3.47.9 — 29.10.2026 (https://docs.flutter.dev/install/archive).
- PgBouncer 1.26.1 — 14.10.2026 (https://www.pgbouncer.org/changelog.html).
- ioredis auto-pipelining: https://github.com/redis/ioredis#autopipelining.
- WhatsApp Business Platform, голосовые — Ogg/Opus: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/audio-messages.
