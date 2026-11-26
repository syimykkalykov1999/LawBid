SET LOCAL lock_timeout = '5s';

-- G4 (docs/dev/STAGE2_ARCH_PERF_2026-11-25.md): time-ordered ids on the hot
-- append tables. PostgreSQL 18 (prod: infra/envs/prod/growth.auto.tfvars.json
-- database_major_version = "18"; CI and the Mac run the same major,
-- scripts/ci/ci-engines-match-prod.test.mjs) has a built-in uuidv7()
-- (RFC 9562, PostgreSQL 18 release notes, 25.09.2025). A v7 key grows with
-- time, so a new row lands at the right edge of the primary-key B-tree
-- instead of a random page: fewer page splits, less WAL, a hotter cache
-- (the reason Discord and Twitter use Snowflake ids).
--
-- Only the DEFAULT changes: metadata, no table rewrite, existing ids stay.
-- Old v4 and new v7 ids are both `uuid`; nothing orders by id alone.
-- NOT changed: tables whose id is a link secret (invites, shares, calendar
-- feed tokens): v7 tells when the row was created and has 74 random bits
-- instead of 122.
ALTER TABLE "messages" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "chat_group_messages" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "message_edits" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "notifications" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "posts" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "post_media" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "comments" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "post_views" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "post_view_events" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "stories" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "channel_posts" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "channel_comments" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "files" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "file_access_log" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "domain_events" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "auth_events" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "cross_family_outbox" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "work_lease_events" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "case_task_events" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "support_messages" ALTER COLUMN "id" SET DEFAULT uuidv7();
