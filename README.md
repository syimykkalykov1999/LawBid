# LawBid

US legal-services marketplace: clients post cases, verified attorneys bid,
negotiate, client accepts one bid. Attorneys pay a $399/mo subscription
after verification to unlock client contact info and messaging.

Production-grade target (not an MVP): Flutter mobile client, NestJS API,
CockroachDB, Stripe billing, Redis/BullMQ, AWS infrastructure, built for
scale (5M+ users / 500k DAU / 5k RPS design target).

## Structure
- `apps/mobile` — Flutter client
- `apps/api` — NestJS backend
- `apps/admin` — Next.js admin panel
- `packages/api-contract` — generated shared API client/types
- `infra` — Terraform infrastructure as code
- `docs` — the 7-file technical specification (ground truth) + CHANGELOG
- `.cursorrules` — mandatory rules for any AI-assisted work in this repo

## Ground truth
All behavior, schema, and design decisions come from `docs/01`–`docs/07`.
If specs conflict, `.cursorrules` defines which file wins per area
(DB schema -> 02, case/bid logic -> 04, visuals -> 07).

## Status
Stage 0 complete (`.cursorrules`, docs, skeleton). Stage 1.1 (NestJS +
Flutter bootstrap) not yet started — see `docs/CHANGELOG.md`.
