## Stages 4.9 / 4.10 — Flutter: cases & bids for clients and attorneys

docs/04_CASES_BIDS.md §3, §4, §5, §6, §8, §11, §12 (`apps/mobile/lib/features/cases`).

**Client (4.9)**
- "+" → case wizard (§3.1): practice (category → specialization, search,
  "Not sure"), essence, place (main state from the profile, up to 2 more,
  city), budget (amount / "Clarify later"), review with the disclaimer and
  the first-case `client_contact_sharing` checkbox; publish with the gavel
  strike. Draft kept only locally (drift `lawbid_cases`, per account),
  saved as you type; closing offers Save / Discard; restored draft banner.
  CASE_CONTAINS_CONTACT_INFO returns to the text step with the message.
- "Моё" → "Мои кейсы" (Active / Archive / Closed) with unseen-bid counts
  (local), "Сохранённое" (posts: docs/05). Case detail: status actions
  (edit, close, delete, restore, "Выполнено", review), "Адвокат в работе",
  bids with sorting (newest / lowest price / top rated). Edit screen reuses
  the wizard steps; practice/states locked once bids exist.
- Bid detail with the negotiation timeline (dialogue by rounds, gold rail,
  closing line incl. "Стороны не договорились"), round counter, actions by
  turn: accept (gavel strike), decline, counter (binding-offer warning).
- Client profile "Мои кейсы" (§11.3): locked grid of the cases.

**Attorney (4.10)**
- Feed → "Кейсы" tab: cards (category band + NEW, place, budget, views,
  bids, "Вы сделали бид"), filters by own practice / licensed state, gates:
  not verified, no verified license, no practices.
- Case detail (no client field), save/unsave, "Сделать бид" or the own bid
  card (`ownBidId`), "Написать клиенту"; SUBSCRIPTION_REQUIRED → the
  subscription call-to-action (paywall is docs/06).
- Bid form (§5.1). "Моё": "Мои биды" (Active / Finished, "Re: …"),
  "В работе" + "Завершённые", "Сохранённое" (unavailable cases marked).
- In-progress case: client contacts with Call / SMS / Email / Chat, locked
  notice without a subscription, "Не могу связаться", confirm / dispute.
- Settings → "История кейсов": SMS-code reauth, read-only list and
  timelines, PDF export (polling; the link consumes the token).

**Design**: in-app only (pre-app screens untouched), navy/gold, Source
Serif titles, staggered entrances, sliding segmented controls and tab
underline, animated round pips and checkmarks; everything respects
reduce-motion; 44/48 targets; tokens + t() only; 5 states on every list.

**Other**: deep link `/case/:id` opens the real screen; `PagedNotifier`
shared pagination; 322 en/ru keys (`pending_keys/stage-4-9-10.csv`).
Chat screens are docs/05 (buttons explain where chats will appear).

Tests: flutter test 591/591 (new: draft rules, wizard publish/consent and
contact-info error, bid actions by turn, empty states); analyze 0
errors/warnings. Fixed along the way: empty-state sliver crash
(LayoutBuilder intrinsic), drift row class name clash.
