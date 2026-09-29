# tx-retries — spike of serialization retries (SQLSTATE 40001)

`withTxRetry` logs `transaction retried` per retry (docs/02 §1.1: up to 5
attempts with jitter). Some retries are normal; a spike means two hot
paths touch the same rows (bid accept on one case, counters).

**Check.** Logs Insights on the api group:
`filter msg = "transaction retried" | stats count() by bin(1m)` and the
CockroachDB Console → Transactions (contention, retries by statement).

**Act.** Usually no immediate action; if the retry budget is exhausted the
request fails with 409/500 and shows on the 5xx board. Long-term: move the
hot update behind a queue (counters already are) or shorten the
transaction. Never raise `maxAttempts` above 5 without a review.
