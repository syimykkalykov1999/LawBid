# queue-backlog — oldest waiting job older than 5 minutes

Metric from the `ops.queue-metrics` job (worker log → `QueueWaiting`,
`QueueOldestAgeSeconds` per queue). Queues: `cron`, `push`, `files`,
`stripe-webhooks`, `stripe-webhooks-dlq`, `subscriptions`,
`case-history-export`, `data-export`.

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
