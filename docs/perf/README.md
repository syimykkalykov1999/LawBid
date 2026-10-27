# Load testing results (docs/06 §9.4)

Scenarios: `loadtest/k6/` (profiles in `loadtest/profiles.json`; the nightly staging run uses the `nightly` profile). Environment: **staging sized like
production** (`infra/envs/staging` with prod task counts and Redis node for
the run), test-mode Stripe, mock SMS with the fixed OTP code.

## Accounts and data for a run

1. Seed 2 000 clients and 2 000 verified attorneys with active
   subscriptions, 20 000 open cases across states/practice areas, 5 000
   pre-acceptance conversations (a seeding script is run on staging only;
   prod data is never copied — docs/06 §6.2).
2. Mint the token file and the fixtures file (`loadtest/scripts/mint.mjs`,
   `loadtest/scripts/discover.mjs`) — for the nightly run keep their content in
   the secrets `STAGING_TOKENS_JSON` and `STAGING_FIXTURES_JSON`.
3. `loadtest/run-local.sh` on the Mac first, then the «Load test» workflow
   (smoke, m1, m10). The suite never requests an SMS code.

## Targets

| Metric | Target |
|---|---|
| Peak throughput | 5 000 RPS |
| p95 reads (feed, search, cases) | < 300 ms |
| p95 writes (bid, message, login, webhook) | < 600 ms |
| Error rate | < 0.5 % |
| Stability | 1 hour at 60 % of peak, no growth in queue age / memory |

## Results

| Date | Build (image tag) | Stage | RPS reached | p95 read | p95 write | Errors | Notes / follow-ups |
|---|---|---|---|---|---|---|---|
| _pending — first run after the staging environment is applied (stage 6.12 acceptance, docs/06 §11.1)_ | | | | | | | |

Keep the raw `k6` summary (`--summary-export`) next to this file as
`YYYY-MM-DD-<stage>.json`.

## Audits (newest first)

- `APP_DEVICE_PERF.md` — on-device app speed suite (cold start, frame jank, tap latency, memory, video start), profile mode, `apps/mobile/tool/perf/run_device_perf.sh <device>`.

- `LOAD_SPEED_AUDIT_6_2026-10-23.md` — hot-path latency, round trips per request, Redis, replica seam, billion-user model; tools in `apps/api/bench`, data in `scripts/ops/user-load-gen.sql`.
- `GROWTH_LADDER_2026-10-23.md` — per growth step (10k … 1B): signal, what to flip, minutes, cost, who (plain Russian).
