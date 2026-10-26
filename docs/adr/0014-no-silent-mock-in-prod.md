---
status: "accepted"
date: 2026-09-27
decision-makers: owner
---

# Provider switches never fall back to a mock in production

## Context and problem statement

Owner wish: "when real keys appear I paste them one by one and everything works".
But a silent mock SMS or e-mail provider in production would look healthy while
sending nothing.

## Decision drivers

- Keys can be pasted at any time (admin Integrations or environment).
- A deployed environment must fail loudly, not pretend.

## Considered options

- `auto` mode: real provider when all its credentials exist, mock only outside deployed envs; missing credentials fail boot in staging and production (chosen)
- Always mock when keys are missing
- Real provider only, no mock

## Decision outcome

`apps/api/src/config/provider-selection.ts`: `SMS_PROVIDER` (`auto`|`mock`|`twilio`) and
`EMAIL_PROVIDER` (`auto`|`mock`|`ses`). With `NODE_ENV` of `staging` or `production`
the mock is never allowed, even by `auto`; `env.schema.ts` turns the missing variables
into boot errors.

### Consequences

- Good: no silent mock in prod; dev and CI work without keys.
- Bad: a missing key blocks a deploy (by design); run `self-check` after changing keys.
- Confirmation: `provider-selection.spec.ts`, `env.schema.spec.ts`.

## More information

[KEYS_SETUP.md](../KEYS_SETUP.md), [VENDORS.md](../runbooks/VENDORS.md). Back-filled 2026-10-25.
