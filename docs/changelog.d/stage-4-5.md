## Stage 4.5 — Bid acceptance and client contacts (API)

docs/04_CASES_BIDS.md §16 stage 4.5, §7–§9.

- `POST /bids/:id/accept` (`bids/acceptance/BidAcceptanceService`): one
  `withTxRetry` transaction — `SELECT … FOR UPDATE` on the case row, then
  the bid row; case `open` is checked first so the loser of a race gets
  `CASE_INVALID_STATE`; turn/state via `BidStateMachine`; §7 step 2
  re-check (attorney verified, verified license in a case state,
  `SubscriptionAccessService.isActive(…, tx)`) — otherwise the transaction
  rolls back, the bid is `system_withdraw`n in its own transaction and the
  client gets `BID_ATTORNEY_INACTIVE`. Then: bid/offer `accepted`, case
  `in_progress` + `accepted_bid_id`, every other active bid
  `rejected_auto` (offers `superseded`), conversation upserted `active` +
  `contacts_unlocked`, other `pre_acceptance` chats on the case `closed`,
  one append-only `contact_disclosures` row (fields, IP, device), journal
  `bid_accepted` / `contacts_disclosed` / `bid_rejected` per loser,
  notifications (`bid_accepted` or `offer_accepted`, `bid_rejected`) in the
  same transaction. Idempotency-Key supported.
- `GET /cases/:id/bids` (client owner's bid list, §5.2).
- `GET /cases/:id/contacts` (accepted attorney only; `SUBSCRIPTION_REQUIRED`
  while the subscription is inactive, opens again on renewal without a
  second disclosure row, §8.3); `POST /cases/:id/contact-issues` (§8.4).
- `POST /admin/contact-issues/:id/resolve` (support/moderator/super_admin,
  audit_log): `contact_issue_update` to both sides, `moderation_notice` on
  `confirmed`, client suspended at `contacts.suspend_after_confirmed_reports`
  (default 3).
- New error codes (API enum, mobile `ApiErrorCodes`, en/ru,
  `pending_keys/stage-4-5.csv`): `BID_ATTORNEY_INACTIVE`, `CONTACTS_LOCKED`,
  `CONTACT_ISSUE_ALREADY_OPEN`, `CONTACT_ISSUE_INVALID_STATE`.

Tests: e2e `stage-4-5.e2e-spec.ts` 4/4 (parallel accepts — exactly one
wins, stable 3/3 re-runs; auto-reject, in_progress, gone from feed,
journal rows, single disclosure; contacts subscription gate; inactive
attorney; suspension on the 3rd confirmed report); stages 4.1–4.4 e2e
43/43; API unit 689/689; flutter test 583/583, analyze 0 errors/warnings.
