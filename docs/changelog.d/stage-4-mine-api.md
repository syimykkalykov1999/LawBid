## Stages 4.9/4.10 — API support for the app screens

docs/04_CASES_BIDS.md §9, §11, §15 (`modules/cases/mine`).

- `GET /users/me/cases/:id` — the owner's case (CaseDto) + "Адвокат в
  работе" (accepted bid with the attorney summary) + the chat id.
  Deviation: §15 lists one `GET /cases/:id` with per-role representations;
  the generated typed client needs one response shape per route, so the
  owner representation lives here and `GET /cases/:id` stays the
  attorney one (§4.3).
- `GET /users/me/bids?filter=active|finished` — "Мои биды" (case ref +
  last offer), keyset on bids(attorney_id, status, updated_at DESC).
- `GET /users/me/work?filter=active|closed` — "В работе" / "Завершённые";
  the client's name is null while the subscription is inactive (§8.3).
- `GET /saved-items?type=case` — saved cases: available ones as feed
  cards, closed / no-longer-visible ones `available=false` ("Кейс
  недоступен"). §15 lists only POST/DELETE; the list is needed by §11.2.
- `POST /cases/:id/conversation` — "Написать клиенту" (§9 rule 2): case
  visible to the attorney, active subscription/trial, one conversation per
  (case, attorney), `pre_acceptance`, open cases only.

Tests: e2e `stage-4-mine.e2e-spec.ts` 4/4; unit 695/695.
