## Owner 2026-10-27 — Stripe robustness

11 more Stripe events handled (failed payment/refund/payout, expired checkout,
disconnect, capability, early fraud warning, dispute funds moved, upcoming
invoice, trial ending); pull reconcile before any cancel (never cancels a paid
checkout) plus a nightly sweep; disputes in one transaction with an automatic
evidence DRAFT in Stripe (admin submits with one 2FA code), payout hold while a
dispute is open, deadline reminders and a dispute-rate alarm; a unified review
queue at `/admin/stripe-review`. Runbook: `docs/runbooks/STRIPE_ROBUSTNESS.md`.
Migration `20261027400000_stripe_robustness`; jobs 67 -> 69.
