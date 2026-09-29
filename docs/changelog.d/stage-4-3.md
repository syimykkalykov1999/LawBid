## Stage 4.3 — Showing cases to attorneys (API)

docs/04_CASES_BIDS.md §16 stage 4.3, §4.

- `CasesFeedController` / `CasesFeedService` (`apps/api/src/modules/cases`):
  `GET /cases?practiceAreaId=&state=&cursor=&limit=` (attorney feed, newest
  first, cursor pagination, filters limited to the attorney's own practices
  and licensed states), `GET /cases/:id` (attorney representation: never a
  client field), `POST /cases/:id/view`, `POST|DELETE /saved-items`.
- Visibility (§4.1) in `queries/cases-visible.sql.ts`, the index-friendly
  shape of docs/02 §5.4 incl. the `general_practice.not_sure_or_other`
  exception; `EXPLAIN` in `test/stage-4-3.e2e-spec.ts` asserts no full scan.
- `CaseAccessPolicy.assertVisibleToAttorney`: ineligible attorney gets
  `CASE_NOT_AVAILABLE` (404) on a direct id (new code: API enum, mobile
  `ApiErrorCodes`, en/ru text, `pending_keys/stage-4-3.csv`).
- `CaseViewTrackingService` (§4.3 views): dedup per (attorney, case) in a
  Redis set with a 60-day TTL (bounded memory at scale), pending deltas in
  a Redis hash, flushed every 15 s by HSCAN + one atomic Lua drain per 500
  cases + one multi-row `UPDATE`; deltas are put back if the DB write
  fails (no lost views). Safe with many API instances flushing at once.
- Handler names made unique for OpenAPI operationIds (`listCaseFeed`,
  `getCaseDetail`, `recordCaseView`); contract regenerated.
- Not done here: client-owner representation of `GET /cases/:id` —
  TODO(stage 4.9), the client case screen that needs it.

Tests: unit (feed service, controller, view tracking incl. TTL and
DB-failure restore, policy), e2e `stage-4-3.e2e-spec.ts` 13/13; stages
4.1/4.2/4.4 e2e re-run after merge 30/30; API unit 685/685; flutter test
583/583, analyze 0 errors/warnings.
