# Scale limits audit (2026-10-23)

Question: what works on a test, but breaks, slows down or costs too much at
scale — found before the store release, because a fix that needs an app
update costs days of store review. Rule from the owner: think in
**billions of users**, not thousands (numbers below are per-user figures
multiplied up). Already done and not repeated: economy deltas / ETag /
caches, admin economy, security research (see the other files here), web
gzip upload (PR #272).

Status: **fixed** = in this branch with tests; **knob** = can now be changed
in the admin panel without an app update; **design** = needs an
architecture decision, not a small fix (owner / next sprint).

## Findings

| # | Sev. | Risk | Where | Fix | Status |
|---|---|---|---|---|---|
| 1 | High | Node heap = 1/4 of the container (1 GiB API task = 256 MB heap): "heap out of memory" with most RAM unused; the worker shares memory with ClamAV | `infra/modules/ecs` | `NODE_OPTIONS=--max-old-space-size` = 70 % of what the container owns (api / worker minus ClamAV / admin) | fixed |
| 2 | High | DB connections: pool fixed at 10 per task; 20 API + 10 worker tasks = 300, 600 in a rolling deploy (ECS 200 %), against about 400 on db.t4g.medium | `infra/modules/stack`, `monitoring` | `DB_POOL_SIZE` worked out from the DB size and task ceilings (3–10); `check` block that fails the plan when even 3 per task does not fit; alarm at 80 % of `max_connections` | fixed |
| 3 | High | iOS forced-update screen had no store link: `store_url_ios` was read by the app but not settable (not in the schema, not public) and the App Store id is unknown before registration | `config-schema.ts`, `bootstrap.service.ts` | `store_url_ios` / `store_url_android` (https only) editable and public | fixed |
| 4 | High | WAF limit 3000 requests / 5 min per address (2000 on the CDN): one mobile-carrier (CGNAT) or office address carries thousands of people | `infra/modules/alb`, `stack`, `envs/*` | 10 000 / 5 min; signed-in users are limited per account by the API | fixed |
| 5 | High | Anonymous API limit 100/min per address, same CGNAT problem (guest browsing, login screens) | `user-throttler.guard.ts` | `security.anonymous_rate_limit_per_minute` (>= 100) | knob |
| 6 | High | Phone traffic not tunable: retries, reconnect delay, event flush, call sync, QR poll, resume refresh, outbox backoff, reel prefetch, chat photo size were constants. After an outage 1 M phones reconnect inside 10 s | `client-tuning.ts`, `core/config/client_tuning.dart` | `client.*` keys in `app_config` (public, bounds enforced on save and again in the app), `media.chat_photo_*` | knob (ships with the first store build) |
| 7 | Med | Camera photo in a chat went at 2560 px / q90 (about 3x the bytes of the 1600 / q82 gallery path) | `attachment_widgets.dart` | camera uses the same server-tuned chat photo size | fixed |
| 8 | Med | Tables that grow for ever: `user_activity_days` (one row per active person per day), `post_view_events` (one per impression) | `data-retention.service.ts` | nightly batched delete, 400 / 730 days, 0 = keep | fixed (see billion-scale row) |
| 9 | Med | RDS exports its logs to CloudWatch groups created by AWS with "never expire" | `infra/modules/postgres` | groups created first with `log_retention_days` (30). An environment applied before this must import the two groups once: `terraform import 'module.<stack>.module.postgres[0].aws_cloudwatch_log_group.rds["postgresql"]' /aws/rds/instance/<name>-postgres/postgresql` (same for `upgrade`) | fixed |
| 10 | Med | No limit on live sockets per person: a reconnect loop or a hostile client with a valid token piles up sockets, timers, Redis work | `realtime.gateway.ts` | `realtime.max_sockets_per_user` (10) per server, oldest closed | fixed |
| 11 | Med | Admin panel proxy had no deadline: a hung API call held the panel's server for ever | `apps/admin/.../proxy` | 120 s deadline, 504 | fixed |
| 12 | Low | Reel prefetch (3 reels ahead, up to 1 MB each) is the biggest per-swipe video cost | `video_prefetch.dart` | `client.video_prefetch_ahead` (0–6) | knob |
| 13 | Low | Synthetics canary Lambda log group (`/aws/lambda/cwsyn-*`) has a random name, retention cannot be pre-set | `monitoring/slo.tf` | not done; set once in the console (30 days) | owner |
| 14 | Info | Web bundle: `main.dart.wasm` 10.7 MB raw / 3.6 MB gzip, `main.dart.js` 12 MB (both over CloudFront's 10 MB no-compress limit); no deferred imports anywhere | web build | upload gzip-encoded is PR #272. Splitting the bundle with `deferred as` (calls, video editor, attorney tools) is a router-wide change with a regression risk: left for a measured follow-up | design |

## Checked, already fine

| Area | Result |
|---|---|
| API compression | `compression` middleware, threshold 1 KB, off for event streams and `X-No-Compression`, flag `HTTP_COMPRESSION` (`app.setup.ts`). Socket.IO has no per-message deflate (default off): right for tiny events. Admin Next.js compresses by default. |
| Body limits | JSON 256 KB (`BODY_LIMIT_KB`), 1 MB only for contacts sync; WAF body-size rule only counts. Uploads never pass through the API (presigned S3 POST). |
| Uploads | `content-length-range` = exact size and exact `Content-Type` in the presigned POST; magic-byte check and antivirus scan after upload; per-place MB / counts / formats in `uploads.limits` with hard ceilings (max 100 MB); photo / avatar / video sizes in `media.*`; durations in `video.*`; all sent in the public bootstrap. |
| Pagination | Every `limit` DTO has `@Max` (<= 500). |
| Queues | Every BullMQ job and the cron template set `removeOnComplete` / `removeOnFail`. |
| Redis | per-user keys have TTLs (badges 24 h); main node `noeviction` + memory alarm at 80 %. |
| Logs | request log is sampled / errors only; 30-day retention on all service groups. |
| S3 | abort-incomplete-multipart (7 d) on all buckets, exports expire in 3 d, legal exports 31 d, old versions pruned, Intelligent-Tiering. |
| Timeouts | ALB idle 300 s and Node keep-alive 310 s (pair), request 30 s, DB statement 30 s, Prisma pool wait 10 s. |
| Update gate | 426 `APP_UPDATE_REQUIRED` for iOS and Android below `min_app_version_*`, soft update, `/config/bootstrap` exempt. Web is not gated (it is replaced on deploy); a tab left open for days keeps old code (accepted). |

## Billion-user model (per-user numbers multiplied)

Assumption: 1 B registered, 200 M daily users (DAU), 50 M connected sockets
at peak, 30 reel views per DAU per day.

| Load | Per user | At 200 M DAU | Verdict |
|---|---|---|---|
| `user_activity_days` | 1 row (~40 B) per day | 200 M rows / day, 8 GB / day, 3.2 TB at 400 d | Does not fit one PostgreSQL table. Needs day partitions (drop a partition instead of DELETE) or counting in a column store. |
| `post_view_events` | ~30 rows per day | 6 B rows / day | Impossible in PostgreSQL. Needs sampling past a threshold and aggregation in a stream / column store before any row is written. |
| Sockets | 1 socket (~100 KB incl. timers) | 50 M sockets = 5 TB of RAM, 5000+ tasks at 10 000 each | Needs a per-task ceiling and scaling on connection count (the autoscaler sees requests, not open sockets), a dedicated gateway tier. |
| DB connections | pool 3–10 per task | 5000 tasks x 3 = 15 000 | One RDS instance accepts ~400–5000. Needs a pooler (RDS Proxy / PgBouncer) and sharding by user; the new `check` block fails the plan when this is exceeded. |
| Usage events | 1 request / 60 s while open | 3.3 M requests / s if all were open together | `client.events_flush_s` and `client.events_enabled` are the brakes (knobs, but only for builds that carry them). |
| Reconnect storm | 1 reconnect <= 10 s | 5 M / s after an outage | `client.realtime_reconnect_max_ms` spreads it. Needs server-side connection rate limiting at the edge (design). |
| Bootstrap | 1 request per start, ETag | tens of thousands / s at peak | cached in Redis, 5-minute ETag bucket, 304: fine. |
| Notifications / badges in Redis | ~200 B per user | 40 GB | One node is not enough: cluster or shard. |
| Reel prefetch | up to 3 MB per swipe | 200 M x 30 x 3 MB = 18 PB / day worst case | `client.video_prefetch_ahead` is the cost lever. |

Everything marked "design" above is a decision for the owner (budget and
timing): none of it can be fixed by a flag.

## What the owner needs

1. Apply the infra (`terraform plan` first): new pool size, heap, alarm, log groups. Import the two RDS log groups if the environment already exists (finding 9).
2. After the first iOS build is registered: set `store_url_ios` in the admin Config.
3. Set 30-day retention on the Synthetics canary log group (finding 13).
4. Decide the billion-scale design items (partitioning / sampling of view events, gateway tier, connection pooler).
5. The `client.*` knobs only work in builds that contain this change: the first store build must include it.
