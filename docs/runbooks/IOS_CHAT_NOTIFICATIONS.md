# Pushes like WhatsApp: sender photos, buttons, people on every notification

**Владельцу, коротко.** С 2026-10-26 уведомления приходят «как в WhatsApp»:

- **Сообщение** — сверху кто написал (имя из записной книжки, если человек
  сохранён в контактах, иначе имя в LawBid или @username), его круглое фото,
  ниже текст или «📷 Фото» / «🎥 Видео» / «📎 Файл» / «🎤 Голосовое сообщение»;
  в группе — название группы и «Имя: текст». Сообщения одного чата
  складываются в одну стопку. Если в админке выключен показ текста
  (`push.chat_preview`), приходит только «Новое сообщение».
- **Кнопки «Ответить» и «Прочитано»** прямо на уведомлении — ответ уходит,
  не открывая приложение (Android и iPhone, на Android и с часов).
- **Ставки, кейсы, комментарии, лайки, подписки, пропущенные звонки** —
  с именем и фото адвоката, который это сделал (клиент остаётся анонимным,
  как в списке уведомлений). Нет фото — красивые буквы на синем круге, как
  в приложении.
- Тихие часы, переключатели по видам и счётчик на иконке работают как раньше.

**Что сделать один раз (iPhone):** открыть `apps/mobile/ios/Runner.xcworkspace`
в Xcode, выбрать команду (Team) у цели **NotificationService** (она уже есть в
проекте) и собрать на телефон — Xcode сам создаст App ID расширения и включит
«Communication Notifications». Если Xcode пишет про профиль — нажать
«Try Again» / включить «Automatically manage signing». Без этого шага
приложение собирается как раньше: уведомления приходят с текстом и кнопками,
но с иконкой LawBid вместо фото.

## What is in the repo

| Piece | Where |
|---|---|
| Server: title = sender, body = text / media label, group «Имя: текст», `data` with `senderId`, `senderName`, `senderAvatar` (+ `senderAvatarKey`), `text`, `kind`, `isGroup`, `chatTitle`, `chatAvatar`; `mutable-content: 1`; `thread-id` = chat id; `aps.category = chat_message`; `data.actionToken` (signed ticket for the buttons) | `apps/api/src/modules/notifications/push/chat-push.ts`, `push-dispatcher.ts`, `fcm-push.sender.ts`, `push-action-token.ts` |
| Server: other notifications carry the attorney behind them (`style: actor`, `actorName`, `actorAvatar`, `actorAvatarKey`); Android apps that registered `actorStyle` get them data-only | `actor-push.ts`, `push-dispatcher.ts`, `push_tokens.actor_style` |
| Server: `POST /api/v1/push-actions` — «Ответить» / «Прочитано» without a session: the ticket (HMAC, 48 h, user + chat) + the device's FCM token, accepted only while that device is still signed in to that account; then the normal chat / group code | `notifications/push-actions.*` |
| Android: MessagingStyle per chat, photos or letters avatar, direct reply + mark read, conversation shortcuts; notifications with a person (large round photo) | `android/.../ChatNotifications.kt`, `PushActionReceiver.kt`, `ActorNotifications.kt`, `ChatPushReceiver.kt` |
| iPhone: Notification Service Extension target `NotificationService` (embedded in Runner, before «Thin Binary»): Communication Notification with the sender photo (`INSendMessageIntent`), photo attachment for notifications with a person | `ios/NotificationService/*`, `Runner.xcodeproj` |
| iPhone: «Ответить» / «Прочитано» category, handled in the background | `ios/Runner/AppDelegate.swift` |

## Apple side (owner's Mac, once)

1. **Automatic signing (default):** select the Team on the `NotificationService`
   target (Signing & Capabilities) and build to a phone. Xcode registers
   `<app bundle id>.NotificationService` (`com.lawbid.lawbid.NotificationService`,
   `.dev.NotificationService`, `.staging.NotificationService`) and turns on
   **Communication Notifications** for the app and the extension (both
   entitlements files already list it).
2. **If you switch to `fastlane match`:** add the three extension ids to
   `app_identifier` and enable Communication Notifications on all six App IDs
   in Apple Developer → Identifiers, then regenerate the profiles.
3. **Optional — phone-book names on the iPhone banner:** create App Groups
   `group.com.lawbid.lawbid` (+ `.dev`, `.staging`), add the App Groups
   capability with that group to both targets. Until then the banner shows
   the LawBid name / @username (Android already shows the saved name).

Build numbers: the extension's «Auto build number» phase writes the number,
the app's phase reuses it, so both always match (App Store requires that).

## Как проверить

1. Два телефона, два аккаунта. Со второго написать первому, когда приложение
   на первом закрыто: уведомление с фото и именем отправителя.
2. Нажать «Ответить», написать «ок» — сообщение появилось в чате у второго,
   приложение на первом не открывалось. «Прочитано» — у второго две синие
   галочки, уведомление исчезло.
3. Адвокат ставит лайк / комментарий / ставку — уведомление с его фото.
4. Включить тихие часы — пушей нет; выключить «Сообщения» — нет пушей чатов.
5. Админка → `push.chat_preview` выкл — вместо текста «Новое сообщение».

## Why this way (trade-off)

iOS draws a push alone; the app is not running. A sender photo instead of
the app icon is only possible through a Notification Service Extension that
downloads the picture and donates an `INSendMessageIntent` (Communication
Notifications, iOS 15+) — the way WhatsApp and Telegram do it (Apple:
«Implementing communication notifications», developer.apple.com, 2021–2025).
The buttons cannot use the app's session from outside the app (a refresh
from a notification button would rotate the session under the running app),
so each push carries a short-lived signed ticket bound to the account and
chat, and the server also checks that the device is still signed in.
