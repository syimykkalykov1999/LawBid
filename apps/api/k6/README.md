# k6 load scenarios (docs/06 §9.4)

Targets: **5k RPS peak**, **p95 reads < 300 ms**, **p95 writes < 600 ms**,
**errors < 0.5 %**, **1 hour stable** — on staging sized like production.
Results go to `docs/perf/` (template there).

```sh
brew install k6            # or the k6 Docker image
export BASE_URL=https://api.staging.lawbid.app/api/v1
export WS_URL=wss://api.staging.lawbid.app
# tokens minted for load accounts (see docs/perf/README.md → "Accounts"):
export CLIENT_TOKENS='["<jwt>", ...]'   ATTORNEY_TOKENS='["<jwt>", ...]'
export CASE_IDS='["<uuid>", ...]'       CONVERSATION_IDS='["<uuid>", ...]'
export STRIPE_WEBHOOK_SECRET=whsec_...  # staging test-mode secret

k6 run apps/api/k6/feed.js                     # one scenario
k6 run -e STAGE=soak apps/api/k6/all.js        # every scenario, 1 hour
```

| Script | Flow | Kind |
|---|---|---|
| `feed.js` | `GET /feed` (posts), scroll by cursor | read |
| `search.js` | `GET /search/cases`, `/search/attorneys`, `/search/posts` | read |
| `attorney-cases.js` | `GET /cases` (filtered feed) + `GET /cases/:id` | read |
| `bid.js` | `POST /cases/:id/bids` (idempotent key per VU) | write |
| `chat.js` | `POST /conversations/:id/messages` + Socket.IO connect/subscribe | write + ws |
| `otp-login.js` | `POST /auth/otp/request` → `/auth/otp/verify` (fixed code, staging) | write |
| `webhooks.js` | `POST /webhooks/stripe` signed with the staging secret | write |
| `all.js` | the above as parallel scenarios; `STAGE=smoke|peak|soak` | mixed |

Every script exports the same `thresholds` (`lib/config.js`): p95 by kind,
error rate, and `checks` > 99.5 %. Write flows use disposable load
accounts and staging Stripe test mode only — never production.
