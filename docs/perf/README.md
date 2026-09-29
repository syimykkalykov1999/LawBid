# Load testing results (docs/06 §9.4)

Scenarios: `apps/api/k6/` (README there). Environment: **staging sized like
production** (`infra/envs/staging` with prod task counts and Redis node for
the run), test-mode Stripe, mock SMS with the fixed OTP code.

## Accounts and data for a run

1. Seed 2 000 clients and 2 000 verified attorneys with active
   subscriptions, 20 000 open cases across states/practice areas, 5 000
   pre-acceptance conversations (a seeding script is run on staging only;
   prod data is never copied — docs/06 §6.2).
2. Mint access tokens for a sample of them (`TokenService.signAccessToken`
   from a maintenance shell or the seeding script) into `CLIENT_TOKENS` /
   `ATTORNEY_TOKENS`; export `CASE_IDS`, `CONVERSATION_IDS`.
3. `k6 run -e STAGE=peak apps/api/k6/all.js`, then `-e STAGE=soak`.

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
