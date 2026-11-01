# LawBid

US legal-services marketplace: clients post cases, verified attorneys bid,
negotiate, client accepts one bid. Attorneys pay a $399/mo subscription
after verification to unlock client contact info and messaging.

Production-grade target (not an MVP): Flutter mobile client, NestJS API,
PostgreSQL, Stripe billing, Redis/BullMQ, AWS infrastructure, built for
scale (5M+ users / 500k DAU / 5k RPS design target).

> **RULE #1 (most important):** take proven open-source solutions instead of inventing our own — see [`AGENTS.md`](AGENTS.md).
>
> **Before any change:** read [`docs/dev/KNOWN_ERRORS.md`](docs/dev/KNOWN_ERRORS.md) —
> every mistake that already cost a red PR, a failed deploy or a prod outage,
> with the check that prevents it. Add each new one there the same hour.

## Structure
- `apps/mobile` — Flutter client
- `apps/api` — NestJS backend
- `apps/admin` — Next.js admin panel
- `packages/api-contract` — generated shared API client/types
- `infra` — Terraform infrastructure as code
- `docs` — the 7-file technical specification (ground truth) + CHANGELOG
- `docs/archive/` — old plans and the former Cursor rules, kept for history only

## Ground truth
All behavior, schema, and design decisions come from `docs/01`–`docs/07`.
If specs conflict, which file wins per area: DB schema -> 02, case/bid logic ->
04, visuals -> 07. Current rules for helpers: `docs/dev/HELPER_RULES.md`.

## Status
Stage 0 complete (docs, skeleton). Stage 1.1 (NestJS +
Flutter bootstrap) not yet started — see `docs/CHANGELOG.md`.
