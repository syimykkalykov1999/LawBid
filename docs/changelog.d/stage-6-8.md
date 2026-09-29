## Stage 6.8 — Flutter: subscription screens and paywall

docs/06_PRODUCTION.md §13 stage 6.8, §1.7.

### Mobile (`apps/mobile`, feature `subscription`)
- Settings → «Подписка» (attorneys only, docs/01 §3.6): the $399/мес plan
  card (7-day trial line while a trial is still available, what the
  subscription unlocks, no commission), «Текущий статус» with the pill,
  the explanation line (trial end / next charge / scheduled cancellation
  / grace period) and the actions that fit the status — «Управление»
  (Stripe Customer Portal in the in-app browser), «Отменить» (confirm
  dialog, `cancel_at_period_end`), «Обновить карту» on `past_due` with
  the payment-failed notice, «Обновить» while `incomplete` — plus the
  payment history entry. Loading/error/offline via the shared detail
  states; pull-to-refresh; a refresh on app resume so a change made in
  the portal or by a webhook shows up.
- Start flow (§1.4): `POST /subscriptions/start` → `flutter_stripe`
  PaymentSheet in setup mode (3-D Secure included) → `POST
  /subscriptions/confirm` → polling `GET /subscriptions/me` while
  `incomplete`. No trial (account or card): the honest «Пробный период
  недоступен, будет списано $399 сейчас» dialog, and `chargeNow` only
  after that consent (§1.1). The button is disabled with an explanation
  and a link to verification until the attorney is `verified`.
  `SubscribeController` is the one state machine (starting → card →
  confirming → syncing); the Stripe SDK sits behind `CardCollector`, so
  screens and tests never touch the platform channel.
- Paywall (§1.7 п.3): `/subscription-required?reason=bid|chat|contacts`
  names the locked action («Сделать бид», «Написать клиенту», «Контакты
  клиента») and leads to the subscription screen; the docs/04 gates
  (`routeSubscriptionError`, the chat composer, the contacts card) pass
  their reason. The stage-4 placeholder screen is removed.
- «История платежей» (§1.7 п.4): cursor-paged list from
  `GET /subscriptions/payments` with amount, date, status and the failure
  code of a failed charge.
- Strings `file06_strings.dart` (ru/en); `ApiErrorCodes` now mirrors the
  whole server enum again (admin/moderation/webhook codes added, texts
  for `CONTENT_BLOCKED`, `PAYLOAD_TOO_LARGE` and the subscription codes).
- Android: the activity theme is an `AppCompat` descendant (a
  `flutter_stripe` requirement for the PaymentSheet); same window
  backgrounds, `FlutterFragmentActivity` was already in place.
  `STRIPE_PUBLISHABLE_KEY` (dart-define) is applied lazily on the first
  card sheet, so app start-up is unchanged.

### Tests
- Repository mapping against the fake HTTP adapter, the subscribe state
  machine (trial, consent before/after the card, cancel, polling window,
  failures, double tap), and the screens' states (skeleton, offline +
  retry, disabled CTA, trial start, charge-now dialog, payment failed,
  cancel, ended, incomplete, dark + 200 % text, paywall, payments).
