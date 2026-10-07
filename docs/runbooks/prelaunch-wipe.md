# Pre-launch wipe of beta test data

**When:** once, after the public browser / Google Play beta and before the
real launch. Removes everything the testers created; keeps the launch
configuration. Irreversible once the backups age out — read it through first.

| Part | Tool | Where it runs |
|---|---|---|
| Database, S3, Bunny Stream | `scripts/deploy/prod-run.sh <TAG> wipe` → `node dist/scripts/prelaunch-wipe.js --only=bunny,db,s3` | owner's Mac, inside the released API image (migrator role) |
| Redis | `scripts/deploy/prod-wipe-redis.sh` → same script, `--only=redis` | one-off ECS task on the worker task definition (Redis is VPC-only) |

Code: `apps/api/scripts/prelaunch-wipe.ts`; the table lists (one reason per
table) and the selection logic: `apps/api/src/ops/prelaunch-wipe.plan.ts`,
unit-tested in `prelaunch-wipe.plan.spec.ts` against `prisma/schema.prisma`.
The script needs the release that contains it (any deploy after 2026-10-07);
`<TAG>` is the image tag of the latest Deploy run (GitHub → Actions).

## What is kept / what goes

**Kept** (launch configuration): `app_config` (incl. cost caps and
`web.allowed_origins`), `feature_flags`, `legal_documents`,
`blocked_email_domains`, `countries`, `states`, `practice_areas`,
`state_bar_registries`, all `i18n_*`, `email_templates`, `plans`,
`plan_prices`, `promo_codes` (counter reset), `document_templates` (counter
reset), official sticker packs + their stickers, admin accounts
(`admin_profiles`, `admin_credentials`, `admin_role_templates`, their
`users` rows and avatars), `integration_credentials`,
`integration_custom_providers`, support macros / agents, payroll, treasury,
partners, country partners, outreach (leads, templates, suppression list),
`_prisma_migrations`.

**Users kept besides admins:** anyone a kept row points at (partners,
payroll employees, …). The dry run prints how many and why — check that
list; a tester who became a "partner" during the beta stays until that
partner row is removed in the admin.

**Wiped:** every other table (`TRUNCATE … CASCADE` in one statement):
profiles, verification, cases, bids, journal, chats, messages, calls,
posts, reels, comments, likes, follows, notifications, sessions, devices
(push tokens), auth events, consents, Stripe test-mode rows (payments,
subscriptions, payouts accounts, webhooks), referrals, support tickets,
reports, bans, fraud signals, data-export jobs, audit log, demo-account
registry, storage statistics; then the non-admin `users`, unreferenced
`files` and user-made sticker packs.

**S3** (`lawbid-prod-documents`, `lawbid-prod-media`): every object except
the keys of kept `files` rows and their `_w<px>` variants, and the `demo/`
prefix (the demo world manages it). With `--purge-versions` also all old
versions and delete markers in both buckets and in
`lawbid-prod-documents-replica` — otherwise versioning keeps them 30 / 90
days and the replica keeps them until removed.

**Bunny Stream:** every video in the library (only users upload videos).

**Redis:** every key except `budget:*` (real spend counters and the «Авто»
history), `bull:*` (queues, cron schedules), `i18n:*`, `ent:*`, `lock:*`,
`treasury:*`, `demo:*`.

Not touched: the demo database `lawbid_demo` (reset it from the admin,
step 6), CloudWatch logs (expire by retention), Sentry, Stripe test mode
dashboard, Twilio logs.

## Safety rails

- Dry run is the default; it prints counts only, never values.
- `--execute` also needs `PRELAUNCH_WIPE_CONFIRM=wipe-beta-test-data` **and**
  the database name typed at the prompt (shown in the first line of the
  output). Without a terminal only `--only=redis` may run (the ECS task), with
  the name passed as `PRELAUNCH_WIPE_DB_NAME`.
- It stops before deleting anything when the database has a table that is in
  neither list (a new migration — classify it in the plan file first), or
  when `TRUNCATE … CASCADE` could reach a kept table through a foreign key.
- Every phase is idempotent: after an error fix the cause and run again.

## Steps

1. **Backup (owner).** CockroachDB Cloud console → the prod cluster →
   **Backup and Restore**: the newest backup must be younger than 24 h; note
   its time. (Managed backups + PITR are what a restore would use —
   [backups.md](backups.md).) Optionally, for a point exactly before the wipe,
   wait until the next scheduled backup completes and note it.
2. **Close the doors.** Admin → Система → Настройки: remove the beta origin
   from «Сайты, с которых разрешено работать с сервером» if the web beta is
   over; tell testers the beta has ended.
3. **Dry run** (owner's Mac, AWS login active):
   ```sh
   cd /Users/sima/Desktop/iT/Process/LawBid
   scripts/deploy/prod-run.sh <TAG> wipe --purge-versions
   scripts/deploy/prod-wipe-redis.sh
   ```
   Read the output: the kept users count and reasons, the kept tables, S3
   counts per prefix, Bunny video count, Redis groups.
4. **Real run:**
   ```sh
   export PRELAUNCH_WIPE_CONFIRM=wipe-beta-test-data
   scripts/deploy/prod-run.sh <TAG> wipe --purge-versions --execute
   scripts/deploy/prod-wipe-redis.sh --execute
   unset PRELAUNCH_WIPE_CONFIRM
   ```
   Each asks for the database name printed in the dry run.
5. **Verify.** Run step 3 again: every TRUNCATE table «already empty»,
   `users: delete 0`, `files: delete 0`, S3 `delete 0`, Bunny `delete 0
   videos`, Redis only a few fresh keys (live traffic). Then: sign in to the
   admin (sessions were wiped — sign in again), open Пользователи (only
   admins / kept staff), the app opens and shows an empty feed, a new phone
   sign-up works end to end.
6. **Demo world:** Admin → Деньги → Партнёры → Демо-доступ → «Сбросить
   демо-мир».
7. Restart the services so in-process caches start clean (GitHub → Actions
   → Deploy → re-run the latest, or `scripts/deploy/roll-services.sh`).

## If something goes wrong

- *"tables not in the keep / wipe lists"* — a new table: add it to
  `KEEP_TABLES` or `WIPE_TABLES` in `prelaunch-wipe.plan.ts` with a reason,
  run the unit test, release, run again.
- *"TRUNCATE CASCADE would reach kept tables"* — a kept table got a foreign
  key to a wiped one; move one of them or handle it as a filtered table.
- Wrong data deleted — restore from the backup of step 1 into a **new**
  cluster and copy the needed tables back ([backups.md](backups.md)); S3 old
  versions are gone if `--purge-versions` was used.
