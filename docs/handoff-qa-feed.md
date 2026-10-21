# Handoff: «Вопрос юристу» feed / limit / privacy / close (branch claude/qa-feed-mine)

Owner requests (SiMA, 2026-10-21), all in this branch:
1. Attorney feed by specialisations: `GET /questions?scope=mine|all` (same rule as `summary()`: own areas + parent/children, verified-licence states; no areas -> all). DONE in API.
2. Max 10 answers per question (409 `QA_ANSWERS_ENOUGH`, atomic `takeSlot`), DONE. Closed question -> 409 `QA_QUESTION_CLOSED`. DONE.
3. Attorneys see only their own answer; every client sees all and likes; attorney like -> 403. DONE (`get()`, `like()`).
4. `PUT /questions/:id/close`, `closed_at` column (migration 20261021050000), nightly `legal-qa.sweep` (03:50 UTC): close unanswered >30 d, purge deleted >90 d. DONE (`legal-qa-sweep.job.ts`, wired in jobs; `jobs.runner.spec.ts` now expects 57 jobs).
5. DTO: `QuestionDto.closed`, `answersEnough`; `canAnswer` false when closed / 10 answers.
6. E2E: `apps/api/test/owner-qa-scope-limits.e2e-spec.ts` written, NOT yet run green. Run: start postgres (`service postgresql start`) and `redis-server --daemonize yes`, then
   `DATABASE_URL=postgresql://root:lawbid@localhost:5432/lawbid_test REDIS_URL=redis://localhost:6379 npx jest --config ./test/jest-e2e.json test/owner-qa-scope-limits.e2e-spec.ts` (slow, >10 min first time). Never `pkill -f jest` from the same shell.

TODO (mobile, not started):
- Regenerate contract: `packages/api-contract/generate.sh` (QuestionScope, close, closed/answersEnough, new error codes) + Dart client.
- Header tabs in `qa_feed_screen.dart` (AppTopBar title, segment like ContactsCallsSegment / InboxTabsBar): «Все · Мои · Лучшие · Без ответа» for both roles. Attorney «Все» = scope=mine by default; the switch «везде» lives in the filter sheet. Swipe between tabs like elsewhere (PageView + edge-swipe rule, see pill_tabs.dart). Remove chips Без ответа / С лучшим / Мои from `qa_filter_sheet.dart` (keep topics + states). Tabs must combine with search + filters (test it). Client «Мои» = filter mine (own questions).
- Question tap -> bottom sheet (like Instagram comments) with question + attorney answers + likes; keep `question_detail_screen.dart` for deep links. Feed is already infinite (PagedNotifier).
- Attorney card: «N из 10» (`qa.count.of`), «Ответов достаточно» when `answersEnough`; client: «Закрыть вопрос» (+confirm), «Закрыт» badge; show `qa.err.*` on 409.
- i18n: `docs/handoff-qa-pending-i18n.json` (9 keys x 85 languages, ready): `node scripts/i18n-add.mjs docs/handoff-qa-pending-i18n.json`, `node scripts/gen-longest-strings.mjs`, `node scripts/i18n-audit.mjs --ci`; add ru/en to `lib/core/l10n/strings/legal_qa_strings.dart`; delete the json after. xlsx rebase conflicts: `git checkout --ours` then re-run i18n-add.
- Tests: overflow 360dp ne/ar/ru x1.1, 4 themes; search combos.

Rules: compact like Telegram, x1.1, no yellow icons, push only this branch, never release-20oct, report SHA to coordinator (cmsg thread of Q&A). Flutter at /opt/flutter/bin.
