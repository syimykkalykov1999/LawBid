# Сверка списка владельца с main (15.11.2026)

Источник: все 45 строк с ⏳ в `docs/dev/OWNER_LIST_2026-11-11.md` (локальный файл в основной папке, в `origin/main` его нет).
Проверено по `origin/main` 785e6133f (15.11), `gh pr list --state merged/open` (LawBid и LawBidSite) и коду. Код не менялся, сборок и тестов не запускалось.

Статусы:
- **DONE**: все части строки есть на main. Это значит «на main, проверить на проде». Проверка прода — работа бригадира.
- **PARTIAL**: часть есть на main, остальное указано (и открытый PR, если он есть).
- **OPEN**: на main ничего нет (есть только открытый PR или вообще ничего).
- **OWNER STEP**: нужен владелец (телефоны, консоли магазинов, Cloudflare, terraform и т. п.).

Итого: **DONE 17 · PARTIAL 13 · OPEN 8 · OWNER STEP 7** (всего 45).

| Строка | Статус | Доказательство (PR, файл:строка на main) | Что осталось |
|---|---|---|---|
| 14 | OWNER STEP | — | Одна сборка на телефоны в самом конце, по слову владельца |
| 36 | OWNER STEP | код #838, #862; тест-таблица всех ситуаций в открытом #1079 | Проверка звонков на телефонах после сборки; влить #1079 |
| 41 | OWNER STEP | #862 | Проверка на Samsung после сборки |
| 46 | OWNER STEP | — | Шаги владельца в конце (App Check, ключи, почта, защита main, Sentry DSN, Play Data safety, юр. вопросы, Apple на LLC) |
| 59 | PARTIAL | #1024: план и скрипты боевого теста AWS | Сам прогон (~$50) не сделан |
| 85 | DONE | #1022, #1064, #1121; `apps/api/src/modules/admin-launch/infra/infra-auto.logic.ts:149` (копии БД под «Авто») | На main, проверить на проде, что пустой сервер базы уходит сам |
| 89 | PARTIAL | `apps/mobile/lib/features/chat/presentation/reply_swipe.dart:19` (свайп на внутренностях Flutter, пружина, порог 56 dp, #1023) | Открытый #1066 пишет, что менять не нужно (swipe_to 1.0.6 хуже). Нужно решение бригадира и проверка на телефоне |
| 90 | DONE | #1023: `reply_swipe.dart:61-63` (`_release(replied:)`, флаг `_fired` сбрасывается каждый раз) | На main, проверить на телефоне. Тест `reply_cancel_tap_test.dart` в открытом #1066 |
| 96 | PARTIAL | #1037 (пачка 1), #1059, #1061, #1074 | Постоянная работа без конца, строка не закрывается |
| 97 | PARTIAL | #1038, #1043, #1046, #1051 | Открыт #1098 (нет GPS в стикерах/XMP, битрейт видео на сайте, заголовки экспорта) |
| 107 | OWNER STEP | — | Cloudflare: не кэшировать 404, ключ CDN для приватных файлов, заголовки кэша старых стикеров/аватаров |
| 109 | DONE | #1061: `apps/mobile/lib/core/design_system/widgets/feedback/app_leave_sheet.dart:11` (лист «Сохранить черновик?»), `app_confirm_sheet.dart`, `features/chat/presentation/chat_undo.dart` | На main, проверить на проде |
| 110 | OPEN | — | Открыты #1066 (поиск в чате, «Ожидание сети», отметить непрочитанным, срок «без звука», фильтр) и #1072 («Поделиться», поиск участников, Enter на сайте) |
| 111 | DONE | #1059: `apps/mobile/lib/core/design_system/theme/app_color_tokens.dart:252` (`goldText`, 5,74:1), `apps/mobile/lib/app.dart:108` (FullTextScale, текст до 2.0× и больше), цели 48 pt, `semanticLabel` у `ProgressivePhoto` | На main, проверить на проде |
| 112 | DONE | #1061: `apps/api/prisma/schema.prisma:1804` (время ответа адвоката), `features/profile/presentation/screens/attorney_profile_edit_screen.dart` (заполненность), закреплённая панель, «Не интересно» | На main, проверить на проде |
| 113 | DONE | #1074: `apps/mobile/lib/core/platform/web_tab_title.dart`, `web_favicon_badge_web.dart` (счётчик во вкладке); #1059: выделение текста и правый клик | На main, проверить на сайте |
| 116 | PARTIAL | #1081: `.fvmrc` (Flutter 3.47.9), `apps/mobile/android/settings.gradle.kts:22-23` (AGP 9.5.1, Kotlin 2.4.21), `gradle-wrapper.properties:5` (Gradle 9.9.0) | `scripts/ci/select-xcode.sh:13` всё ещё `MIN=26`, Xcode/SDK iOS 27 не требуется. Проверить, закрывает ли это открытый #1103 |
| 117 | PARTIAL | #1105: `.github/workflows/infra-validate.yml:24` (Terraform 1.17.1), `infra/envs/prod/main.tf:7` (AWS 6.72) | `infra/modules/monitoring/journey.tf:310` всё ещё `nodejs22.x` → 24.x. Применение — владелец/бригадир |
| 118 | PARTIAL | #1087 (local_auth 3), #1085 (go_router 18), #1095 (flutter_secure_storage 11); `apps/mobile/pubspec.yaml:35,61,72` | `sentry_flutter ^10.1.0` (:134), `flutter_local_notifications ^22.3.2` (:159), ML Kit 0.15 (:176-184), `android_play_install_referrer` (:148) и alchemist не заменены. Открыт #1103 |
| 119 | OPEN | — | В админке `@sentry/browser ^10.76.2`, `jsdom ^30.1.3`, `typescript ^5.7.2`, `@types/node ^22` (`apps/admin/package.json:22,48,54,57`), `lint-staged ^15` (`package.json:27`). Открыт #1078 |
| 120 | OPEN | — | `docker-compose.yml:53` mailhog, `apps/api/package.json:116` pdf-lib, `:165` ts-node. Открыт #1091 |
| 121 | DONE | #1126 (PostgreSQL 16 → 18 через Blue/Green, Redis → Valkey 9.1), #1112; `infra/envs/prod/variables.tf:101-104` (`redis_engine = "valkey"`) | На main. Применение и проверка прода — бригадир/владелец (окно в воскресенье) |
| 122 | DONE | LawBidSite#34: `.nvmrc` 26.13.1, `package.json:42-43` (`engines.node >=26`), Dependabot #2–#6 и #30 сложены в #34 и закрыты | На main LawBidSite, проверить на проде |
| 123 | PARTIAL | API на Sentry 11: `apps/api/package.json:91` (`@sentry/nestjs ^11.11.0`) | Админка всё ещё на `@sentry/browser ^10.76.2` (`apps/admin/package.json:22`). Открыт #1078 |
| 124 | OPEN | — | `infra/modules/alb/main.tf:227-230`: проверка сознательно оставлена на `/health/live` (сбой базы на /health/ready погасил бы все задачи). «Умного» распределения (anomaly mitigation) нет. Кэша страниц LawBidSite (s-maxage, stale-while-revalidate) нет. Нужно решение и terraform (владелец) |
| 126 | OPEN | — | Открыт #1084 (хвост ленты через диапазон индекса). Замер входа в админку не найден |
| 128 | PARTIAL | #1059: IntrinsicHeight убран из 4 из 5 строк; шрифты сайта 546 → 300 КБ (brotli) | Карточка контакта в чате оставлена с IntrinsicHeight (без него ломаются равные кнопки). Цель ~170 КБ не достигнута: иначе пришлось бы резать языки. Решение бригадира |
| 129 | OWNER STEP | #1034 | В Play Console указать типы фоновой работы mediaProcessing и dataSync |
| 146 | OPEN | — | Открыт #1083 (AAC/M4A-копия голосовых WebM с сайта) |
| 147 | DONE | LawBidSite#34: проверка Pages только вручную (`workflow_dispatch`), Node 26, 6 Dependabot сложены и закрыты | На main LawBidSite, проверить, что Pages больше не краснеет |
| 148 | DONE | #1085: `apps/mobile/pubspec.yaml:35` (`go_router: 18.1.3`, те же страницы, back и heroes) | На main, проверить на телефоне |
| 149 | DONE | #1095: `apps/mobile/pubspec.yaml:61` (`flutter_secure_storage: ^11.2.0`, вход на Android сохраняется) | На main, проверить на Android-телефоне |
| 150 | OPEN | — | Открыт #1084 (GrowthBook hash v2, `hash_version`); на main `hash_version` нет |
| 157 | OWNER STEP | — | Опубликовать в админке соглашения, EULA, возвраты, cookies, SMS, доступность |
| 170 | DONE | #1071: `.github/workflows/web-deploy.yml:20-21,304-352` (движок один раз на ревизию движка), `scripts/deploy/web-gzip-big.sh` (gzip), `apps/mobile/web/flutter_bootstrap.js:5` (без старого шага service worker) | На main, проверить на проде |
| 171 | PARTIAL | #1082: генератор карты сайта; `infra/modules/web/main.tf:156-160,549-553` (Origin Shield, по умолчанию включён) | 301 `/clients` → `/clients/` не работает на проде (`ignore_changes` у функции CloudFront): открыт #1137. Затем infra apply (владелец, 2FA) |
| 172 | DONE | LawBidSite#34: LazyMotion + Lenis по запросу; `package.json:21,23,24,34` (lenis 1.3.27, motion 14.10.1, next 16.4.5, eslint 10.14.0) | На main LawBidSite, проверить на проде |
| 173 | OPEN | — | Открыт #1089 (COOP/COEP за переключателем `web.cross_origin_isolation`); на main переключателя нет |
| 174 | DONE | #1082: `apps/mobile/web/index.html:46-48` (canonical, Organization, WebSite), `apps/admin/package.json:25` (react-query 5.107.1); KE про /users закрыта (`docs/dev/KNOWN_ERRORS.md:46`, TBT 126 мс) | На main, проверить на проде. Открытый #1141 только доводка (Organization → /about/) |
| 176 | DONE | #1063: `apps/api/src/common/pnl/pnl.service.ts:93` (возвраты в день возврата); #1136 (возвраты из Stripe, убыток −$X); комиссия Stripe из настроек `app-settings.defaults.ts:1694-1695`, `economy.service.ts:387` | На main, проверить на проде |
| 177 | DONE | #1063: `apps/api/src/modules/case-payments/case-payments.service.ts:1763` (`FOR UPDATE`); #1138: `:1036` (ключ идемпотентности), `apps/admin/src/app/(app)/case-payments/page.tsx:88` (вкладка в адресе) | На main, проверить на проде |
| 178 | DONE | #1063: `apps/api/src/common/subscription-metrics.ts:41` (один месячный доход); #1062: `apps/admin/src/app/(app)/payments/page.tsx:429` («Вернуть деньги»), `treasury/page.tsx:268,302` («Поделить сейчас», удаление расхода); #1140 тесты | На main, проверить на проде |
| 179 | PARTIAL | #1076: `apps/admin/src/app/(app)/config/page.tsx:1596` (409, сохранения не затираются), `apps/admin/src/lib/bulk.ts:15` (предел «выбрать все» из настройки), `query-client.ts:160` (обновление при возврате на вкладку) | Открыт #1092: «выбрать все» по фильтру на сервере, CSV по деньгам с фильтрами (B6, B7) |
| 180 | PARTIAL | #1076: `apps/api/src/common/app-settings/app-settings.defaults.ts:946` (`admin.step_up_ttl_seconds`, только владелец), `:950` (`admin.report_timezone`) | Открыты #1143 (дни «Прибыли» по часовому поясу отчёта) и #1092 (сдельная оплата и аномалии по поясу, B9) |
| 181 | PARTIAL | #1077: остановка при потере блокировки, пределы времени задач, частая тяжёлая очередь | Открыты #1088 (индексы и чистка сессий), #1075 (темп чистки, просмотры не обнуляются), #1146 (параллельность очередей из админки). `bullmq ^6.7.2` (`apps/api/package.json:99`) не обновлён |

## OPEN и PARTIAL коротко
- OPEN: 110 (чаты, пачка 3: #1066, #1072), 119 (версии админки: #1078), 120 (MinIO/mailhog/pdf-lib/ts-node: #1091), 124 (балансировщик и кэш LawBidSite: решения нет), 126 (вход админки и хвост ленты: #1084), 146 (голосовые WebM → AAC: #1083), 150 (хэш v2: #1084), 173 (COOP/COEP: #1089).
- PARTIAL: 59 (прогон AWS), 89 (решение по свайпу, #1066), 96 (работа без конца), 97 (#1098), 116 (Xcode 27), 117 (Lambda nodejs24), 118 (#1103), 123 (Sentry 11 в админке, #1078), 128 (5-я строка и 170 КБ сознательно не сделаны), 171 (#1137 + apply), 179 (#1092), 180 (#1143, #1092), 181 (#1088, #1075, #1146, bullmq).
