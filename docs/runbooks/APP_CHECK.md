# Firebase App Check: «запрос пришёл из нашего приложения»

Security research #5 (2026-10-22), пункты A4 (сервер) и B1 (приложение).
Зачем: без этого сервер не отличает наше приложение от скрипта с теми же
публичными ключами — это главная дверь для SMS-pumping (боты просят коды
на дорогие номера, мы платим Twilio).

## Как устроено

1. Приложение при старте включает `firebase_app_check` (iOS — App Attest с
   DeviceCheck как запасным, Android — Play Integrity, web — reCAPTCHA
   Enterprise). SDK получает у Firebase короткоживущий токен и сам его
   обновляет.
2. На дорогие анонимные запросы приложение ставит заголовок
   **`X-Firebase-AppCheck: <токен>`**:
   - `POST /api/v1/auth/otp/request` (код входа; для `channel: email`
     заголовок не обязателен — письмо ничего не стоит),
   - `POST /api/v1/auth/password/reset/request` (код по SMS),
   - `POST /api/v1/auth/social` (вход через Google / Apple),
   - `POST /api/v1/auth/phone/status` («есть ли такой номер»).
   Остальные запросы заголовок не смотрят. Запрос с действующим access
   token (вошедший пользователь просит код на свой же номер) проверку
   не проходит — он уже свой.
3. Сервер (`apps/api/src/modules/auth/app-check/`) проверяет токен
   официальным Admin SDK (`firebase-admin/app-check`, `verifyToken`:
   подпись ключами Firebase, издатель, наш проект, срок). Project id
   берётся из уже настроенных ключей FCM (Админка → Интеграции →
   Firebase Cloud Messaging) — ничего нового вводить не нужно.
4. Что делать с запросом без токена, решает настройка
   **`security.app_check.mode`** (Админка → Система → Настройки):
   | режим | что происходит |
   |---|---|
   | `off` | ничего не проверяется |
   | `monitor` (по умолчанию) | вердикт каждого запроса пишется в журнал (`metric: app_check`, `verdict: valid / invalid / missing / unconfigured`, `appId`, `route`), никто не блокируется |
   | `enforce` | без действующего токена — `403 DEVICE_ATTESTATION_REQUIRED` (кроме кода на e-mail). Если ключи FCM пустые, проверять нечем — запрос пропускается, в журнале `error` |

## Порядок включения (владелец)

1. Firebase Console → App Check → зарегистрировать приложения (App Attest
   для iOS, Play Integrity для Android, reCAPTCHA Enterprise для web) —
   чек-лист в `docs/SECURITY_TODO.md` («Firebase keys and App Check»).
2. Выпустить приложение с заголовком (B1). Сервер пока в `monitor`.
3. Через неделю посмотреть в CloudWatch Logs Insights:
   ```
   filter metric = "app_check" | stats count(*) by verdict, route
   ```
   Доля `missing` должна упасть почти до нуля (остаются старые сборки и
   web без reCAPTCHA). `invalid` в заметном количестве — значит, не тот
   проект Firebase в ключах FCM или неправильно зарегистрировано
   приложение.
4. Переключить `security.app_check.mode` на `enforce`. Откат — вернуть
   `monitor`, релиз не нужен.

## Проверка руками

- `curl -X POST https://api.lawbid.dev/api/v1/auth/otp/request -d '{"channel":"phone","identifier":"+1415…"}'`
  без заголовка: в `monitor` — `200`, строка `verdict: missing` в журнале;
  в `enforce` — `403 DEVICE_ATTESTATION_REQUIRED`.
- Тесты: `apps/api/src/modules/auth/app-check/app-check.guard.spec.ts`,
  `apps/api/test/app-check.e2e-spec.ts`.

## Приложение (B1, 2026-10-22)

Код: `apps/mobile/lib/core/security/app_check.dart` (запуск при старте,
`core/config/run_app.dart`) и `core/network/app_check_interceptor.dart`
(заголовок только на четырёх маршрутах выше). Пакет —
`firebase_app_check` (официальный FlutterFire, версия в `pubspec.yaml`
совместима с закреплённым `firebase_core`).

- Провайдеры: Android — Play Integrity; iPhone — App Attest с DeviceCheck
  как запасным; web — reCAPTCHA Enterprise (ключ сайта передаётся в сборку
  как `--dart-define=FIREBASE_WEB_RECAPTCHA_KEY=…`, в CI — секрет
  `FIREBASE_WEB_RECAPTCHA_KEY`; без него web не шлёт токен).
- Сборка без файлов Firebase (dev / staging на Android, dev на iPhone без
  `GoogleService-Info.plist`) просто пишет в лог `app check: off` — вход
  работает, заголовка нет. В режиме `enforce` такая сборка получит
  `403 DEVICE_ATTESTATION_REQUIRED` (текст «обновите приложение»); после
  него следующий запрос берёт у SDK свежий токен.
- Токена ждём не дольше 5 с — потом запрос уходит без него.
- Тесты: `apps/mobile/test/core/network/app_check_interceptor_test.dart`.

### Эмуляторы и симуляторы: debug-токены

Play Integrity и App Attest на эмуляторе не работают. Для dev-сборок
включён debug-провайдер: `config/dev.json` → `"APP_CHECK_DEBUG": "true"`
(см. `config/dev.example.json`). При первом запуске SDK печатает в консоль
строку вида `Firebase App Check debug token: 1234…`. Её надо один раз
зарегистрировать: Firebase Console → App Check → приложение → ⋮ → «Manage
debug tokens» → «Add debug token». Чтобы токен не менялся при переустановке,
его можно задать явно: `"APP_CHECK_DEBUG_TOKEN": "<тот же токен>"`.
Web в dev: тот же флаг включает `WebDebugProvider` (токен печатается в
консоли браузера). В staging/prod `APP_CHECK_DEBUG` не задавать.

### Что сделать владельцу (один раз)

1. Firebase Console → App Check → Apps → зарегистрировать:
   - iOS (`com.lawbid.lawbid`): App Attest. В Apple Developer → Identifiers →
     App ID → включить capability **App Attest**; в Xcode → Runner →
     Signing & Capabilities → «+ Capability» → App Attest (в
     `Runner.entitlements` появится
     `com.apple.developer.devicecheck.appattest-environment` =
     `development`; для App Store Xcode сам ставит `production`).
     DeviceCheck работает без настроек (ключ не нужен — Firebase проверяет
     через свой сервисный аккаунт).
   - Android (`com.lawbid.lawbid`): Play Integrity. Нужны SHA-256
     отпечатки подписи: ключа загрузки (`keytool -list -v -keystore
     <upload.jks>`) и **ключа подписи Google Play** (Play Console →
     Настройка → Целостность приложения → «Сертификат ключа подписи
     приложения» → SHA-256) — оба в Firebase → Project settings → Android
     app → Add fingerprint. Приложение должно быть связано с Play
     (Play Console → App integrity → Link to a Cloud project — тот же
     проект, что у Firebase).
   - Web: reCAPTCHA Enterprise → создать ключ сайта для домена
     `lawbid.app` (и dev-доменов) в Google Cloud → reCAPTCHA Enterprise;
     его id положить в секрет GitHub `FIREBASE_WEB_RECAPTCHA_KEY`.
2. Собрать приложение: `cd apps/mobile/ios && pod install` (новый pod
   `FirebaseAppCheck` придёт с `firebase_core`), затем обычные `flutter
   build`. Android ничего дополнительно не требует (`google-services.json`
   уже на месте для prod).
3. Сервер оставить в `monitor`, через неделю смотреть журнал (выше) и
   переключать на `enforce`.

## График перехода на enforce (решение 2026-10-24)

Мобильное приложение защищает только App Check; Turnstile для него не
используется (у Cloudflare нет нативного SDK для iOS/Android, WebView
ненадёжен). Сейчас `security.app_check.mode` = `monitor` и остаётся им до
выполнения всех условий:

1. Подписанные сборки с заголовком `X-Firebase-AppCheck` вышли в сторы
   (iOS App Attest, Android Play Integrity). Квота Play Integrity
   Standard по умолчанию 10 000 запросов в сутки, поднимается по заявке
   после публикации в Google Play (Firebase docs, 2026).
2. Неделя наблюдения (запрос выше): доля `missing` около нуля, `invalid`
   нет.
3. Тогда `enforce`. Код по e-mail остаётся бесплатным (`freeWhen`), SMS
   идёт только из приложения. Откат — `monitor`, без релиза.

До этого дня SMS защищают: правило WAF `otp-rate-per-ip`, лимиты на номер
и на сутки, скорость по префиксу номера и суточный потолок SMS на
регистрацию (см. ниже).

## Cloudflare Turnstile на сайте (2026-10-24)

Только web (Flutter web). Включение:

1. Cloudflare → Turnstile → создать виджет, домены сайта.
2. Админка → Интеграции → «Cloudflare Turnstile»: секретный ключ,
   ключ сайта, домены (кнопка «Проверить» отправляет пробный запрос в
   `siteverify`).
3. Сайт шлёт токен виджета в заголовке `X-Turnstile-Token` на те же
   маршруты, что и App Check (код по SMS/e-mail, сброс пароля, соцвход,
   `phone/status`).
4. `security.turnstile.mode`: `off` (по умолчанию) → `monitor`
   (проверяет и пишет `metric = "turnstile"`, не блокирует) → `enforce`
   (неверный токен: 403 `TURNSTILE_FAILED`; верный пропускает без App
   Check). Откат — `off`, без релиза.

Если Cloudflare не ответил за 5 секунд или ключ не принят, сайт не
блокируется (в лог пишется error). Токен живёт 5 минут и принимается
один раз; максимум 2048 символов (Cloudflare, 2026-10-22).

## SMS: скорость по префиксу и суточный потолок (2026-10-24)

Настройки в Система → Настройки: `sms.prefix_velocity_max` (8 кодов за
окно на один префикс из первых 6 цифр номера), `sms.country_velocity_max`
(100 на страну), `sms.prefix_velocity_window_minutes` (10),
`sms.prefix_block_minutes` (60), `sms.signup_daily_cap` (300 в сутки UTC на
регистрацию). Сработавший префикс блокируется, SMS не уходит, человек
видит обычный ответ «код отправлен», в логе `alert = cost_budget`,
`stage = sms_prefix_velocity` (существующий аварийный сигнал). Потолок на
регистрацию закрывает регистрацию по SMS до 00:00 UTC (503
`PROVIDER_BUDGET_EXCEEDED`), сброс пароля и e-mail работают. В Twilio
Console дополнительно поставьте Messaging Geo Permissions только на
нужные страны (без кода).

## Website Turnstile widget (batch D, 2026-10-24)

The Flutter web build asks Cloudflare Turnstile for a token (invisible, `interaction-only`: the box shows only if a person must click) before `/auth/otp/request`, `/auth/password/reset/request`, `/auth/social`, `/auth/phone/status` and sends it as `X-Turnstile-Token`. The public site key comes in `GET /config/bootstrap` -> `app_config["turnstile.site_key"]`, published only while `security.turnstile.mode` is `monitor` or `enforce` and a site key is saved (Интеграции -> Cloudflare Turnstile). With the mode `off` or no key the page loads nothing from Cloudflare. Phones never run this code (conditional import). The web CSP (infra/modules/web) allows `https://challenges.cloudflare.com` for scripts and frames: **apply the web module (terraform) before switching the mode on**, else the browser blocks the widget.
