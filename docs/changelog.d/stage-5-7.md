## Stage 5.7 — Chats and realtime (API)

docs/05 §16 stage 5.7, §8, §15 "Чаты"; docs/04 §9.

- `modules/chat`: `GET /conversations?cursor=&updatedSince=` (by
  `last_message_at`, chats with a message; unread count, mute, the other
  side's `last_read_message_id` for "Seen"), `GET /conversations/:id`,
  `GET /conversations/:id/messages?cursor=` (newest first) and `?afterId=`
  (catch-up after a reconnect), `POST …/messages {clientMessageId, body}`
  (idempotent on the UQ, 2000 chars → `MESSAGE_TOO_LONG`, `closed` →
  `CONVERSATION_CLOSED` 409, attorney without subscription →
  `SUBSCRIPTION_REQUIRED`, §13 `message` limit; the row lock serializes
  with closing/unlocking), `POST …/read` (forward only, `message:read`),
  `PATCH …/mute {until}`.
- Counterpart: an attorney sees the client as "Клиент по кейсу" (no id,
  name or photo) until `contacts_unlocked`; a client always sees the
  attorney.
- Contact masking (§8.3): `maskContactInfo` next to the file-04 detector —
  phones (separators, spelled-out digits), emails (also "at … dot"), links
  → `[контакт скрыт]` in `body_display`; `body_original` kept; never after
  unlock.
- System messages (§8.2) inside the file-04 transactions
  (`ChatSystemMessages`): `offer_accepted` on accept, `accepted_by_other`
  (+ closed) in the other attorneys' pre-acceptance chats, `no_agreement`
  on decline/withdraw, `case_closed` on client close/delete and auto-archive
  (pre-acceptance chats closed — client close/delete did not close them
  before, docs/04 §9) and on completion close. `conversation:update` is
  published after commit.
- Realtime (§8.5): Socket.IO namespace `/realtime`, JWT at the handshake
  and on `auth:refresh`, disconnect at token expiry, rooms `user:{id}` and
  `conversation:{id}` (participants only), `typing:start/stop` relayed
  (≤ 1/s per socket, not stored), Redis adapter across instances;
  `RealtimePublisher` (Redis emitter) works from the API and the worker.
  Presence set `rt:view:{user}:{conversation}` for push suppression (5.8).
- Search (5.6 follow-up): short queries return `SEARCH_QUERY_TOO_SHORT`.

Deps: @nestjs/websockets, @nestjs/platform-socket.io, socket.io,
@socket.io/redis-adapter, @socket.io/redis-emitter; dev socket.io-client.

Tests: e2e `stage-5-7.e2e-spec.ts` 5/5 (two API instances); unit masking
cases; full unit 712/712, full e2e 38 suites green.
