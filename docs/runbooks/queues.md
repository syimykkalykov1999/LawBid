# queue-backlog — oldest waiting job older than 5 minutes

> **Для владельца:** Админка → Система → Здоровье системы → «Перезапустить фоновые задачи», если не прошло за 15 минут. Все письма и кнопки: [OWNER.md](OWNER.md).

Metric from the `ops.queue-metrics` job (worker log → `QueueWaiting`,
`QueueOldestAgeSeconds` per queue). Queues: `cron` (the schedules run on
four lanes: `cron-fast`, `cron`, `cron-heavy-frequent` — the heavy jobs
that run more often than hourly — and `cron-heavy`), `push`, `files`,
`stripe-webhooks`, `stripe-webhooks-dlq`, `subscriptions`,
`case-history-export`, `data-export`, `account-deletion`,
`media-moderation`, `channel-fanout`, `admin-broadcast`.

## Other alarms of this page (queues hardening, 2026-10-25)

- `queue-backlog-slow` — the oldest job of a *slow lane* (`cron-heavy`,
  `cron-heavy-frequent`, `account-deletion`, `channel-fanout`, `admin-broadcast`) waited over an
  hour. These lanes are left out of the 5-minute alarm on purpose (a big
  fan-out or a heavy recompute legitimately waits). Same checks as below.
- `queue-failed-critical` — a job of `data-export`, `case-history-export`,
  `account-deletion`, `stripe-webhooks`, `subscriptions`, `files` or
  `media-moderation` used up its retries in the last 5 minutes. **Admin →
  Система → Здоровье системы → «Повторить упавшие задачи»** retries them
  (BullMQ `retryJobs`, up to 200 per queue per press) and replays the
  Stripe dead letters. Needs a fresh 2FA code; the action is audited.
- `queue-failed-many` — 10 or more failed jobs in 5 minutes in one queue:
  a handler is broken. Read the worker log for `job failed`, fix, then retry.

**Check.**
1. *Queues & workers* board: which queue? Is `worker` CPU high or is the
   worker service down (0 running tasks)?
2. Worker logs for repeated failures of one job type (BullMQ retries with
   backoff; a poison job shows as attempts climbing).
3. Redis memory (BullMQ lives there) — [redis.md](redis.md).

**Act.**
- Worker down → ECS service events; force a new deployment of `worker`.
- Slow consumer → raise `worker_max_tasks` (Terraform) or the queue's
  concurrency (code) after checking the provider (FCM, S3, Stripe) is not
  the bottleneck.
- Poison job → inspect with `Queue.getFailed()` from a maintenance shell,
  fix the cause, `retryJobs`.
- `stripe-webhooks-dlq` growing → [stripe-webhooks.md](stripe-webhooks.md).

## A cron job stopped, skipped or without a good run (batch D, 14.11)

- `cron job stopped: lock lost` (`metric: cron_lock_lost`): the job's Redis
  lock vanished (Redis restart / failover) or BullMQ could not renew its own
  job lock. The run is stopped at its next database call, so it never runs
  next to the copy that started meanwhile. Nothing to do; many in a row =
  look at Redis.
- `cron job stopped: time limit` (`metric: cron_timeout`): a run went past
  its limit (`ops.cron_timeout_mode`, default «Авто» = 10× its longest recent
  good run, at least an hour; no limit before the first good run). It is
  stopped and its lane takes the next job; the BullMQ job fails (retried if
  hourly or slower). A job that legitimately grew: raise
  `ops.cron_timeout_auto_factor` or give it its own minutes in
  `ops.cron_timeout_minutes` (mode «Вкл»).
- `cron job skipped` (`metric: cron_skipped`, `reason`, `streak`): a job
  that runs more often than hourly did not run this tick (first skip, then
  every `ops.cron_skip_log_every`-th); `cron job runs again after skips`
  ends the streak.
- «Очереди задач» red with `detail.staleJobs`: a job had no good run for
  `ops.cron_stale_periods` of its periods (last good run per job: Redis hash
  `ops:cron:runs`, also in `detail.lastSuccess`). Read the worker log for
  that job name.
