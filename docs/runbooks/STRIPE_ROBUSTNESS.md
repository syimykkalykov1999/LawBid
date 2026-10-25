# Stripe robustness (2026-10-27)

**Для владельца (5 строк):**
1. Теперь система сама узнаёт у Stripe правду, прежде чем отменить неоплаченный платёж: оплаченный платёж больше не пропадёт.
2. Все «странные» события Stripe (сорванная выплата адвокату, неудачный возврат, спор с банком, раннее предупреждение о мошенничестве, отключение Stripe) попадают в одну очередь: админка → Деньги → «Проверки Stripe», с таймером срока.
3. При споре с банком сразу собирается пакет доказательств (без текста переписки, только даты и числа) и сохраняется в Stripe черновиком; вы смотрите и отправляете одним кодом 2FA. Выплаты этому адвокату на время спора приостанавливаются.
4. За 5, 2 и 1 день до срока приходит письмо вам и уведомление адвокату; если доля споров за 30 дней подходит к порогу Visa/Mastercard (0,5 % / 1 %), срабатывает тревога.
5. Что включить в Stripe руками — раздел «Что сделать в Stripe» ниже (11 событий вебхука и Smart Disputes). Все числа правятся в админке → Система → Настройки (`stripe_ops.*`).

---

## What changed

| Stripe event | State change | Who is told | Ledger |
|---|---|---|---|
| `payment_intent.payment_failed` | case payment stays pending (the client can retry in the same checkout); decline code saved in `failure_code` | nobody (Checkout shows the error to the client) | none: no money moved |
| `checkout.session.expired` | case payment cancelled **only after Stripe confirms** the session is closed; a paid one is recorded as paid | nobody | none |
| `charge.refund.updated` (failed/canceled) | refund row `failed`, `refunded_cents` and status rolled back | review queue `refund_failed` | `case_payment_refund_reversal` entry mirrors the refund booked at creation (idempotent) |
| `payout.failed` (Connect) | `payout_accounts.last_payout_failure_*` | attorney (payout-account status notice), review queue `payout_failed` | none: the platform books nothing on an attorney's payout |
| `account.application.deauthorized` | payout account `disabled`, charges and payouts off, `deauthorized_at` | attorney, review queue `account_deauthorized` | none |
| `capability.updated` | account re-read from Stripe; a lost capability is queued | review queue `capability_disabled` | none |
| `radar.early_fraud_warning.created` | queued; refunded by itself only if the charge is `<= stripe_ops.efw_auto_refund_max_cents` (default 0 = never) | review queue `early_fraud_warning` | the refund books its own entry |
| `charge.dispute.funds_withdrawn` | `dispute_funds_withdrawn_at` | via the dispute item | none: the loss is booked when the dispute is **lost** (booking at withdrawal would count it twice) |
| `charge.dispute.funds_reinstated` | if a chargeback loss was booked, it is undone: refund row `failed`, `refunded_cents` restored, status back to `succeeded`, `dispute_status = won` | – | `case_payment_refund_reversal` entry (late win) |
| `invoice.upcoming` | subscription re-read from Stripe | nobody (no matching notification text yet) | none |
| `customer.subscription.trial_will_end` | subscription re-read (the app's own reminder job notifies) | – | none |

Platform-level (not Connect) events: a failed refund of a platform charge, an early fraud warning and a dispute open review items with `scope: platform`; the Stripe-side money movement is picked up by the nightly ledger sync (`ledger.reconcile`, unclassified movements go to `suspense`).

## Pull reconcile (never cancel a paid checkout)

* `case-payments.expire` (every 10 min): for pending payments older than 24 h it asks Stripe (`checkout.sessions.retrieve` on the connected account). Paid -> recorded as paid. Open -> `checkout.sessions.expire` first, re-read, then cancel. Stripe error or payment still processing -> **left alone** (`deferred`). Returns `{abandoned, recovered, deferred}`.
* The client's own "cancel" and the "new payment supersedes the old one" paths do the same Stripe check; a late payment can no longer be taken against a payment we show as cancelled.
* `stripe-ops.sweep` (05:45 UTC): re-reads recent payments (setting `stripe_ops.sweep_lookback_days`, default 7): pending/cancelled ones that Stripe says are paid, refunds made in the Dashboard, refunds stuck `pending` for a day, disputes whose webhook never arrived (`reconcile_drift` item). Then the dispute-rate check.

## Durability of the money queue (what survives a Redis failover)

Redis (BullMQ) is only a delivery channel; the truth is Stripe plus our database. Three layers, none needs Redis state:

1. **Stored first.** The webhook intake saves the event row, then queues the job (`jobId` = event id). If Redis is down, Stripe gets a 500 and retries; on the retry the duplicate row is detected and, if it is still unprocessed and no live job exists (`queue.getJob`), the job is queued again (a replay used to be answered 200 and lost).
2. **`stripe-webhooks.requeue` (every minute).** Queues every stored, handled event with `processed_at` null older than 2 minutes (idempotent, jobId = event id; a live job is never doubled). A Redis failover that loses the queue is repaired within minutes.
3. **Pull reconcile** (`case-payments.expire` every 10 min, `stripe-ops.sweep` nightly): re-reads pending payments and subscriptions from Stripe, so even an event Stripe never delivered is recovered from Stripe truth.

## Disputes

* One transaction per dispute event: status, dispute id/reason/amount/deadline, the chargeback refund row and its ledger entry.
* On `charge.dispute.created` (after commit): review item with **Stripe's evidence deadline** as SLA, payout hold, evidence draft.
* **Evidence packet** (Stripe dispute evidence API: `disputes.update` with `evidence[...]`, no `submit` = draft): product description, service date, customer name/e-mail/purchase IP, access/activity log (case dates, message/attachment/call counts), terms acceptance (consent records with time and IP), refund policy, plus a PDF (`service_documentation`). **Chat content is never sent**, only counts and dates (attorney-client privilege). Stripe adds AVS/CVC and its e-mail receipt itself.
* Admin: `GET /admin/stripe-review/disputes/:paymentId/evidence` (preview), `POST .../draft` (rebuild), `POST .../submit` (**one 2FA code**, final). No second admin.
* **Payout hold** (`stripe_ops.hold_payouts_on_dispute`, default on): Stripe payout schedule of that attorney = manual; restored (with the trust delay) when the last open dispute closes.
* **Reminders** (`stripe_ops.dispute_reminder_days`, default 5/2/1): e-mail to super admins and the existing "payment disputed" notice to the attorney.
* **Dispute rate** = disputes / payments over 30 days. Warn at 0.5 % (Visa VAMP non-compliant), alarm at 1 % (VAMP excessive and Mastercard ECM start at 1.5 % and 100 disputes); below `stripe_ops.dispute_rate_min_count` disputes it stays quiet. Alarm = log `alert: dispute_rate` (CloudWatch alarm `*-dispute-rate`) + e-mail.

## Review queue

`GET /admin/stripe-review` (open, most urgent first), `GET .../summary`, `POST .../:id/resolve|dismiss` (one 2FA code, audited). SLA: Stripe's deadline for disputes, otherwise `stripe_ops.review_sla_hours` (24); `sla` is `ok | due_soon | overdue`.

## What to do in Stripe (owner, once)

1. Workbench -> Webhooks: on **both** endpoints (platform and Connect) enable: `payment_intent.payment_failed`, `checkout.session.expired`, `charge.refund.updated`, `payout.failed`, `account.application.deauthorized`, `capability.updated`, `radar.early_fraud_warning.created`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`, `invoice.upcoming`, `customer.subscription.trial_will_end`.
2. Dashboard -> Settings -> Disputes: leave **Smart Disputes** on if offered (Stripe's own AI evidence, fee only when you win, <https://docs.stripe.com/disputes/smart-disputes>). Our draft covers what Smart Disputes does not take.
3. Radar: Stripe documents no automatic EFW-refund switch in the Dashboard (it advises against refunding every EFW); our setting `stripe_ops.efw_auto_refund_max_cents` is the equivalent (Stripe suggests about the dispute fee, e.g. 1500).

## Sources (read 2026-10-25)

* Stripe, "Receive Stripe events in your webhook endpoint" (retries up to 3 days, no ordering guarantee, dedupe by event id, 2xx fast): <https://docs.stripe.com/webhooks>
* Stripe, "Connect webhooks" (`payout.failed`, `account.application.deauthorized`, scopes): <https://docs.stripe.com/connect/webhooks>
* Stripe, "How disputes work" (EFW, funds debited, 7-21 day response window, late wins): <https://docs.stripe.com/disputes/how-disputes-work>
* Stripe, "Use the API to respond to disputes" (`evidence[...]`, file uploads, `submit`): <https://docs.stripe.com/disputes/api>
* Stripe, "Dispute evidence best practices" (what to include, 4.5 MB, 19 pages Mastercard): <https://docs.stripe.com/disputes/best-practices>
* Stripe, "Smart Disputes": <https://docs.stripe.com/disputes/smart-disputes>
* Stripe, "Dispute and fraud card monitoring programs" (Visa VAMP 0.5 % / 1.5 %, Mastercard ECM 1.5 % and 100, HECM 3 % and 300): <https://docs.stripe.com/disputes/monitoring-programs>

## Risks

* If Stripe also emits a `refund_failure` balance transaction for a failed refund, the nightly ledger sync books it to `suspense` in addition to our reversal; the next `ledger.reconcile` shows it as a delta to review (never silent).
* `invoice.upcoming` has no user notification: a new notification type needs an enum migration, push texts and app strings (app look is frozen).
* Auto evidence is built from our records at dispute time; the admin should read the preview before submitting.
