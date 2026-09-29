# api-5xx-ratio — 5xx share above 1 % for 5 minutes

**Signal.** CloudWatch `HTTPCode_Target_5XX_Count / RequestCount` on the
api target group. Dashboard: *API health → 5xx share*.

**Check.**
1. Is it one route or all? CloudWatch Logs Insights on `/lawbid/<env>/api`:
   `fields @timestamp, req.url, res.statusCode, err.message | filter res.statusCode >= 500 | stats count() by req.url`.
2. Sentry: new issue since the last deploy? (release = image tag).
3. `/health/ready` on the ALB: 503 means DB or Redis — go to
   [db-redis-unavailable.md](db-redis-unavailable.md).
4. Did a deploy just happen (Actions → Deploy)? A bad revision is rolled
   back by the ECS circuit breaker; check the service events.

**Act.**
- Regression from a deploy → `workflow_dispatch` Deploy with the previous
  `image_tag` (redeploys that image; migrations are idempotent).
- One provider failing (Stripe, Twilio, SES) → the endpoint already
  degrades (CostGuard / provider errors are 5xx only when unexpected);
  check the provider status page, no action beyond a Sentry note.
- Overload (CPU > 85 %, queue growth) → [ecs-capacity.md](ecs-capacity.md).

**Escalate.** Still > 1 % after 15 minutes with no cause → owner + the
backend engineer on duty; consider putting the WAF rate rule lower.

**After.** Post-mortem note in `docs/runbooks/incidents/<date>.md`;
add a test for the failing route.
