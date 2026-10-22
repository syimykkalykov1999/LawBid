# Business SLO alarms and the uptime canary

Owner 2026-10-22, audit #4 §7. Terraform: `infra/modules/monitoring/slo.tf`. Counters: `apps/api/src/common/ops/slo-metrics.service.ts`.

## What is measured

Every API and worker process writes one log line a minute: `{"metric":"slo","signup":…,"otpSent":…,"otpVerified":…,"callConnected":…,"callFailed":…,"pushOk":…,"pushFailed":…}`. CloudWatch metric filters turn it into `LawBid/<env>/Slo*` metrics.

| SLO | Good / total | Target |
|---|---|---|
| OTP SMS | verified / sent (phone codes only) | 95 % |
| Calls | connected / (connected + failed) | 95 % |
| Pushes | delivered / (delivered + failed) | 98 % |
| Signups | ≥ `min_daily_signups` in 24 h (off until set) | — |

## How the alarms decide (Google SRE workbook, multiwindow burn rate)

- **Fast burn** `<env>-slo-<flow>-fast`: the error rate is above 14.4 × the error budget over 1 h **and** over the last 5 min.
- **Slow burn** `<env>-slo-<flow>-slow`: above 6 × the budget over 6 h **and** the last 30 min.
- Fewer than `slo_min_events` (20) events in a window count as 0 % errors.

## What to do

- **OTP**: Twilio console → Monitor → Messaging logs (errors by country); balance; the country allow-list and money caps in the admin (budget.*).
- **Calls**: TURN (`docs/runbooks/TURN.md`): instance CPU / network, credentials in Интеграции → TURN.
- **Pushes**: Интеграции → Firebase (FCM) key, Firebase status page, worker logs `fcm send failed`.
- **Signups**: sign up yourself on a phone; check the stores' listings.

## Uptime canary

`<env>-up` (CloudWatch Synthetics) GETs `https://<api_host>/health/ready` every 5 minutes; two failed runs in a row page `<env>-uptime-canary`. Cost: about **$10 a month** ($0.0012 a run × 8 640 runs) plus a few cents of S3 and Lambda. Turn it off with `uptime_canary_enabled = false`; a Route 53 HTTPS health check (~$2.50 a month, metrics in us-east-1 only) is the cheaper alternative.
