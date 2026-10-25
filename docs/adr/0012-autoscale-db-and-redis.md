---
status: "accepted"
date: 2026-10-24
decision-makers: owner
---

# Database and Redis grow and shrink by themselves

## Context and problem statement

Fixed big instances waste money; fixed small ones fall over under load. The owner's
scaling rule: start cheapest, grow and shrink automatically, ceiling set in the admin.

## Decision drivers

- Never pay for empty capacity.
- No code change when the size changes.
- Owner is told by e-mail, never has to press anything.

## Considered options

- Small Lambda on a 5-minute schedule that steps the instance up or down one size (chosen)
- Aurora Serverless
- Manual resizing

## Decision outcome

`infra/modules/db-autoscale` and `redis-autoscale` (flags `db_autoscale_enabled`,
`redis_autoscale_enabled`, on in prod). Grow one size when CPU above 70 percent, free memory
under 10 percent, or connections above 80 percent hold 10 to 15 minutes. Shrink one size at
03:30 Chicago time only after 72 quiet hours. Redis runs with `noeviction`, so memory
above 75 percent also grows it. The admin "Economy" button moves along the same ladder.

### Consequences

- Good: cost follows load; e-mails explain each move.
- Bad: a resize causes a short failover; Multi-AZ keeps it brief. Autoscale cannot fix a
  bad query or the single-database ceiling (see ADR-0003).
- Confirmation: `db-autoscale-errors` and `redis-autoscale-errors` alarms.

## More information

[DB_AUTOSCALE.md](../architecture/DB_AUTOSCALE.md), [REDIS_AUTOSCALE.md](../architecture/REDIS_AUTOSCALE.md), runbooks `db-autoscale.md`, `redis-autoscale.md`. Back-filled 2026-10-25.
