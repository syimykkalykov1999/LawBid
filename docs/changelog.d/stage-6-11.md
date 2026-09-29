## Stage 6.11 — CI/CD, observability, backups

docs/06_PRODUCTION.md §13 stage 6.11, §7–§8, §6.4.

### CI/CD
- `deploy.yml` (§7.3): images to ECR → staging (one-off `migrate` ECS task
  under `lawbid_migrator`, rolling deploy of api/worker/admin, smoke) →
  `production` GitHub environment with required reviewers (the manual
  gate) → backup-freshness check (`check-backup.sh`, CockroachDB Cloud
  API) → migrations → rolling deploy → smoke; ECS circuit breaker rolls a
  failed revision back. Scripts in `scripts/deploy/`.
- `api-ci.yml`: OpenAPI breaking-change gate against the base branch
  (`oasdiff breaking --fail-on ERR`, §7.2 п.2) next to the existing
  contract-drift check.
- `mobile-release.yml` + Fastlane (§7.4): tag-driven release builds with
  Conventional-Commits notes, Android AAB signed with the upload keystore
  from secrets (`build.gradle.kts` reads `ANDROID_KEYSTORE_*`, debug key
  locally), iOS IPA (`ExportOptions.plist`, certificate/profile from
  secrets), artifacts + GitHub release. Store uploads only on manual
  dispatch with `upload=true` (owner tests on Android first; closed beta
  per §11.2).

### Observability (§8)
- OpenTelemetry tracing (`src/telemetry/otel.ts`): auto-instrumentation
  for http/express/ioredis/pg/socket.io, OTLP/HTTP exporter, on only when
  `OTEL_EXPORTER_OTLP_ENDPOINT` is set (API and worker).
- Metrics CloudWatch cannot see on its own are structured log lines picked
  up by the metric filters of `infra/modules/monitoring`: `ops.queue-metrics`
  (every minute: waiting/active/delayed/failed + oldest job age per BullMQ
  queue), `ops.business-metrics` (every 10 min: registrations 24 h, open
  cases, active bids, subscriptions by status), `transaction retried`
  (40001), `stripe webhook moved to DLQ`, `subscription payment failed`,
  WebSocket connection gauge, push failures, SMS sent.
- Grafana dashboards (CloudWatch data source) in `infra/observability/grafana`:
  API health, queues & workers, database & Redis, business.
- Alarms of §8 in Terraform (5xx > 1 %, p95, unhealthy hosts, queue
  backlog, retries, Stripe DLQ, failed payments, journal integrity, SMS
  spend, Redis, ECS CPU) → SNS (email + Slack webhook).
- `docs/runbooks/`: one page per alarm plus `backups.md` (RPO ≤ 1 h,
  RTO ≤ 4 h, restore procedure, pre-migration backup check) and the
  quarterly `restore-drill.md` log.

### Not verifiable in this session
The deploy and release workflows, the alarms firing and the first restore
drill need the AWS/CockroachDB accounts and store credentials (stage
6.11 acceptance is listed for the owner in `infra/README.md` and
`docs/runbooks/restore-drill.md`).
