# Automation principle (owner, 2026-10-05)

LawBid runs with the smallest possible staff. People are hired for one job only:
checking attorneys' documents (and, later, a 24/7 support chat). Everything else
is automatic by default.

## Rules

1. **Every manual admin step has an "auto" switch, on by default.** When the
   owner wants a human in the loop, they switch the queue back on in the admin
   (Система → Настройки). Code never hard-codes "needs manual approval".
2. **The exception is attorney verification.** Attorney documents are checked by
   people (`verification.require_bar_document`, `verification.require_identity`
   send requests to the verifier queue; self-attestation is auto-approved via
   `verification.self_attestation_auto_approve`).
3. **Paid features are plan terms, not code.** Anything a plan can include or
   limit lives in the entitlement catalog
   (`apps/api/src/modules/plans/entitlement-catalog.ts`) and is checked through
   `EntitlementsService` only. A catalog key exists only when the feature is
   built and the check is in place with an e2e test; the admin assembles plans
   in Деньги → Планы and every toggle takes effect for subscribers at once.

## Switches today

| Step | Setting | Default |
|---|---|---|
| Client gold badge request | `verification.client_badge_auto_approve` | on (approved on upload; staff can revoke) |
| Attorney self-attestation | `verification.self_attestation_auto_approve` | on |
| Undecided review appeals removed after 30 days | `reviews.auto_remove_undecided_appeals` | off (decided 2026-10-01, Google-style) |
| Content hidden after N reports | `moderation.auto_hide_reports` | 3 |
| Client suspended after N confirmed contact reports | `contacts.suspend_after_confirmed_reports` | 3 |
| Referral rewards | automatic (`qualify` → `tryReward`) | on |

Steps that stay manual by nature: refunds, data (privacy) requests, support
tickets, content takedowns, disputes. Each already has a queue in the admin.

## Plan terms (entitlement catalog)

Attorneys: included/max assistant seats, extra seat price, bids in any state,
max active bids, priority in search, trial days. Clients: verification badge,
priority in the case feed, max active cases, case promotion. Both: in-app calls,
chat translation (+ translations per day), video posts (+ videos per day),
posts per day. Values live in the DB; `attorney_free` / `client_free` describe
an account without a subscription.
