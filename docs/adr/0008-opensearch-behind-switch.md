---
status: "accepted"
date: 2026-10-24
decision-makers: owner
---

# OpenSearch behind a three-way switch

## Context and problem statement

Search runs on Postgres full-text search. At scale it becomes the bottleneck, and
moving later should not mean rewriting the app.

## Decision drivers

- Pay nothing until needed.
- Authorization must not depend on a possibly stale index.
- Instant, safe rollback.

## Considered options

- Switch `search.engine` = `postgres` | `shadow` | `engine`, OpenSearch as the engine (chosen)
- Meilisearch or Typesense
- Stay on Postgres only

## Decision outcome

Default `postgres`. `shadow`: users get Postgres answers, the engine gets the same
queries silently and differences and timings are logged. `engine`: the engine
finds ids; Postgres still checks permissions, filters and final order. Engine slower than
`search.engine_timeout_ms` (800 ms) or failing falls back to Postgres; five failures in
a row skip it for 30 s. Terraform flag `opensearch_enabled` creates the domain.

### Consequences

- Good: a stale index can never reveal a closed case; app responses are unchanged.
- Bad: dual indexing work (outbox events feed the index); the engine costs money once on.
- Confirmation: `search-switch.provider.spec.ts`, `opensearch-search.provider.spec.ts`; planned alert when search p95 exceeds 300 ms.

## More information

[SEARCH_READY.md](../architecture/SEARCH_READY.md). Back-filled 2026-10-25.
