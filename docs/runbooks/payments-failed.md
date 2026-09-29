# payments-failed — spike of failed subscription charges

`subscription payment failed` per failed invoice (past_due + 3-day grace,
docs/06 §1.2–1.5). > 20 per hour is unusual for the current volume.

**Check.** Stripe Dashboard → Payments: decline codes (`card_declined`
vs `authentication_required`); a Stripe incident; a price/tax change.

**Act.** Nothing user-facing is required — attorneys already get the
`subscription_payment_failed` notice and «Обновить карту». If Stripe is at
fault, extend affected subscriptions from the admin (finance role, audited)
once it is over. If it is our webhook handling, see
[stripe-webhooks.md](stripe-webhooks.md).
