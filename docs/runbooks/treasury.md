# Прибыль и резерв (treasury-setup-needed, treasury-low, treasury-payout-failed, treasury-bank-changed, payroll-funds-low, payroll-auto-failed)

**Для владельца.** Деньги платформы (подписки, галочки, продвижение)
приходят на баланс Stripe; Stripe уже взял свою комиссию. Раз в месяц
(по умолчанию 25-го) LawBid делит баланс сам:

1. **«Расходы»** — месяц сервисов (AWS по его прогнозу, база, Twilio,
   Bunny, Apple…) плюс зарплаты и партнёрам, которые платятся из банка →
   отдельной выплатой «LawBid expenses» на тот же банк в Stripe (Stripe
   принимает только один долларовый счёт). Эту сумму вы переводите на
   счёт, чья карта стоит на автоплатежах сервисов (лучше автоперевод в
   банке раз в месяц), поэтому сервисы не падают из-за пустой карты.
2. **Резерв** остаётся на Stripe: зарплаты через Stripe, долги партнёрам,
   запас на возвраты ($200) и подушка 50 % месяца расходов.
3. **«Прибыль»** — всё остальное → основной банк в Stripe (ваша карта).

Сначала оплачиваются расходы. Денег мало — расходы получают сколько есть,
прибыль в этом месяце 0, приходит письмо `treasury-low`.

**Зарплаты сами.** В день выплаты (по умолчанию 1-го) сотрудники,
подключившие свою ссылку Stripe, получают зарплату и начисления из
запаса на Stripe — так же, как кнопка «Выплатить» в «Зарплаты», один раз
в месяц на человека. За 5 дней до этого, если на Stripe меньше, чем
нужно, приходит письмо `payroll-funds-low`; в сам день выплаты без денег
ничего не уходит, система проверяет снова каждый день. Кто без Stripe,
показан списком — им платите сами. Включается флагом
`payroll_stripe_payouts` (Система → Функции) и ключами Stripe.

**Один раз настроить (бесплатно):**
1. Stripe → Settings → **Bank accounts and scheduling → Payout schedule
   → Manual**. Пока это не сделано, Stripe сам переводит всё на банк
   каждый день, и деление не работает.
2. В своём банке поставьте ежемесячный автоперевод (после 25-го) на
   счёт, чья карта платит за AWS, базу, Twilio, Bunny, Apple, Google,
   домен — на сумму «Расходы» из админки. Или переводите выплату
   «LawBid expenses» вручную, когда она придёт.
3. Админка → Деньги → **Прибыль и резерв**: поправьте суммы сервисов,
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
`treasury_bank_changed` (external accounts fingerprint changed),
`payroll_funds_low` (Stripe available < payroll due, `treasury.payroll_warn_days`
before and on `treasury.payroll_day`), `payroll_auto_failed` (a Stripe
transfer of the automatic pay day was refused) →
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
- `payroll-funds-low` → wait for incoming money or top up the Stripe
  balance; the pay day retries daily until it can pay everyone.
- `payroll-auto-failed` → Зарплаты → history: the person reopens their
  Stripe link and fixes the bank; then «Выплатить» (or wait for next month).
- `treasury-bank-changed` not by the owner → Stripe: remove the unknown
  bank, change the Stripe password, review Team members; turn «авто» off in
  the admin until it is clear.
