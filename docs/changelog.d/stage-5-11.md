## Stage 5.11 — Flutter: chats, notifications, settings, push, badges

docs/05 §16 stage 5.11, §8–§10, §11 (chat, notifications).

- Feed header: Chats icon with the §10 badge (unread messages + unread
  notifications), a gold count pill that pops on change; iOS app icon
  badge mirrors the total (app_badge_plus).
- Inbox screen "Чаты | Уведомления": a gliding segmented control with a
  count per tab; "Прочитать все"; notification settings shortcut.
- Chats list (§8.1): counterpart (a client is "Клиент по кейсу «…»" with a
  neutral avatar until contacts unlock), last message (system messages and
  hidden contacts localized), time, unread pill, muted icon, case chip,
  role-specific empty states. Refreshed (debounced) on realtime events.
- Conversation (§8.2–§8.5): header with case title (opens the case), "⋯"
  mute/unmute and report; bubbles (own navy, theirs outlined) with day
  separators; delivery states sending → sent → seen (gold double check +
  "Прочитано" under the newest seen); failed messages "Не отправлено ·
  Повторить / Удалить"; system messages as gold pills; masked contacts
  shown as a localized inline marker + one-time hint; typing dots;
  "Чат закрыт" banner; attorneys without a subscription get "Продлите
  подписку" instead of the composer; read receipts only while the chat
  is on screen.
- Offline outbox (drift): a message shows at once as "отправляется", is
  sent in order with its clientMessageId when the connection or the socket
  comes back (never twice — server UQ + single-flight drain); definitive
  refusals stop retrying.
- Realtime client (socket_io_client): `/realtime` with the access token,
  `auth:refresh` on rotation, re-auth on expiry, exponential reconnection;
  after a reconnect the list, badges and open chat catch up over REST.
- Notifications (§9.1): grouped Today / This week / Earlier, actor avatar
  or a category medallion, localized `notif.list.<type>` texts (aggregated
  "Sarah и ещё N"), gold unread dot; tap marks read and opens the target
  (§9.2 routing shared with push taps).
- Settings → Notifications (§9.5): push/email per category (system locked
  with a lock note), quiet hours with time pickers in the device time zone
  (flutter_timezone).
- Push: Firebase messaging token registered per session, re-registered on
  rotation, removed on sign-out; tapping a push opens its screen. Without
  Firebase config files the app runs with push off (docs/KEYS_SETUP.md).
- Case screens: "Написать клиенту" / "Открыть чат" now open the chat.
- API: `PATCH /conversations/:id/mute` and `PUT
  /notification-settings/quiet-hours` accept an absent value as "clear"
  (generated clients drop null fields).

Checks: flutter test 603/603 (outbox sends once after reconnect, refusal
marks "not sent", UUID v4, notification routing); Android debug APK and
iOS simulator builds succeed with the new plugins.
