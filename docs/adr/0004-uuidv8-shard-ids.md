---
status: "accepted"
date: 2026-10-24
decision-makers: owner + Claude
---

# UUIDv8 identifiers that carry the shard

## Context and problem statement

Ids were random UUIDv4 from `gen_random_uuid()`: no shard information and poor
index locality. To route a request we would need a lookup table on every query.

## Decision drivers

- No hot global directory (id to shard) on every query.
- Keep the column type `uuid`: no type migration, no client change.
- Time-ordered ids for better index locality.

## Considered options

- App-generated UUIDv8: 48-bit ms timestamp, version nibble, 12-bit logical shard, random (chosen)
- 64-bit Instagram-style ids
- Directory table id to shard

## Decision outcome

UUIDv8 with the shard embedded; `shardOf(id)` reads it from any id. Children
inherit the parent's shard. Global ids use shard 0. We use 256 of 4096 possible shards.
The DB default `gen_random_uuid()` stays as a fallback; a BEFORE INSERT trigger
(`lawbid_shard_fill`) fills `shard_id` when code did not.

### Consequences

- Good: routing needs no lookup; ids sort by time.
- Bad: a legacy v4 id has no shard inside, so `shardOf` is wrong for old seed/demo rows; re-key them before the first real split.
- Confirmation: `shard-id.spec.ts`, `shard-id-column.spec.ts`, `shard-triggers.e2e-spec.ts`.

## More information

[SHARDING_READY.md](../architecture/SHARDING_READY.md) section 4; code `apps/api/src/sharding/shard-id.ts`. Back-filled 2026-10-25.
