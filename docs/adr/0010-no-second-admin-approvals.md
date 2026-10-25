---
status: "accepted"   # in code since PR #336 (admin.dual_control = false by default)
date: 2026-10-25
decision-makers: owner
---

# No second-admin approvals for money actions

## Context and problem statement

On 2026-10-22 we added a "second admin confirms" flow (`AdminApproval`,
setting `billing.dual_approval_min_cents`, default 500 USD) for payroll, partner
payouts, bonuses and subscription refunds. The company has one person (owner)
plus Claude, so there is no second human admin to approve.

## Decision drivers

- A flow nobody can complete blocks the owner or tempts him to raise the limit to infinity.
- Other safeguards already exist: mandatory TOTP for every admin, a fresh 2FA code before money actions, audit log, payouts only to banks already inside Stripe, Stripe Manual payout schedule.

## Considered options

- Remove the second-admin step, keep 2FA code and audit log (chosen)
- Keep it and set the limit very high
- Keep it and hire a deputy admin

## Decision outcome

Owner decision 2026-10-25: no second-admin approvals. Money actions need the
acting admin's fresh 2FA code and are written to the audit log.

### Consequences

- Good: the owner can act alone; fewer stuck requests.
- Bad: one compromised admin account plus its authenticator can move money up to Stripe-side limits. Mitigation: keep admin accounts few, Stripe payout destinations locked in Stripe, treasury alarms (`treasury-bank-changed`).
- Revisit when a second human admin exists: write a new ADR that supersedes this one.
- **Status of the code (PR #336, merged 2026-10-25):** the setting `admin.dual_control` (default `false`) gates the whole maker-checker flow. While it is false, `AdminApprovalsService.gate()` runs every approval kind at once for the asking admin after a fresh 2FA step-up and writes the audit row; the `admin_approvals` table and the «Требуют подтверждения» screen stay in the code for a future second admin. New approval kinds added by later PRs (replica / partition buttons, fraud review, payouts) follow the same rule: direct with 2FA, never waiting for someone else.

## More information

[OWNER.md](../runbooks/OWNER.md) (section "Подтверждение вторым админом" — describes the optional flow behind the setting), `apps/api/src/modules/admin-auth/admin-approvals.service.ts` (`gate()`), `app-settings.defaults.ts` (`'admin.dual_control': false`). Back-filled 2026-10-25, updated the same day after PR #336.
