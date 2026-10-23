# Passkeys (WebAuthn) — ключи доступа

> **Для владельца:** ключ доступа — это вход по Face ID / Touch ID / Windows
> Hello или аппаратному ключу вместо кода из SMS (в приложении) или кода из
> приложения-аутентификатора (в админке). SMS, письма, пароли и recovery-коды
> продолжают работать; ключ — дополнительная возможность. Отключить вход по
> ключу в приложении: админка → Флаги → `passkey_login`.

Сервер: `apps/api/src/modules/auth/passkeys/` на `@simplewebauthn/server`
(таблица `webauthn_credentials`, миграция `20261023100000`). Один ключ
хранится один раз; `scope` = `user` (приложение) или `admin` (панель).

## Relying party

- RP ID: хост `APP_LINK_BASE_URL` → `lawbid.dev` (можно переопределить
  `WEBAUTHN_RP_ID`). Он же покрывает `admin.lawbid.dev` и оба нативных
  приложения.
- Origins: `web.allowed_origins` (настройка в админке), `ADMIN_ORIGINS`,
  `https://<rpId>` (так представляется iOS), плюс `WEBAUTHN_ORIGINS` —
  список через запятую, сюда Android: `android:apk-key-hash:<base64url
  sha256 сертификата подписи>` (для каждого ключа подписи: debug, upload,
  Play App Signing). Вне production принимается любой `http://localhost:<порт>`.
- iOS: в `/.well-known/apple-app-site-association` теперь есть
  `webcredentials` (scripts/seo/well-known.mjs публикует его вместе с
  `applinks`); в приложении нужен entitlement
  `com.apple.developer.associated-domains` со строкой
  `webcredentials:lawbid.dev` (рядом с `applinks:`).
- Android: `assetlinks.json` уже содержит `delegate_permission/common.handle_all_urls`;
  для passkeys Credential Manager требует ещё
  `delegate_permission/common.get_login_creds` — добавляется мобильным
  работником в `scripts/seo/well-known.mjs` (relation list) вместе с
  SHA-256 ключей подписи в `ANDROID_APP_SHA256`.

## API для приложения (все ответы в конверте `{data}`)

Форматы `options` / `response` — стандартные WebAuthn JSON
(`PublicKeyCredential*OptionsJSON`, `RegistrationResponseJSON`,
`AuthenticationResponseJSON`); на Flutter их отдают пакеты `passkeys`
(iOS/Android/web, Corbado) или `credential_manager` (Android) — передавать как есть.

| Шаг | Запрос | Ответ |
|---|---|---|
| Добавить ключ, шаг 1 | `POST /auth/passkeys/register/options` (bearer; нужен свежий вход ≤10 мин или заголовок `X-Reauth-Token`) | `{options}` → `navigator.credentials.create` |
| Добавить ключ, шаг 2 | `POST /auth/passkeys/register` `{response, name?}` | `PasskeyDto` (201) |
| Список | `GET /auth/passkeys` | `{passkeys: PasskeyDto[]}` |
| Удалить | `DELETE /auth/passkeys/{id}` (свежий вход или `X-Reauth-Token`) | `{removed: true}` |
| Вход, шаг 1 | `POST /auth/passkeys/login/options` `{deviceInfo?}` (публичный, 120/час с IP) | `{challengeId, options}` (без `allowCredentials` — устройство само предлагает аккаунты) |
| Вход, шаг 2 | `POST /auth/passkeys/login` `{challengeId, response, deviceInfo}` (+ заголовки `X-Device-Id`, `X-Device-Key`, на вебе `X-LawBid-Web-Session: 1`) | `AuthTokensDto` (201) — как у `otp/verify`; правило «один телефон + один веб» действует |
| Подтверждение действия, шаг 1 | `POST /auth/passkeys/reauth/options` (bearer) | `{challengeId, options}` (только ключи этого аккаунта) |
| Подтверждение действия, шаг 2 | `POST /auth/passkeys/reauth` `{challengeId, response}` | `ReauthTokenDto` `{reauthToken}` — как у `POST /auth/reauth`, одноразовый, 5 минут |

Ошибки: `PASSKEY_INVALID` (401: протух challenge — 5 минут, одноразовый;
чужой ключ; неверный origin/RP; подпись или счётчик), `PASSKEY_NOT_FOUND`
(404), `PASSKEY_LIMIT` (409, не более 10 ключей), `AUTH_PROVIDER_DISABLED`
(403, флаг `passkey_login` выключен), `REAUTH_REQUIRED` (403).

Журнал: `auth_events` получают `passkey_added`, `passkey_removed`,
`passkey_login_success`, `passkey_login_failed`, `reauth_success/failed`
с `meta.method = passkey`.

### Что делает мобильный работник

1. Экран «Безопасность» → раздел «Ключи доступа»: список, «Добавить»
   (register/options → create → register), «Удалить».
2. Экран входа: кнопка «Войти с ключом доступа» (показывать, когда флаг
   `passkey_login` включён и платформа поддерживает) — login/options → get →
   login.
3. Где сейчас просят код для подтверждения (`POST /auth/reauth`), предлагать
   «Подтвердить ключом» — reauth/options → get → reauth → тот же
   `X-Reauth-Token`.
4. iOS entitlement `webcredentials:lawbid.dev`; Android — relation
   `get_login_creds` и hash ключей подписи в `WEBAUTHN_ORIGINS` (см. выше).
5. Тексты — через `scripts/i18n-add.mjs` (85 языков).

## Админка

- Вход: после пароля сервер отвечает `passkeyAvailable: true`, если у админа
  есть ключ; панель показывает «Войти с ключом доступа»
  (`/admin/auth/login/passkey/options` → `/admin/auth/login/passkey`).
  Аутентификатор по-прежнему обязателен при первом входе (из него же
  recovery-коды); ключ — альтернатива коду на втором шаге.
- Step-up: «Подтвердить ключом доступа» (`/admin/auth/step-up/passkey/options`
  → `/admin/auth/step-up/passkey`), тот же срок 5 минут, каждая попытка в
  журнале действий (`admin.step_up` с `method: passkey`).
- Управление: Профиль → «Ключи доступа» (`GET/POST/DELETE /admin/auth/passkeys`,
  добавление и удаление — после step-up). Сброс аутентификатора админу
  (`resetTotp`) ключи не трогает.

## Тесты

- `apps/api/test/passkeys.e2e-spec.ts` — программный аутентификатор
  (`test/support/webauthn-authenticator.ts`, P-256, attestation `none`)
  проходит все сценарии приложения и админки.
- `apps/api/src/modules/auth/passkeys/webauthn-config.spec.ts` — RP ID и origins.
