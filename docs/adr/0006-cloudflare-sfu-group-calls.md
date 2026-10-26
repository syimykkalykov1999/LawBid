---
status: "accepted"
date: 2026-10-24
decision-makers: owner
---

# Cloudflare Realtime (TURN and SFU) for calls

## Context and problem statement

Group calls were a mesh: each phone sends its video to every other phone, so the
cap was 9 and phones overheat. Our own coturn server was also something to run.

## Decision drivers

- Phone sends video once; 20 to 50 people possible.
- Price: 0.05 USD per GB sent to participants, first 1000 GB per month free (shared by TURN and SFU), as read from Cloudflare pricing on 2026-10-24.
- Keep our own Flutter call screens, CallKit and "ongoing call" UI.
- A Cloudflare failure must never drop a call.

## Considered options

- Cloudflare Realtime SFU (bare SFU) plus Cloudflare TURN (chosen)
- Cloudflare RealtimeKit (no Flutter SDK)
- LiveKit (code and Terraform module kept as a dormant alternative)
- Stay on mesh with own coturn

## Decision outcome

`calls.video_provider` setting: `p2p` (default, mesh), `cloudflare`, or LiveKit.
Own coturn removed (`turn_enabled=false`). Max people in an SFU call is
`calls.sfu_max_participants` (20). If Cloudflare fails, 2 to 4 people fall back to mesh.

### Consequences

- Good: one setting to switch on or roll back in seconds; no servers to patch.
- Bad: vendor dependency for calls; usage must be watched (alert planned at 700 of 1000 GB via Cloudflare GraphQL analytics).
- Confirmation: SLO alarms for call success (95 percent), `cloudflare-sfu.spec.ts`, `sfu-broker.spec.ts`, load test profile "calls".

## More information

[GROUP_CALLS_CLOUDFLARE_SFU.md](../architecture/GROUP_CALLS_CLOUDFLARE_SFU.md), [TURN.md](../runbooks/TURN.md), [VENDORS.md](../runbooks/VENDORS.md). Back-filled 2026-10-25.
