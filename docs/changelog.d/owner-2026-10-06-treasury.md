## Owner 2026-10-06 — Profit and reserve (only net profit to the owner's card)

The platform's Stripe balance is split once a month by itself: a month of
expenses to the expense bank, a reserve kept on Stripe, the rest to the
owner's bank. Switch «авто» on by default (admin Деньги → Прибыль и резерв).

### API
- `treasury.daily` cron (15:40 UTC): payout statuses from Stripe, a change
  of the banks in Stripe → `alert: treasury_bank_changed`, and on
  `treasury.payout_day` (default 25, a missed day runs the next day) the
  split: «Расходы» = active `treasury_expenses` (AWS = max(entry, this
  month's AWS budget forecast)) + payroll paid from the bank (+ owed
  commissions when Stripe payroll is off) → the one non-default bank in
  Stripe; reserve = Stripe payroll + owed commissions (Stripe payroll on)
  + `treasury.refund_buffer_usd` + `treasury.buffer_percent` of a month of
  everything; «Прибыль» = the rest above `treasury.min_profit_usd` →
  Stripe's default bank. Expenses first; a short balance logs
  `alert: treasury_low`. Payout failures log `alert: treasury_payout_failed`;
  Stripe payouts not on Manual log `alert: treasury_setup_needed`.
- Automatic pay day (owner 2026-10-06): `treasury.payroll_auto` (on),
  `treasury.payroll_day` (1), `treasury.payroll_warn_days` (5). In the same
  daily job, before the split: on the pay day the dollar payroll linked to
  Stripe (flag `payroll_stripe_payouts`) is paid like «Выплатить» with
  method Stripe and note «Авто» (salary once a month + pending
  commissions), from the reserve on Stripe. A Stripe balance below what is
  due logs `alert: payroll_funds_low` once, `payroll_warn_days` before,
  and on the pay day (nothing sent; retried daily). Refused transfers log
  `alert: payroll_auto_failed`. People not linked are listed (paid by
  hand). `AdminPayrollCoreModule` split out for the worker.
- Security: no bank is added, picked or typed in LawBid — the destinations
  are the banks in Stripe itself; amounts are computed server-side; the
  expense payout goes out at most once a month; one run at a time (Redis
  lock); settings and «Поделить сейчас» need a fresh 2FA code; `treasury.*`
  keys are hidden from the generic Система → Настройки editor.
- Admin: `GET /admin/treasury`, `PUT /admin/treasury/settings`,
  `POST /admin/treasury/run`, `POST|PATCH|DELETE /admin/treasury/expenses`
  (area `money`; audited).
- Migration `20261006100000_owner_treasury`: `treasury_expenses` (seeded
  with estimates), `treasury_payouts`.

### Admin
- Деньги → «Прибыль и резерв»: one-time Stripe steps, balance, reserve
  and how many months it covers, next split and its amounts, where the
  money goes (banks from Stripe), monthly expenses (editable) and computed
  lines (salaries, partners, refunds), «Зарплаты сами» (switch, pay day,
  warn days, next pay date and sum, enough on Stripe or not, who is paid
  by hand), settings, «Поделить сейчас», history.

### Infra / docs
- CloudWatch metric filters + alarms for the four `treasury_*` and two
  `payroll_*` alerts
  (plain-language e-mails). Runbook `docs/runbooks/treasury.md`; OWNER.md.
