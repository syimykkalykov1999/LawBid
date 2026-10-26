---
status: "accepted"
date: 2026-10-24
decision-makers: owner
---

# Cloudflare R2 for public media, behind a switch

## Context and problem statement

Avatars, post and review photos and stickers are served to many people; S3 plus
CloudFront charges for outgoing traffic. Private content must stay on AWS.

## Decision drivers

- R2 has no egress fee.
- Private content (chat, case files, verification documents) needs KMS, Macie, signed links.
- Reversible without a data move.

## Considered options

- R2 for public kinds only, `media.public_store` switch, default `aws` (chosen)
- Everything on S3 and CloudFront
- Everything on R2

## Decision outcome

Public kinds may go to R2 (public bucket on our own domain, behind the Cloudflare
cache). Each file row stores its bucket name, so old files keep loading after any
flip. A private file kind physically cannot reach R2 (tested). Videos stay on Bunny.
Rollback: set `media.public_store` back to `aws`.

### Consequences

- Good: cheaper delivery of the biggest traffic class.
- Bad: needs the domain's DNS in Cloudflare (done as DNS only, grey cloud); a second storage code path; old app versions keep uploading to AWS.
- Confirmation: `files.policy.r2.spec.ts`, `r2-public-store.spec.ts`, `scripts/ops/verify-r2-media.sh`.

## More information

[R2_PUBLIC_MEDIA.md](../architecture/R2_PUBLIC_MEDIA.md), [DNS_TO_CLOUDFLARE.md](../runbooks/DNS_TO_CLOUDFLARE.md). Back-filled 2026-10-25.
