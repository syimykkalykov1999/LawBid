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
`<env>-anomaly-<metric>-low`: the hourly count of signups, sent messages, OTP codes or delivered pushes fell below the band CloudWatch learned. It is muted unless the last 24 h had a real volume (`anomaly_min_daily_events`). Open the app and walk that flow yourself; if it is broken after a release, GitHub → Actions → «Rollback production». Anomaly model needs about two weeks of data before it is sharp.

### auth-spike
`<env>-anomaly-authFailed-high` / `otpRequested-high`: a spike of failed sign-ins or code requests (credential stuffing, SMS pumping). Only reported at ≥ `auth_spike_min_per_hour` (100) an hour. Admin → Безопасность → журнал входов; set `security.turnstile.mode` to enforce for the website and lower the SMS limits.

### availability
`<env>-availability-fast` (page) and `-slow` (mail): ALB target 5xx share above 14.4× / 6× the 0.1 % budget. See `api-5xx.md`. Complements the flat `<env>-api-5xx-ratio` alarm.

### synthetic
Optional canary `<env>-jr` (off): signs in with a dedicated test account, opens the feed and sends one message to a dedicated chat, every 15 minutes (about **$3.5 a month**: $0.0012 × 2 880 runs). Set up: create two test accounts (never real people), a chat between them, store `{"identifier": "...", "password": "..."}` in a Secrets Manager secret, then in tfvars `synthetic_journey_enabled = true`, `synthetic_journey_base_url`, `synthetic_journey_secret_arn`, `synthetic_journey_conversation_id`. The probe message is real chat traffic of the test pair only. Alarm `<env>-journey-canary` mails on two failed runs; the run shows which step failed (login / feed / message).

### Signups
Sign up yourself on a phone; check the stores' listings.

## Uptime canary

`<env>-up` (CloudWatch Synthetics) GETs `https://<api_host>/health/ready` every 5 minutes; two failed runs in a row page `<env>-uptime-canary`. Cost: about **$10 a month** ($0.0012 a run × 8 640 runs) plus a few cents of S3 and Lambda. Turn it off with `uptime_canary_enabled = false`; `uptime_check = "route53"` switches to a Route 53 HTTPS health check (~$2 a month, every 30 s, metrics in us-east-1 only) instead of the Synthetics canary; the alarm name stays `<env>-uptime-canary`.

## Alarm → incident row (off)

`alarm_incident_hook_enabled = true` adds a Lambda (`<env>-alarm-hook`) subscribed to the alerts topic. Each alarm state change is posted to `POST /api/v1/internal/alarm-events` with a shared token (`ALARM_HOOK_TOKEN`, from Secrets Manager); the API opens or closes a row in `system_incidents` (`alarm:<name>`), so the admin «Здоровье системы» timeline shows alarms next to probe incidents. No extra push or mail. Cost: a few invocations a day, inside the free tier.

## Dashboard and the old Grafana files

`<env>-slo` (CloudWatch → Dashboards) shows the success rate of every flow, API availability, p95, event-loop delay and heap. The first three dashboards of an account are free, then $3 a month each. The JSON files in `infra/observability/grafana/` are NOT deployed anywhere and miss the SLO metrics; they are left in place as a reference and are not maintained.

## Tracing and client monitoring (all off or capped)

- Server tracing (`tracing_enabled`, default false): ADOT collector sidecar in the api and worker tasks → AWS X-Ray, 5 % ParentBased sampling. X-Ray: first 100 000 traces a month free, then $5 per million. A phone can mark its own calls with a W3C `traceparent` (`client.traceparent_percent`, default 5, 0 = never).
- App → Sentry traces (`client.sentry_traces_percent`, default 5, 0 = off): only for people who allowed usage statistics and only while the Sentry DSN is set. Sentry bills its own quota; set a rate limit in the Sentry project (Settings → Client Keys → Rate Limits) so one bad release cannot burn it.
- API → Sentry: `release` = `APP_VERSION`, 4xx answers are dropped, `SENTRY_SAMPLE_RATE` (default 1) and `SENTRY_TRACES_SAMPLE_RATE` (default 0, vendor quota) tune it.
