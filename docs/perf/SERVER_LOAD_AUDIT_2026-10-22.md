# Server load and AWS cost audit (2026-10-22)

Read-only. Paths are under `apps/` unless they start with `infra/`. Figures are estimates.

## Findings

**1. Every request is logged (S).** In `api/src/app.module.ts:137-197`, pino-http writes every request with the whole req object, and `autoLogging` is not turned off. CloudWatch costs $0.50/GB ([AWS](https://aws.amazon.com/cloudwatch/omni/pricing/)). At 1M daily users × 200 requests × 1 KB that is about 6 TB/month, roughly $3k. Better: log only errors, requests slower than 1 s, and a 1 % sample.

**2. The chats list reloads on every event (M).** In `mobile/lib/features/chat/application/chat_providers.dart:72-87`, every `message:new`, read, badge or reconnect reloads page 1. The server's `updatedSince` (`chat.service.ts:264,317`) is never called. Telegram applies `pts` updates and calls `getDifference` only after a gap ([updates](https://core.telegram.org/api/updates)). Better: update the row from the event, and use `updatedSince` after a reconnect. Saves about 50M queries a day at 1M users × 50 messages.

**3. Calls are found by polling (S).**
- Chats tab: every 30 s (`call_history_providers.dart:143` via `inbox_screen.dart:1769`). That is about 3.3k rps per 100k people online.
- Open channel: every 10 s (`channel_screen.dart:45`).
- Open group: every 10 s (`group_conversation_screen.dart:91`).
- Rejoin bar: every 10 s (`call_rejoin.dart:32`).

Telegram polls only channels open on screen, at most 10, at the interval the server sets ([updates](https://core.telegram.org/api/updates)). Better: push `group:update kind=call`, put a call flag on the channel object, and poll at 60 s or slower.

**4. Contacts sync re-uploads the whole book daily (M).** After 24 h every number is sent again (`contacts_sync/application/phone_contacts.dart:109,187`). Requests are capped at 100 hashes because of the 8 KB WAF rule (`contacts_sync_repository.dart:81`, `infra/modules/alb/main.tf:296`). The server only adds matches and never removes them (`contacts-sync.service.ts:145-149`), and the cap is 5 000 hashes a day (`:17`). So deleted contacts stay matched forever, and a book with more than 5 000 numbers never finishes. Telegram checks with a hash and gets `contactsNotModified` when nothing changed, and sends "joined" from the server ([getContacts](https://core.telegram.org/method/contacts.getContacts), [hash](https://core.telegram.org/api/offsets)). Better:
- send only added and removed hashes, with a hash check first;
- push "joined" from the server when someone registers;
- add a WAF allow rule just for this path ([AWS](https://docs.aws.amazon.com/waf/latest/developerguide/web-acl-setting-body-inspection-limit.html)).

About 10× fewer requests.

**5. Each socket checks its session every 45 s (S).** In `realtime.gateway.ts:41,183`, each socket asks Redis every 45 s. The adapter is classic pub/sub (`:134`). Better: revoke by publishing a message, and use the sharded adapter ([socket.io](https://socket.io/docs/v4/redis-adapter/)).

**6. Messages are not stored on the phone (L).** Drift holds only i18n (`core/l10n/l10n_database.dart`). Only page 1 of chats and of the feed is saved, so every chat open downloads its messages again. WhatsApp keeps messages on the device ([privacy policy](https://www.whatsapp.com/legal/privacy-policy?lang=en)). Better: store messages in Drift and fetch only `messagesAfter` (`chat_repository.dart:81`).

**7. Group and channel messages go out one person at a time (M).**
- Groups: `groups.service.ts:2221-2253` sends an emit, a badge update and a push per member, inside the send request (up to 512 members).
- Channels: `channels.service.ts:1107` writes a `notifications` row and a push per subscriber, inside the API process (`:642`).
- FCM: `fcm-push.sender.ts:89` sends one device at a time.

FCM allows at most 1 000 concurrent fanouts per project ([FCM](https://firebase.google.com/docs/cloud-messaging/topic-messaging)). Better: run fan-out on the worker, send one emit to the room, write no rows per subscriber, and send pushes in parallel.

**8. Phone media cache (S).** The cache key is stable (`app_network_image.dart:17`), but there is no `Config`. The default is 200 files (flutter_cache_manager `_config_io.dart:15`), so scrolling the feed downloads pictures again. Case files are never deleted (`file_actions.dart:36`). Telegram has "Keep media" and a cache size limit ([blog](https://telegram.org/blog/cache-and-stickers)). Better: about 2 000 files or 500 MB, plus a storage screen.

**9. Media delivery (S).**
- Chat, voice and case media come straight from S3 with 1 h signed links (`files.policy.ts:217`, `files.service.ts:578,909`), not through the CDN.
- No `Cache-Control` is set on media.
- Chat photos are uploaded at 2560 px, quality 90 (`attachment_widgets.dart:133-140`), and the server re-encodes at quality 90 (`image-processor.ts:215`).

Better: CloudFront signed URLs, `max-age=31536000, immutable`, 1600 px by default with an HD option, quality about 82.

**10. Infra (S).** It already scales down to 1 API task and 1 worker task, with Spot capacity above that and a $200 budget (`infra/envs/prod/launch.tfvars.example`). What is missing:
- The worker scales on CPU only (`infra/modules/ecs/main.tf:536-549`). Add queue depth.
- One `cache.t4g.micro` Redis set to `noeviction` holds queues, the socket adapter, caches and presence. Split it before growth.
- ECR, log and secrets traffic goes through NAT (`interface_endpoints = []`).

**Already good:** badges in Redis (`badges.service.ts:41`), feed page 1 cached for 60 s (`feed.service.ts:44`), feed indexes (`2026-10-20-local-feed.md`), reconnect jitter, 256 px avatars from the CDN, video compression on the phone.

## Do first

1. Log only errors, slow requests and a sample. Saves about $1–3k/month at 1M daily users.
2. Remove the 30 s poll and make the 10 s polls push or 60 s. About −3k rps per 100k online.
3. Update the chats list from events and use `updatedSince`. About −600 rps per 1M daily users.
4. Revoke sessions by publish. About −22k Redis ops/s per 1M sockets.
5. Move fan-out to the worker, with no rows per subscriber.
6. Contacts delta sync, "joined" from the server, WAF allow. About 10× fewer requests.
7. Image cache limits and a storage screen.
8. Media through CloudFront, `immutable`, 1600 px chat photos. About −40 % media bytes.
9. Separate Redis nodes and queue-depth autoscaling for the worker.
10. Messages in Drift.
