# Прибыль и резерв (treasury-setup-needed, treasury-low, treasury-payout-failed, treasury-bank-changed)

**Для владельца.** Деньги платформы (подписки, галочки, продвижение)
приходят на баланс Stripe; Stripe уже взял свою комиссию. Раз в месяц
(по умолчанию 25-го) LawBid делит баланс сам:

1. **«Расходы»** — месяц сервисов (AWS по его прогнозу, база, Twilio,
   Bunny, Apple…) плюс зарплаты и партнёрам, которые платятся из банка →
   на второй банк в Stripe. Карта этого счёта стоит на автоплатежах
   сервисов, поэтому они не падают из-за пустой карты.
2. **Резерв** остаётся на Stripe: зарплаты через Stripe, долги партнёрам,
   запас на возвраты ($200) и подушка 50 % месяца расходов.
3. **«Прибыль»** — всё остальное → основной банк в Stripe (ваша карта).

Сначала оплачиваются расходы. Денег мало — расходы получают сколько есть,
прибыль в этом месяце 0, приходит письмо `treasury-low`.

**Один раз настроить (бесплатно):**
1. Откройте второй бесплатный бизнес-счёт на SIMA LLC (например, Mercury
   или Relay) — это «Расходы». Привяжите его карту к AWS, CockroachDB,
   Twilio, Bunny, Apple, Google, домену.
2. Stripe → Settings → **Bank accounts and scheduling**: добавьте этот счёт
   вторым. Основным (Default) оставьте счёт, куда хотите получать прибыль.
3. Там же **Payout schedule → Manual**. Пока это не сделано, Stripe сам
   переводит всё на основной банк каждый день, и деление не работает.
4. Админка → Деньги → **Прибыль и резерв**: поправьте суммы сервисов,
   если знаете точнее. Переключатель «авто» включён по умолчанию.

**Безопасность.** В админке нельзя добавить, выбрать или вписать банк:
выплаты идут только на банки, которые уже есть в самом Stripe, а туда
можно попасть только с вашим паролем Stripe и 2FA. Суммы считает система,
кнопка «Поделить сейчас» и настройки требуют код 2FA. Если банки в Stripe
поменялись, приходит письмо `treasury-bank-changed`.

**Signal.** Worker job `treasury.daily` (15:40 UTC) logs `alert:` values
`treasury_setup_needed` (Stripe payout schedule not `manual` on the run
day), `treasury_low` (balance below a month of costs + reserve),
`treasury_payout_failed` (Stripe refused or the bank returned a payout),
`treasury_bank_changed` (external accounts fingerprint changed) →
`infra/modules/monitoring` metric filters + alarms.

**Check.** Admin Деньги → Прибыль и резерв (balance, reserve, banks,
payout history). Stripe → Balances → Payouts for the payout itself.

**Act.**
- `treasury-setup-needed` → Stripe payout schedule Manual; this month is
  then split with «Поделить сейчас» (2FA), later months by themselves.
- `treasury-low` → nothing urgent; top the expense card up once if it is
  low. Raising prices or lowering costs is a business decision.
- `treasury-payout-failed` → fix the bank in Stripe; the money stays on the
  balance and goes out on the next split (or press «Поделить сейчас»).
- `treasury-bank-changed` not by the owner → Stripe: remove the unknown
  bank, change the Stripe password, review Team members; turn «авто» off in
  the admin until it is clear.
