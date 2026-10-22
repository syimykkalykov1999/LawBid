# iPhone chat pushes with the sender's photo (Communication Notifications)

**Владельцу, коротко.** С 2026-10-22 пуш о сообщении на обоих телефонах
приходит как в WhatsApp: сверху — кто написал (имя из записной книжки, если
человек сохранён в контактах, иначе имя в LawBid или @username), ниже —
текст или «📷 Фото» / «🎥 Видео» / «📎 Файл» / «🎤 Голосовое сообщение»; в
группе сверху название группы, ниже «Имя: текст». На Android фото
отправителя и имя из записной книжки уже показываются. **На iPhone фото
вместо иконки LawBid и имя из записной книжки появятся только после шагов
ниже** — их делают один раз в Xcode и в Apple
Developer (робот не может нажать эти кнопки). Пока шаги не сделаны, iPhone
показывает имя и текст, но с иконкой приложения — ничего не ломается.

## What is already in the repo

| Piece | Where |
|---|---|
| Server: title = sender, body = text / media label, group «Имя: текст», `data` with `senderId`, `senderName`, `senderAvatar` (+ `senderAvatarKey`), `text`, `kind`, `isGroup`, `chatTitle`, `chatAvatar`; `mutable-content: 1`; `thread-id` = chat id (one stack per chat) | `apps/api/src/modules/notifications/push/chat-push.ts`, `push-dispatcher.ts`, `fcm-push.sender.ts` |
| Extension code (downloads the photo, donates an `INSendMessageIntent`, swaps in the phone-book name) | `apps/mobile/ios/NotificationService/NotificationService.swift` |
| Extension `Info.plist` and entitlements (App Group + Communication Notifications) | `apps/mobile/ios/NotificationService/` |
| `NSUserActivityTypes = [INSendMessageIntent]` | `apps/mobile/ios/Runner/Info.plist` |
| App writes phone-book names to `UserDefaults(suiteName: "group.<bundle id>")`, clears a chat's notifications when it is opened | `apps/mobile/ios/Runner/AppDelegate.swift` (`lawbid/chat_notifications`) |

**Not done on purpose:** the extension target is not in
`Runner.xcodeproj`, and `Runner.entitlements` does not list the new
capabilities. Adding them without the matching App IDs / provisioning
profiles would break every iOS build (CI and TestFlight) until Apple's side
is set up, so both happen together, below.

## Steps (owner's Mac, once)

1. **Apple Developer → Identifiers**
   - App Groups: create `group.com.lawbid.lawbid` (and
     `group.com.lawbid.lawbid.dev`, `group.com.lawbid.lawbid.staging` if
     those flavors are installed on phones).
   - For each app App ID (`com.lawbid.lawbid`, `.dev`, `.staging`): enable
     **App Groups** (pick its group) and **Communication Notifications**.
   - Create App IDs for the extension: `com.lawbid.lawbid.NotificationService`
     (and `.dev.NotificationService`, `.staging.NotificationService`) with the
     same two capabilities.
2. **Profiles**: regenerate the app profiles and create ones for the
   extension IDs (`fastlane match appstore` / `development` with the new
   `app_identifier` list, or Xcode automatic signing).
3. **Xcode** (`apps/mobile/ios/Runner.xcworkspace`):
   - File → New → Target → *Notification Service Extension*, product name
     `NotificationService`, Swift, iOS 15.5. Delete the generated
     `NotificationService.swift` / `Info.plist` and add the files from
     `ios/NotificationService/` instead (target membership: the extension
     only). Build Settings → *Info.plist File* =
     `NotificationService/Info.plist`, *Code Signing Entitlements* =
     `NotificationService/NotificationService.entitlements`.
   - Extension bundle id per configuration:
     `$(app bundle id).NotificationService` (Debug-dev →
     `com.lawbid.lawbid.dev.NotificationService`, and so on).
   - Base the extension's configurations on `Flutter/Debug.xcconfig` /
     `Flutter/Release.xcconfig` so `FLUTTER_BUILD_NAME` / `FLUTTER_BUILD_NUMBER`
     match the app (App Store rejects a mismatched extension version).
   - Add a build setting `APP_GROUP_ID` = `group.$(app bundle id)` on both
     the Runner and the extension target, per configuration.
   - Runner target → Signing & Capabilities → **+ App Groups**
     (`$(APP_GROUP_ID)`) and **+ Communication Notifications**. Xcode writes
     both into `Runner/Runner.entitlements`.
   - Check that Runner → Build Phases → *Embed Foundation Extensions*
     contains `NotificationService.appex` and that it runs **before**
     "Thin Binary" (Flutter's known cycle error otherwise).
4. Build and run on a phone, send yourself a message from another account
   with a photo: the banner shows the sender's round photo, the name you
   saved for them, and the chat's messages stack together.

## Why an extension (trade-off)

iOS draws a push alone; the app is not running. A sender photo instead of
the app icon is only possible through a Notification Service Extension that
downloads the picture and donates an `INSendMessageIntent` (Communication
Notifications, iOS 15+) — the way WhatsApp and Telegram do it. A plain image
attachment (`mutable-content` + attachment) would show the photo as a
thumbnail on the right, not as the sender's avatar, and still needs the
same extension target, so it buys nothing. Everything that needs no
extension (title = sender, body = text, one stack per chat) already works
on iPhones today.
