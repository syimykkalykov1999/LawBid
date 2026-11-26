# Business SLO alarms and the uptime canary

Owner 2026-10-22, audit #4 §7. Terraform: `infra/modules/monitoring/slo.tf`. Counters: `apps/api/src/common/ops/slo-metrics.service.ts`.

## What is measured

Every API and worker process writes one log line a minute: `{"metric":"slo","signup":…,"otpSent":…,"otpVerified":…,"callConnected":…,"callFailed":…,"pushOk":…,"pushFailed":…,"turnProviderFailed":…,"loginOk":…,"loginFail":…,"msgSent":…,"msgAckLate":…,"feedOk":…,"feedSlow":…,"payOk":…,"payFail":…,"authFailed":…,"otpRequested":…}`. CloudWatch metric filters turn it into `LawBid/<env>/Slo*` metrics.

| SLO | Good / total | Target |
|---|---|---|
| OTP SMS | verified / sent (phone codes only) | 95 % |
| Calls | connected / (connected + failed) | 95 % |
| Pushes | delivered / (delivered + failed) | 98 % |
| Login | ok / (ok + fail); fail also counts typos, so the target is low | 80 % |
| Chat send | sent within 5 s / (sent + late or 5xx) | 99 % |
| Feed open | answered within 1 s / (ok + slow or 5xx) | 95 % |
| Payments | paid / (paid + failed), from Stripe events | 90 % |
| API availability | requests that are not a 5xx (ALB), own alarms `<env>-availability-fast/slow` | 99.9 % |
| Signups | ≥ `min_daily_signups` in 24 h (off until set) | — |

## How the alarms decide (Google SRE workbook, multiwindow burn rate)

- **Fast burn** `<env>-slo-<flow>-fast`: the error rate is above 14.4 × the error budget over 1 h **and** over the last 5 min.
- **Slow burn** `<env>-slo-<flow>-slow`: above 6 × the budget over 6 h **and** the last 30 min.
- Fewer events than the floor of a window count as 0 % errors: 5 min window 2 (`slo_min_events_5m`), 1 h window 5 (`slo_min_events_1h`), 6 h and 30 min windows 20 (`slo_min_events`). Both windows of a pair must agree, so two failed events alone never page.
- Pages (phone): otp, call, push, login, message, pay and the availability fast burn. The feed SLO and the slow burns only send mail.

## Error budget (28 days) and the release gate

`<env>-slo-<flow>-budget-exhausted` (mail): the SLO spent its error budget over the last 28 days (`SloBudgetRemaining` ≤ 0, measured hourly by the `<env>-error-budget` function, `error-budget.tf`). While any of them is in ALARM, `deploy.yml` lets only fix: / revert: / security: commits and rollbacks through. Rules, override (`BUDGET_GATE`) and the decision log: [error-budget-policy.md](error-budget-policy.md).

## What to do

### otp
Twilio console → Monitor → Messaging logs (errors by country); balance; the country allow-list and money caps in the admin (budget.*).

### call
Our own TURN servers are removed, calls use **Cloudflare TURN/SFU**. Open admin -> Система -> Состояние системы (rows Cloudflare TURN, Cloudflare SFU), then the API logs (`cloudflare_turn_failed`); keys in Интеграции -> `cloudflare_turn` / `cloudflare_sfu`; https://www.cloudflarestatus.com. Details: `docs/runbooks/TURN.md`. **`<env>-turn-provider-failed`**: 5 failed Cloudflare TURN logins (after a retry) in 5 minutes; calls then fall back to STUN only. Same steps.

### push
Интеграции → Firebase (FCM) key, Firebase status page, worker logs `fcm send failed`.

### login
Sign in yourself (SMS, password, Google, Apple). A wave of wrong passwords also lowers this ratio: look at the auth-spike alarms below and at admin → Безопасность → журнал входов. A real outage shows 5xx on `/auth/*` (dashboard `<env>-slo`).

### message
Chat send answered later than 5 s or with a 5xx. Admin → Здоровье системы: database, Redis, queues. API logs for `conversations`.

### feed
Feed page slower than 1 s or a 5xx. Look at database load and the feed cache (Redis); `ops.route_metrics.mode = on` in the admin settings shows the per-route latency (`LawBid/Routes`, route `feed_get`).

### pay
Stripe Dashboard → Developers → Events / Logs; admin → Платежи. Counted from Stripe webhook events (invoice paid / failed, payment_intent.succeeded).

### anomaly
Switch: `anomaly_alarms_enabled` in terraform.tfvars (default **false**, ≈ $5.40 a month when on; registry row `aws.anomaly_alarms`). Turn it on once the app has weeks of traffic. `uptime_check` accepts `off`, `route53` (prod default, ≈ $2) or `synthetics` (≈ $10). Phone Sentry traces (`client.sentry_traces_percent`) default to 0; raise it only from the admin settings page.

`<env>-anomaly-<metric>-low`: the hourly count of signups, sent messages, OTP codes or delivered pushes fell below the band CloudWatch learned. It is muted unless the last 24 h had a real volume (`anomaly_min_daily_events`). Open the app and walk that flow yourself; if it is broken after a release, GitHub → Actions → «Rollback production». Anomaly model needs about two weeks of data before it is sharp.

### auth-spike
`<env>-anomaly-authFailed-high` / `otpRequested-high`: a spike of failed sign-ins or code requests (credential stuffing, SMS pumping). Only reported at ≥ `auth_spike_min_per_hour` (100) an hour. Admin → Безопасность → журнал входов; set `security.turnstile.mode` to enforce for the website and lower the SMS limits.

### availability
`<env>-availability-fast` (page) and `-slow` (mail): ALB target 5xx share above 14.4× / 6× the 0.1 % budget. See `api-5xx.md`. Complements the flat `<env>-api-5xx-ratio` alarm.

### synthetic
Optional canary `<env>-jr` (off): signs in with a dedicated test account, opens the feed and sends one message to a dedicated chat, every 15 minutes (about **$3.5 a month**: $0.0012 × 2 880 runs). Set up: create two test accounts (never real people), a chat between them, store `{"identifier": "...", "password": "..."}` in a Secrets Manager secret, then in tfvars `synthetic_journey_enabled = true`, `synthetic_journey_base_url`, `synthetic_journey_secret_arn`, `synthetic_journey_conversation_id`. The probe message is real chat traffic of the test pair only. Alarm `<env>-journey-canary` mails on two failed runs; the run shows which step failed (login / feed / message).

### canary
Б2 (25.11), Google SRE Workbook ch. 16 «Canarying Releases»: the new release is judged against a **control** that runs the old release over the same minutes, not against one fleet-wide threshold (one bad canary task among many old ones disappears in the average).
- ECS built-in canary (`api_native_deploy`, two api target groups): `<env>-api-canary-vs-control` (5xx share of one group > 2 × the other + 0.5 pp) and `<env>-api-canary-vs-control-p95` (p95 > 1.5 × the other + 200 ms), only while both groups carry ≥ 50 requests in 5 minutes. Both are in the ECS deployment alarms, so ECS shifts the traffic back by itself. Tuning: `api_canary_compare_*` in terraform.tfvars.
- Our canary script (`scripts/deploy/canary.sh`, when the ECS canary is off): after the bake it reads the API's minute lines `{metric:"slo", release, httpReq, http5xx}` (CloudWatch Logs, `filter-log-events`) and compares the canary task (`release` = the new tag) with the old tasks (`scripts/deploy/canary-compare.mjs`, same rule). Repository variables: `CANARY_COMPARE=off` skips it, `CANARY_MIN_REQUESTS` (50), `CANARY_FLOOR` (0.005).
- Business signals: the fast burns `<env>-slo-login-fast`, `-message-fast`, `-pay-fast` are watched by the canary script (with the api alarms; a burn already firing before the canary is ignored) and, with `deploy_rollback_on_slo = true`, by ECS next to otp / call / push.
- What to do when it fires: nothing urgent, the release stopped before the real api changed (or ECS moved the traffic back). Search the API logs of the new release (`release = <tag>`), fix, ship.

### client
Б6 (25.11, SRE Workbook ch. 2 «measure close to the user»): the app and the website count the six SLO flows **as the person sees them**, after their own retries — sign-in, feed (ok within `client.sli_feed_slow_ms`, 3 s), chat send (within `client.sli_message_slow_ms`, 5 s), payment, starting / accepting a call, opening a push. A 5xx or a timeout is a failure; a 4xx (wrong password) or an offline phone is not counted. They travel as opt-in anonymous usage events (`sli_<flow>_<ok|slow|fail>`, docs/analytics_events.md), the API adds them up in its minute line `{metric:"slo_client"}` (no table), CloudWatch metrics `SloClient*`. Alarm `<env>-slo-client-<flow>` (mail): 6× the budget over 6 h AND 30 min. Targets: `client_slo_targets` in tfvars (login 98 %, feed 95 %, message 98 %, pay 95 %, call 95 %, push 95 %). Admin switches: `client.sli_enabled`, `client.sli_feed_slow_ms`, `client.sli_message_slow_ms`. What to do: compare with the server alarm of the same flow (`<env>-slo-<flow>-*`). Server fine, client red = the path to the person (network, CloudFront / Cloudflare, DNS) or an app bug: open the app and the site yourself, look at the CDN alarms below.

### web-vitals
Б6 / G8: Core Web Vitals of real website visits (web-vitals 6.2.3 by Google, Apache-2.0, `apps/mobile/web/vendor/`), sent with `navigator.sendBeacon` when the page is hidden, only the rating (good / ni / poor), only with the usage-statistics consent and `client.web_vitals_enabled`. Alarm `<env>-web-vitals-<lcp|inp|cls>-poor` (mail): fewer than 75 % of the visits in 6 h are «good» (web.dev: the 75th percentile must be good), with at least `web_vitals_min_samples` (100) rated visits. What to do: what changed on the site last (GitHub → Actions → Web deploy), the bundle size (`scripts/deploy/web-size-budget.sh`).

### cdn
Б6, AWS Recommended Alarms for CloudFront: `<env>-cloudfront-5xx-<web|media|documents>` (5xxErrorRate above `cloudfront_5xx_rate_percent`, 5 %, five minutes) and, with the additional metrics on (`cdn_additional_metrics`, us-east-1), `<env>-cloudfront-origin-latency-<web|documents>` (OriginLatency p95 above `cloudfront_origin_latency_p95_ms`, 3 s, 15 minutes; media keeps `media-cdn-origin-latency-high`). Website availability: `<env>-web-availability-fast` (page) / `-slow` (mail), 14.4× / 6× the 0.1 % budget, like the API's. What to do: open https://lawbid.dev yourself; CloudFront → Distributions → Monitoring; after any terraform apply check the CloudFront function (KNOWN_ERRORS 12). The synthetic check walks the site too: home page, `/lawyers/`, the status page and its `status.json` (`SYNTHETIC_WEB_URL`, `SYNTHETIC_STATUS_URL`; in deploy.yml a report-only step that never rolls the API back).

### Phone speed in Sentry (G7)
Screen transactions from `SentryNavigatorObserver` (frames: slow / frozen; time to initial and full display — the feed and the chats report full display when their content is on the screen), only for traced sessions (consent + `client.sentry_traces_percent`). Alerts on the p75 cold start and the frozen-frame share are set in Sentry itself (owner step: Sentry → Alerts → Create alert → Performance → «Mobile vitals»).

### load-shed
`<env>-load-shed-low` (mail) and `<env>-load-shed-critical` (mail): the API sheds requests by priority (item 21, after Netflix: background → prefetch / suggestions → normal screens → sign-in, payments, calls, sending a message). Counters `shedLow` / `shedCritical` in the minute `{metric:"slo"}` line; each minute with shedding also logs `{metric:"load_shed", shed:{bulk,best_effort,degraded,critical}, limit, inFlight, lagMs, cpuPct}` (CloudWatch Logs Insights: `filter metric = "load_shed"`). Steps: Admin → Система → Состояние системы (CPU, event loop, number of servers). Low only: autoscaling is not keeping up — check the ECS service desired count. Critical: add servers, or raise `realtime.server.shed_cpu_critical_pct` / `realtime.server.shed_event_loop_lag_ms` in Настройки. Admin switch `realtime.server.shed_mode`: Выкл (nothing shed) / Вкл (fixed thresholds) / Авто (default, plus the Netflix Gradient2 adaptive concurrency limit, only above `shed_cpu_start_pct`). Thresholds: `load_shed_low_alarm_count` (100 per 5 min, two periods) and `load_shed_critical_alarm_count` (1) in terraform.tfvars, 0 = no alarm.

### Signups
Sign up yourself on a phone; check the stores' listings.

## Uptime canary

`<env>-up` (CloudWatch Synthetics) GETs `https://<api_host>/health/ready` every 5 minutes; two failed runs in a row page `<env>-uptime-canary`. Cost: about **$10 a month** ($0.0012 a run × 8 640 runs) plus a few cents of S3 and Lambda. Turn it off with `uptime_canary_enabled = false`; `uptime_check = "route53"` switches to a Route 53 HTTPS health check (~$2 a month, every 30 s, metrics in us-east-1 only) instead of the Synthetics canary; the alarm name stays `<env>-uptime-canary`.

## Alarm → incident row (off)

`alarm_incident_hook_enabled = true` adds a Lambda (`<env>-alarm-hook`) subscribed to the alerts topic. Each alarm state change is posted to `POST /api/v1/internal/alarm-events` with a shared token (`ALARM_HOOK_TOKEN`, from Secrets Manager); the API opens or closes a row in `system_incidents` (`alarm:<name>`), so the admin «Здоровье системы» timeline shows alarms next to probe incidents. No extra push or mail. Cost: a few invocations a day, inside the free tier.

## Setting changes released like code (Б3, 25.11)

A save of a setting (Настройки, or a section's own settings card) is written to `app_config` and put under watch (`settings.rollouts` row, `apps/api/src/common/app-settings/config-rollout.ts`):

- only `settings.canary_percent` % of the API tasks (default 10, at least one task) read the new value; the other API tasks, the workers and the app start answer (`/config/bootstrap`) read the old one;
- for `settings.watch_minutes` (default 5) the worker job `settings.rollout-watch` (every minute) looks at the alarm rows above: an `alarm:slo-*-fast` or `alarm:availability-fast` that opened AFTER the save = the old value goes back for everyone (audit `settings.auto_revert`, push + e-mail to the on-call admins); one already open before the save does not count;
- review of #1332: an alarm is blamed on the NEWEST change that started before it (plus changes saved within a minute of it), never on every change under watch; the older ones keep their window. If the same alarm was already open when that change started, or closed less than `settings.incident_quiet_minutes` (default 30) before it, an incident is going on: nothing is reverted automatically, the on-call admins get «Тревога во время проверки настроек» (log `settings_auto_revert_held`) and decide themselves;
- a hold whose window plus 10 minutes ran out without the worker (missed promotion) drops every config cache once, so the app start answer gets the new value too;
- the canary heartbeat runs only in the HTTP API process after it listens (`main.ts`), never in the worker, a CLI script or a test;
- «Вернуть» in the audit log runs the same checks as a save of that value (owner-only keys with a fresh 2FA code, R2 / LiveKit / … keys, min / max).
- no alarm until the window ends = everyone reads the new value (audit `settings.rollout_promoted`);
- money, «Авто», calls, realtime and the `settings.*` keys themselves apply at once (`settings.canary_skip_prefixes`); `settings.watch_minutes = 0` = every change at once, as before.

Admin: Настройки and Журнал аудита show «Изменения на проверке» with «Вернуть» (old value now) and «Применить всем сейчас» (emergency, skips the window); every settings row of the journal has «Вернуть» (refused with 409 when the key was changed again since). All three: super admin, a fresh 2FA code, an audit row (`settings.revert`, `settings.rollout_emergency`). Idea: Meta «Holistic Configuration Management at Facebook» (Configerator, SOSP 2015) and Google SRE Workbook ch. 16 «Canarying Releases»; the code is ours (no library does this for a table-backed config).

## Dashboard and the old Grafana files

`<env>-slo` (CloudWatch → Dashboards) shows the success rate of every flow, API availability, p95, event-loop delay and heap. The first three dashboards of an account are free, then $3 a month each. The JSON files in `infra/observability/grafana/` are NOT deployed anywhere and miss the SLO metrics; they are left in place as a reference and are not maintained.

## Tracing and client monitoring (all off or capped)

- Server tracing (`tracing_enabled`, default false): ADOT collector v0.51.0 sidecar in the api and worker tasks → AWS X-Ray. Tail sampling (`tracing_tail_sampling`, default true; the collector's `tail_sampling` processor): the app records every request and the collector keeps 100 % of traces with an error, 100 % of traces slower than `tracing_slow_ms` (default = `p95_target_ms`, 600 ms) and `tracing_sample_ratio` (default 0.05 = 5 %) of the rest. All three are `terraform.tfvars` values. 26.11: `tracing_enabled` itself is an «Авто» row (`aws.tracing`, `infra.mode.tracing`): on while the API p95 of 15 minutes is at least `infra.tracing_on_p95_ms` (600 = `p95_target_ms`) or 5xx at least `infra.tracing_on_error_pct` (2 %, SRE Workbook ch. 5 fast burn 14.4 × 0.1 % rounded up) with `infra.tracing_min_requests` (300) requests; off after `infra.auto_off_hours` below 80 % of the p95 line and half the 5xx line (`infra-auto-growth.logic.ts`). `tracing_tail_sampling = false` = the old head sampling (5 % ParentBased in the app; errors outside it are lost). X-Ray: first 100 000 traces a month free, then $5 per million. A phone sends a W3C `traceparent` on its calls (`client.traceparent_percent`, default 5, 0 = never) so a kept trace links phone → API → database; with tail sampling the collector, not the phone's sampled flag, decides what is kept.
- App → Sentry traces (`client.sentry_traces_percent`, default 5, 0 = off): only for people who allowed usage statistics and only while the Sentry DSN is set. Sentry bills its own quota; set a rate limit in the Sentry project (Settings → Client Keys → Rate Limits) so one bad release cannot burn it.
- API → Sentry: `release` = `APP_VERSION`, 4xx answers are dropped, `SENTRY_SAMPLE_RATE` (default 1) and `SENTRY_TRACES_SAMPLE_RATE` (default 0, vendor quota) tune it.
