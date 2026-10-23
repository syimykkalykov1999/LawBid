# Вход на сайт по QR-коду (как WhatsApp Web / Telegram)

> **Для владельца:** на сайте показывается QR-код, телефон с приложением его
> сканирует и подтверждает — сайт входит в тот же аккаунт. Ничего настраивать
> не нужно; выключатель веб-входа — флаг `web_client`.

Сервер: `apps/api/src/modules/auth/services/qr-login.service.ts` (REST),
`apps/api/src/modules/realtime/qr-login.gateway.ts` (socket). Код живёт в
Redis 120 секунд (`auth:qr:<nonce>`), одноразовый.

## Точный формат ссылки в QR-коде

```
https://lawbid.dev/q/<nonce>
```

- `<nonce>` — 22 символа base64url (`[A-Za-z0-9_-]`, 16 случайных байт);
  это `qrId` из `POST /auth/qr`.
- Хост берётся из `APP_LINK_BASE_URL` (prod: `https://lawbid.dev`).
- Путь `/q/*` уже есть в `apple-app-site-association` (applinks),
  `assetlinks.json` и `AndroidManifest.xml` (`pathPrefix /q/`), так что
  камера телефона открывает приложение, а не браузер. В приложении этот
  путь ведёт на экран подтверждения (`web_login_link_screen.dart`,
  маршрут `/q/:id`); в браузере — на страницу «откройте в приложении»
  (Flutter-веб, тот же маршрут).
- Секрет для получения токенов (`pollSecret`) в QR **не** входит — он
  известен только браузеру, который код запросил.

Почему `/q/`, а не `/qr/`: путь `/q/*` уже заявлен во всех трёх
конфигурациях app links и в приложении; `/qr/scan` занят экраном сканера.
Менять формат — значит переиздавать well-known файлы и ждать переиндексации
на устройствах, выгоды нет.

## Поток

| Шаг | Кто | Запрос |
|---|---|---|
| 1. Код | сайт | `POST /auth/qr` `{deviceInfo?}` → `{qrId, pollSecret, qrUrl, expiresIn: 120}` |
| 2. Ожидание | сайт | socket `/qr` (ниже) — и/или `POST /auth/qr/poll` `{qrId, pollSecret}` раз в 10 с как запасной путь |
| 3. Скан | телефон | камера → `https://lawbid.dev/q/<nonce>` → приложение → `GET /auth/qr/<nonce>` (bearer телефона): показывает «Chrome · Windows, IP 203.0.113.x»; код переходит в `scanned`; сайт получает `auth:qr_scanned` |
| 4. Ответ | телефон | `POST /auth/qr/<nonce>/approve` или `/reject` (только телефон, который сканировал; сессия с `platform=web` отвергается) → сайт получает `auth:qr_approved` / `auth:qr_rejected` |
| 5. Токены | сайт | `POST /auth/qr/poll` `{qrId, pollSecret}` → `status: approved` + `accessToken/refreshToken` (один раз; потом `expired`). На вебе с заголовком `X-LawBid-Web-Session: 1` refresh уходит в httpOnly-cookie |

Лимиты: создание 120/час с IP, poll 7200/час с IP и 300/час на код, скан и
ответ 60/час на пользователя, socket 300 подключений/час с IP.

## Socket `/qr` (owner 2026-10-22, чеклист §1)

Отдельный namespace без входа. Подключение:

```js
io('https://api.lawbid.dev/qr', { auth: { qrId }, transports: ['websocket'] })
```

- Сервер проверяет формат `qrId`, лимит по IP, существование кода; сокет
  попадает в комнату `qr:<nonce>` и только в неё. Клиентские события не
  принимаются (любой пакет закрывает сокет). Через 125 с сокет закрывается
  сам (`auth:qr_expired`).
- События сервера (только статус, никаких токенов):
  - `auth:qr_scanned` `{qrId, status: 'scanned'}`
  - `auth:qr_approved` `{qrId, status: 'approved'}` → сайт сразу делает
    `POST /auth/qr/poll` со своим `pollSecret` и получает токены
  - `auth:qr_rejected` `{qrId, status: 'rejected'}` → показать отказ и
    запросить новый код
  - `auth:qr_expired` `{qrId}` → новый код
  - `auth:error` `{code: 'VALIDATION_ERROR' | 'RATE_LIMITED'}`
- Несколько инстансов API: события идут через Redis-адаптер (тот же режим
  `SOCKET_IO_ADAPTER`, что и у `/realtime`), липкие сессии не нужны.

### Что делает мобильный работник (веб-часть Flutter)

`web_qr_login_screen.dart`: открыть socket `/qr` с `qrId` сразу после
`POST /auth/qr`; на `auth:qr_approved` — вызвать `poll` немедленно (вместо
ожидания следующего тика); на `auth:qr_rejected` / `auth:qr_expired` —
новый код; опрос раз в 10 с оставить как запасной путь (если сокет не
подключился — например, корпоративный прокси без WebSocket, polling
transport тоже включён). Экран телефона (`/q/:id`) менять не нужно.

## Тесты

`apps/api/test/auth-qr-login.e2e-spec.ts` — весь поток по REST и по сокету
(статусы приходят, токены — только по секрету; неверный id, неизвестный
код и «болтливый» клиент отключаются).

## Статус мобильной части (2026-10-22)

- Телефон: `/q/<nonce>` открывает экран подтверждения
  (`web_login_link_screen.dart`, маршрут `/q/:id`); парсер ссылок
  (`core/deeplinks/deep_link.dart`) принимает и `/qr/<nonce>` как псевдоним
  того же экрана — на случай, если формат когда-нибудь сменят; в App Links
  заявлен только `/q/*`.
- Сканер в приложении (`features/qr`): оба вида ссылки → `WebLoginQrTarget`.
- Веб (`web_qr_login_screen.dart`): сразу после `POST /auth/qr` открывается
  socket `/qr` с `auth: {qrId}`; на `auth:qr_approved` — немедленный
  `POST /auth/qr/poll`; на `auth:qr_rejected` — отказ; на `auth:qr_expired`
  — новый код; опрос раз в 10 с остаётся запасным путём.
