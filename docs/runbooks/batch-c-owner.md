# Batch C: what the owner switches on (2026-10-24)

All of this is code that is already safe to deploy. Nothing below is applied by the code itself.

## 1. Separate cache Redis (item 9)

The app uses `REDIS_CACHE_URL` for pure caches when it is set, and the main Redis when it is not. Only copies of recomputable data with a TTL moved (search lists and suggest, translations, link previews, i18n bundle, practice-area tree, suggestions, subscription-access, content mode, admin analytics overview). Queues, locks, rate limits, throttler, OTP, sessions, idempotency, counters, version numbers, cost guard and pub/sub stay on the main Redis (an eviction there would be a bug).

If the cache Redis is down the API keeps working (cache calls answer "miss", and after 3 failures the cache is skipped for 10 s).

Prod `terraform.tfvars` line (infra already injects `REDIS_CACHE_URL` from the new node):

```
redis_cache_node = true   # cache.t4g.micro, allkeys-lru, about $12/month
```

Apply in the normal saved-plan way, then re-upload the tfvars backup to Secrets Manager. Rollback: set it back to `false` (or unset the env var): caches fall back to the main Redis.

Optional env: `REDIS_CACHE_COMMAND_TIMEOUT_MS` (default 500).

## 2. Usage alerts (items 11 and 16)

A daily worker job `ops.usage-poll` (06:25 UTC) reads:

- Cloudflare Realtime TURN egress this month: GraphQL `callsTurnUsageAdaptiveGroups` (free 1000 GB/month, shared with SFU; no documented SFU dataset was found on 2026-10-24, so SFU traffic is not counted: the figure is a lower bound).
- Bunny CDN traffic this month (`GET api.bunny.net/statistics`) and the video library storage (`GET api.bunny.net/videolibrary/{id}`).

Owner steps (admin, Безопасность → Ключи и сервисы), both optional; empty means the poll skips that provider:

1. `cloudflare_turn`: fill "Account ID" and "Analytics API Token" (a Cloudflare API token with permission Account Analytics: Read).
2. `bunny_stream`: fill "Account API key" (Bunny dashboard → Account → API key; the library key does not work for `/statistics`).

Thresholds (admin → Настройки, GB, 0 = off): `usage.cloudflare_egress_warn_gb` 700, `usage.cloudflare_egress_crit_gb` 950, `usage.bunny_bandwidth_warn_gb` 1000, `usage.bunny_bandwidth_crit_gb` 2000, `usage.bunny_storage_warn_gb` 200, `usage.bunny_storage_crit_gb` 500.

CloudWatch (module `monitoring`): metrics `CloudflareRealtimeEgressGb`, `BunnyBandwidthGb`, `BunnyStorageGb`; alarms `*-usage-cf-warn`/`-crit`, `*-usage-bunny-*`, `*-usage-poll-failed`. Warn goes to the mail topic, crit to the pager topic. System-health shows three new lines (breakers, Cloudflare usage, Bunny usage).

Bunny's own dashboard spend limit cannot be set through an API (not found in the docs on 2026-10-24); set it by hand.

## 3. Per-user video cap (item 16)

Already present and enforced: `rate_limit.video_upload_per_day` (default 10) via `UsageLimitsService` in `videos.service.ts`, with the plan entitlement `videos_per_day`. A per-user daily video size/minutes cap belongs to batch B (item 5).
