## Stage 5.5 — Follows and suggestions (API)

docs/05 §16 stage 5.5, §6.

- `modules/follows`: `POST/DELETE /attorneys/:id/follow` — attorneys only,
  never yourself (`FOLLOW_NOT_ALLOWED` 422); idempotent; `followers_count`
  / `following_count` via the counter aggregator; `new_follower`
  notification only when a row was created; §13 `follow` limit.
- `GET /attorneys/:id/followers` lists attorney followers only (clients are
  counted, never named); `GET /attorneys/:id/following` — both 404 unless
  the id is an active, non-suspended attorney, so a client's follows are
  never listable by others.
- `GET /users/me/following` — the caller's own follows (§6.2).
- `GET /suggestions/attorneys` — verified attorneys ranked by rating and
  activity (posts in 30 days), the client's own state first; the pool is
  cached in Redis per state for 10 minutes; followed and self are filtered
  out per request.
- Public attorney profile: `isFollowing`, counters overlay pending
  aggregator deltas.

Tests: e2e `stage-5-5.e2e-spec.ts` 3/3; unit 703/703.
