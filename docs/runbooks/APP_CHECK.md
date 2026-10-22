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
