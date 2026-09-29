## Stage 4.6 — Case lifecycle and jobs (API)

docs/04_CASES_BIDS.md §16 stage 4.6, §10.

- `CaseLifecycleService` / `CaseLifecycleController`
  (`modules/cases/lifecycle`): `POST /cases/:id/complete` (client
  "Выполнено": pending_completion, auto_close_at = +7 days,
  `completion_requested` to the attorney), `POST /cases/:id/confirm-completion`
  (attorney → closed), `POST /cases/:id/dispute {reason}` (attorney →
  disputed + `case_disputes` row; Idempotency-Key). Non-participants: 404.
- `POST /admin/case-disputes/:id/resolve {decision: closed|in_progress, note}`
  — API stub with a role (support/moderator/super_admin), audit_log; the
  admin screen is docs/06.
- Every close (confirm, auto-close, admin close): `case_closed` to both
  sides + `review_requested` to the client (docs/03 §7.3).
- `CaseStateMachine`: new in-place system action `system_stale_prompt`
  (`stale_prompt_sent_at = now()`), so the §10.2 job changes cases only via
  the machine (.cursorrules).
- Hourly jobs (`jobs/handlers/case-lifecycle.jobs.ts`): stale prompt
  (30 days idle → `case_stale_prompt`), auto-archive (14 days after the
  prompt without activity → archived, active bids rejected_auto reason
  `case_archived`, pre-acceptance chats closed, `case_archived`), auto-close
  (`auto_close_at` reached → closed, `auto_closed`), completion reminder
  (≤ 24 h left → one `completion_reminder`). Keyset batches of 500 on the
  §10.2 partial indexes; each case re-checked under `SELECT … FOR UPDATE`;
  Redis lock per job (`withJobLock`, SET NX PX + compare-and-delete).
- `CasesService.toFullDto` made public for the lifecycle controllers.

Tests: e2e `stage-4-6.e2e-spec.ts` 6/6 with an injected clock (stale
prompt once, archive at +14 d, keep-alive reset, reminder once, auto-close
at +7 d, confirm/dispute/admin decision, held lock skips); unit: machine
table 6×14, runner dispatch; API unit 695/695.
