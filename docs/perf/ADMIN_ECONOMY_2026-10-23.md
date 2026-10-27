# Admin economy and speed pass (2026-10-23)

Goal (owner): at hundreds of thousands of users the admin panel's tables and dashboards must stay fast and
must not load the server. Done on top of the 2026-10-22 pass (`/admin/counts` single poll with ETag,
`private max-age=30` on the dashboard, system-health board, polling only while a page is open).

How the big admin consoles stay fast (Stripe, Shopify): lists page by cursor on an index that already
returns rows in the page order; filters hit an index; the numbers on the home screen are not counted when
you open it but precomputed and served with a timestamp; the browser shows the last answer at once and
revalidates (stale-while-revalidate). This pass applies exactly that.

## Method

- `scripts/ops/admin-load-gen.sql` fills a migrated empty database (deterministic, no `random()`, about
  40 s): 100 001 users (10 % attorneys), 300 000 posts, 100 000 comments, 50 000 cases, 150 000 bids,
  10 000 subscriptions, 30 000 payments, 8 000 reports, 6 000 support tickets, 200 000 audit rows,
  3 000 verification requests, 3 000 client fraud profiles, 2 000 bans.
- `apps/api/test/perf-admin.e2e-spec.ts` boots the real `AppModule`, signs in a super admin, empties the
  admin caches, and calls 27 admin endpoints: the first call (**cold**: what one recount costs) and 20
  repeats (**warm**: what the panel waits for on every poll and page open).

```sh
psql "$DB" -f scripts/ops/admin-load-gen.sql
PERF_ADMIN=1 E2E_REDIS_DB=9 E2E_DATABASE_URL="$DB" npx jest --config test/jest-perf-admin.json --forceExit
```

"Before" = `origin/main` code on a copy of the same database with the new indexes dropped; "after" = this
branch. Same Mac, Postgres 16 and Redis in Docker, one API process, sequential requests, other jobs of the
other worker running on the same machine (so differences of a few ms between runs are noise; the big ones
are not).

## Result (ms, warm = 20 repeats)

| endpoint | before cold | before p50 | **before p95** | after cold | after p50 | **after p95** |
|---|---|---|---|---|---|---|
| `/admin/counts` (sidebar, polled by every open tab) | 964 | 739 | **866** | 20 | 6.3 | **10.8** |
| `/admin/trust/stats` | 5 065 | 4 427 | **5 092** | 4 429 (first call ever) | 28 | **40** |
| `/admin/trust/queue` | 850 | 827 | **1 250** | 23 | 20.5 | **30** |
| `/admin/moderation/queue` | 108 | 51 | **66** | 14 | 10.6 | **12.7** |
| `/admin/bids?q=` (case title) | 85 | 97 | **109** | 20 | 15 | **17** |
| `/admin/bids?status=` | 57 | 53 | **55** | 7.4 | 5.9 | **6.8** |
| `/admin/billing/subscriptions?q=` | 52 | 51 | **58** | 9.5 | 7.8 | **11.4** |
| `/admin/content/posts?q=` (rare word) | 139 | 144 | **181** | 16 | 13.7 | **18.2** |
| `/admin/content/posts?q=` (word in 1/3 of posts) | 141 | 138 | **222** | 129 | 181 | **303** (see note) |
| `/admin/cases` | 35 | 27 | **29** | 8.2 | 6.1 | **8.5** |
| `/admin/cases?status=` | 29 | 25 | **29** | 6.3 | 6.4 | **8.0** |
| `/admin/cases?q=` (rare / every title) | 51 / 44 | 32 / 44 | **55 / 69** | 8.1 / 7.5 | 6.6 / 7.2 | **8.3 / 9.2** |
| `/admin/support/stats` | 25 | 21 | **23** | 20 | 3.5 | **4.2** |
| `/admin/support/tickets` | 12 | 11 | **20** | 6.9 | 6.1 | **7.1** |
| `/admin/overview` | 29 | 23 | **26** | 35 | 6.0 | **17** |
| `/admin/billing/overview` | 15 | 12 | **15** | 13 | 3.8 | **6.0** |
| `/admin/billing/payments` | 16 | 14 | **17** | 7.5 | 6.1 | **8.4** |
| `/admin/audit-log` | 37 | 27 | **31** | 12 | 9.5 | **16** |
| `/admin/sanctions/bans?q=` | 7.2 | 5.3 | **10** | 6.8 | 4.8 | **5.7** |
| `/admin/dashboard` | 40 | 4.3 | **5.5** | 25 | 4.9 | **6.6** |
| `/admin/users` (first page / name search / role+country) | 8.6 / 7.6 / 6.9 | 6.2 / 7.3 / 7.2 | **7.3 / 7.9 / 9.8** | 7.5 / 7.8 / 6.2 | 5.9 / 6.4 / 6.0 | **9.8 / 8.9 / 7.8** |
| `/admin/fraud/stats`, `/admin/payroll/summary` | 8.9, 10 | 6.6, 5.3 | **7.7, 7.1** | 8.0, 5.4 | 4.7, 4.0 | **7.0, 5.2** |

The user list, fraud stats and payroll summary were already fast (cursor + index); they are listed so the
table covers the whole run. The milliseconds above are at 100 000 users; the *before* numbers grow with the
tables, the *after* ones do not (see the plans below).

**The worst finding: `/admin/counts`** (polled once a minute by every open tab) built up to 1 000 attorney
trust snapshots (`trust.queue({limit: 1000})`, each with licences, requests, documents) on every poll:
0.55–0.87 s of server time per tab per minute. Now it reads the queue size the worker stored.

**Note, posts with a word that is in a third of all posts:** unchanged by design. The result set is huge, so
the plain newest-first scan (the old plan) is used after a 14 ms probe finds more than 300 matches; the run
to run noise on this machine (+/- 80 ms, other jobs running) is bigger than the probe. A specific word
(`4711`, a name, a rare term) takes the index path: 144 → 14 ms here, and the gap grows with the table
(the scan reads every post; the index does not).

## What changed

### 1. Heavy aggregates are precomputed (`common/admin-summary`, cron `admin.summaries`)

- `AdminSummaryService`: Redis `adm:sum:<key>` = `{data, computedAt}`, kept for a day.
  A read returns the stored value at once; if it is older than the key's `fresh` window the *stale* value is
  returned and one process (Redis lock `adm:sum:lock:<key>`, plus an in-process promise) recounts in the
  background; only when nothing was ever stored does the first request wait, and concurrent requests share
  that one computation. A failed recount keeps the last good value. Redis down = it just computes.
- Worker cron `admin.summaries` (every 2 minutes, in `HEAVY_CRON_JOBS`, so the owner's pause and the DB
  guard stop it): dashboard totals, billing overview and, at most every ~10 minutes, the attorney-trust
  scan. A failing step does not block the others.
- Served from the summary: `/admin/dashboard` (fresh 150 s), `/admin/billing/overview` (150 s),
  `/admin/overview` (300 s), `/admin/support/stats` (60 s), the per-badge-status counts of
  `/admin/trust/stats` (`computedAt` added to the answer, an addition to the contract), the staff-queue size
  in `/admin/counts`.
- **Attorney trust scan** (`AttorneyTrustService.scan`): the badge status is derived from many facts, not
  stored, so counting it needs every attorney. It used to read up to 20 000 profiles with all their
  licences in ONE query (3 s at 10 000 attorneys, and silently wrong beyond 20 000). It now walks all
  attorneys in batches of 500 by id (correct at any size, bounded memory) and runs in the worker only.
  At 100 000 attorneys expect ~35–45 s of worker time every ~10 minutes (it is a heavy job: pausable).
- `trust.queue()` got a SQL pre-filter (`QUEUE_PREFILTER`: only profiles with one of the facts that can put
  someone in the queue are loaded and turned into snapshots) and a precedence bug fixed (a text search used
  to overwrite the "not cleared" filter). 531 → 17–20 ms.

### 2. Lists: indexes and no N+1

Migration `20261023130000_admin_list_indexes` (expand-only, plain `CREATE INDEX IF NOT EXISTS`):

| index | serves |
|---|---|
| `cases_created_at_id_idx`, `cases_status_created_at_id_idx` | «Дела» newest first, by status |
| `bids_created_at_id_idx`, `bids_status_created_at_id_idx` | «Ставки» |
| `payments_created_at_id_idx`, `payments_status_created_at_id_idx` | «Платежи» |
| `subscriptions_created_at_id_idx`, `subscriptions_status_created_at_id_idx` | «Подписки» |
| `case_disputes_status_created_at_id_idx` | disputes, dashboard `open` count |
| `audit_log_created_at_id_idx`, `audit_log_target_idx` | audit log page, history of one object |
| `audit_log_action_idx` (`text_pattern_ops`, partial) | `action LIKE 'prefix%'` filter |
| `users_email_trgm_idx` (GIN trigram, partial) | `email ILIKE '%x%'` (subscriptions search, support) |
| `account_bans_value_trgm_idx` (GIN trigram, partial) | bans search |
| `support_tickets_unread_idx` (partial) | the sidebar «непрочитанные» count |

The raw ones are partial on purpose: Prisma's `migrate diff` ignores partial indexes (same trick as
`users_full_name_trgm_idx`), `prisma migrate diff` reports no difference, `scripts/check-migrations.mjs` is
green.

Text search (`admin-content/admin-text-search.ts`): the posts search (`title ILIKE OR body ILIKE`), the bids
search by case title and the cases search by title read every row. They now ask the existing indexes
(`posts_title_trgm_idx`, `posts_search_tsv_simple_idx`, `cases_title_trgm_idx`) for the matching ids with a
`LIMIT 301` probe; at most 300 matches use them, more falls back to the plain scan. Behaviour change:
the post body is now matched by **word prefix** (`immigr` finds `immigration`), not by any substring.

Moderation queue (`moderation/admin-moderation.service.ts`): was ~4 sequential queries per row (target,
author, 2 counts) — now one parallel read of the targets and two batched author queries; the «handled»
history (dismissed / actioned) looks at the last 180 days instead of grouping every report ever filed.

Audit of every other admin list: all use cursor paging with a bounded `take` (users, attorneys, cases, bids,
payments, payouts, reports, support, audit log, media moderation, notifications…); the findMany calls
without `take` are batched `id IN (…)` lookups, `groupBy` over an enum, or tiny config tables (flags,
languages, practice areas, email templates, role templates, payroll employees).

### 3. HTTP

- Every admin `GET` gets `Cache-Control: private, no-cache` + `Vary: Authorization` by default
  (`AdminCacheHeadersMiddleware`). Express already puts a weak ETag on JSON, so a list that did not change
  is a 304 without a body; handlers that set their own value (`private, max-age=30` on the dashboard and
  the counts, `no-store` on integrations) keep it.

### 4. Admin UI

- No timers on the stats pages: dashboard, trust stats, economy, sessions, support team revalidate when the
  tab regains focus (`refetchOnWindowFocus`, stale after 30 s) instead of `refetchInterval`. Still polling,
  only while open: `/admin/counts` (sidebar), the support inbox and ticket thread, approvals, the
  system-health board, the workspace and the legal data-request page.
- The search-as-you-type inputs that queried on every key (partner / referral owner pickers, media channels,
  search synonyms) use `useDebounced` (300 ms); the other search boxes already submit on Enter.

## EXPLAIN notes (100 000 users, 300 000 posts, 150 000 bids, 200 000 audit rows)

```
-- audit log, newest page          before: Parallel Seq Scan + top-N sort            22.0 ms
--                                 after : Index Only Scan audit_log_created_at_id_idx 0.02 ms
-- cases by status, newest first   before: Bitmap Heap Scan + top-N sort            18.1 ms
--                                 after : Index Scan cases_created_at_id_idx         0.06 ms
-- bids, newest first              before: Parallel Seq Scan + top-N sort            20.9 ms
--                                 after : Index Only Scan bids_created_at_id_idx     0.02 ms
-- payments by status              before: Seq Scan + sort                            2.6 ms
--                                 after : Index Only Scan payments_status_created_at_id_idx 0.05 ms
-- users.email ILIKE '%x%'         before: Seq Scan on users                         32.9 ms
--                                 after : Bitmap Index Scan users_email_trgm_idx     0.8 ms
-- posts: word in 4711 (rare)      before: Parallel Seq Scan, Filter ILIKE title/body ~70-90 ms (linear in rows)
--                                 after : BitmapOr(posts_title_trgm_idx, posts_search_tsv_simple_idx), LIMIT 301  ~1 ms
-- cases title ILIKE rare          before: Seq Scan                                  ~17 ms (linear)
--                                 after : Bitmap Index Scan cases_title_trgm_idx     0.5 ms
-- support unread count            Index Only Scan support_tickets_unread_idx         0.3 ms
```

Everything "before" is a scan of the whole table, so it is linear: at 1 000 000 posts / 2 000 000 audit rows
the same queries are 10–20× slower; the "after" plans do not read the table.

## Left / not done

- **Virtualized tables.** `@tanstack/react-virtual` (or any windowing library) is not a dependency of
  `apps/admin`, and rows have variable height. Not added in this pass (it needs `npm install` + a
  lockfile change and a visual check). The lists are «Загрузить ещё» pages of 25–50 rows, so the DOM grows
  only with what the admin loads.
- `/admin/trust/attorneys` and `/admin/trust/queue` still build a snapshot per row (queue: only for the
  pre-filtered profiles, cap 2 000; list: `limit`, or 5 000 when filtered by badge status). A stored
  `badge_status` column maintained by `recompute` would remove that; it is a schema change for the
  attorney-trust owner to decide.
- Stats endpoints I did not measure and did not cache: `case-payments/stats`, `partners/stats`,
  `referrals/stats`, `promotions/stats`, `outreach/stats`, `/admin/fraud/stats` (the last is 5 ms here).
  They are plain counts over indexed columns; if the production tables show otherwise, register them in
  `AdminSummaryService` the same way (3 lines each).
- The nightly k6 run (`loadtest/k6`, profile `nightly`, staging) has no admin scenario; this harness is the admin one and is
  manual (`PERF_ADMIN=1`).
- Searches in the small admin tables that remain `ILIKE` (partners, referrals, legal lookup, bans) are on
  tables bounded by staff work, not by user count.
- Known and not caused here: `test/stage-6-7.e2e-spec.ts` (Stripe subscriptions) fails 10 tests on
  `origin/main` as well (`503` on `/subscriptions/start`).
