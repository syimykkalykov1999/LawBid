# Events pipeline (N-2, 2026-10-26)

One internal domain-event bus. Features say "this happened" once; analytics, experiments, notifications and search read one stream.

## What exists (checked before building, nothing duplicated)
- `app_event_days` (analytics/app-events): client screen counters, aggregated by day. Different thing, untouched.
- `cross_family_outbox` + inbox (sharding/outbox): the transactional outbox with exactly-once effects. **Reused**: the bus writes through the effect `domain.event.record`.
- `search_outbox`, `case_fanout`, notifications, audit log, case journal: each serves its own purpose and keeps working; they can become bus consumers one by one.

## Design
- `DomainEvents.emit(tx, type, payload)` (typed by `DomainEventMap`) inside the business transaction -> outbox effect -> append-only table `domain_events`. `flush(tickets)` after the commit runs the in-process consumers registered by name (`DomainEventConsumers`).
- Setting `events.sink`: `off` (nothing) | `db` (table) | `stream` (table + Kinesis) | `auto` (DEFAULT: off while no consumer outside the pipeline is registered, i.e. until experiments / analytics read events; then db, and stream above `events.auto_ceiling_per_day`, decided every 5 minutes from a Redis day counter). Hard ceiling `events.max_per_day` (1 000 000) in every mode. Perf review 2026-10-26 R-41.
- Cron `events.maintain` (every 5 minutes, near-free): auto signal, ship unpublished rows to Kinesis (at-least-once, consumers dedupe by `key`), hourly retention (`events.retention_days`, 30).
- Terraform: `growth.events_stream_enabled = false` builds the stream + IAM + `EVENTS_STREAM_NAME`. The Kinesis SDK package is loaded lazily; add `@aws-sdk/client-kinesis` to the API dependencies before turning the stream on.

## Emitting today
`user.signed_up`, `case.created`, `bid.placed`, `payment.succeeded`, `post.published`. The existing ad-hoc calls next to them are unchanged; consumers take them over later.

## Cost
Table: ~0. Kinesis (AWS pricing page, checked 2026-10-25): on-demand Standard has a per-stream hourly charge (about $0.04/stream-hour) plus per-GB; On-demand Advantage (Nov 2025) has no stream charge and about $0.032/GB ingest. Off at launch.

## Research
- microservices.io "Transactional outbox": write the event row in the same transaction, relay separately, at-least-once so consumers must dedupe.
- AWS Kinesis pricing and the Nov 2025 On-demand Advantage announcement.
- (Shopify / Segment / Instagram / Discord / Slack posts were not found by search; not cited.)
