SET LOCAL lock_timeout = '5s';
-- C2 (docs/dev/ARCHITECTURE_VS_BIG_PLATFORMS_2026-11-25.md, item 22): the
-- publication the worker's cache invalidation reads over logical
-- replication (pgoutput, built into PostgreSQL), like Facebook's mcsqueal
-- tailing the commit log. The list is CDC_TABLES of
-- src/modules/cache-cdc/cdc-key-map.ts (a spec keeps both the same).
--
-- What it changes while the admin switch db.cdc_mode stays Выкл: nothing a
-- user sees. A publication without a replication slot keeps no WAL and
-- decodes nothing. With wal_level below logical PostgreSQL only warns.
-- Every listed table has a primary key, so UPDATE / DELETE keep working
-- (a published table without a replica identity would refuse them).
--
-- REPLICA IDENTITY FULL on five small, rarely written tables: their DELETE
-- must carry user_id / assistant_user_id (the primary key alone does not
-- say whose cache to drop). Catalog-only change, no table rewrite; under
-- lock_timeout. Hot tables (posts, users, follows, user_blocks) keep the
-- default identity (their key columns are enough, or the TTL covers it).
--
-- Idempotent; a database where the migration user may not create
-- publications (managed service) only gets a NOTICE: the worker then shows
-- «нет публикации» and the owner step in docs/runbooks/cache-cdc.md.
ALTER TABLE "assistant_memberships" REPLICA IDENTITY FULL;
ALTER TABLE "contract_grants" REPLICA IDENTITY FULL;
ALTER TABLE "subscriptions" REPLICA IDENTITY FULL;
ALTER TABLE "user_consents" REPLICA IDENTITY FULL;
ALTER TABLE "user_strikes" REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'lawbid_cache_cdc') THEN
    CREATE PUBLICATION lawbid_cache_cdc FOR TABLE
      "app_config", "assistant_memberships", "contract_grants",
      "feature_flags", "follows", "i18n_bundle_versions", "i18n_languages",
      "legal_documents", "plans", "posts", "practice_areas", "subscriptions",
      "user_blocks", "user_consents", "user_strikes", "users"
      WITH (publish = 'insert, update, delete');
  ELSE
    ALTER PUBLICATION lawbid_cache_cdc SET TABLE
      "app_config", "assistant_memberships", "contract_grants",
      "feature_flags", "follows", "i18n_bundle_versions", "i18n_languages",
      "legal_documents", "plans", "posts", "practice_areas", "subscriptions",
      "user_blocks", "user_consents", "user_strikes", "users";
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'lawbid_cache_cdc: no right to create the publication (owner step, docs/runbooks/cache-cdc.md)';
END $$;
