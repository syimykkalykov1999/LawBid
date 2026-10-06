-- Production runs the API as `lawbid_app` (docs/02 §6.3), not as root like
-- the dev Mac. The stage-2.6 grants covered only the tables that existed
-- then, so every table added later had no privileges for the app role and
-- the API would fail on it in prod. Default privileges make each future
-- table inherit the grants; the catch-up grants cover today's tables. The
-- append-only and bookkeeping restrictions of stage 2.6 / 4.1 are
-- re-applied after the catch-up grant. Idempotent; a no-op for root.
ALTER DEFAULT PRIVILEGES FOR ALL ROLES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "lawbid_app";
ALTER DEFAULT PRIVILEGES FOR ALL ROLES IN SCHEMA public
  GRANT ALL ON TABLES TO "lawbid_migrator";

GRANT ALL ON ALL TABLES IN SCHEMA public TO "lawbid_migrator";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "lawbid_app";

REVOKE UPDATE, DELETE ON TABLE "case_journal", "contact_disclosures", "audit_log",
  "data_access_log", "auth_events", "user_consents" FROM "lawbid_app";
REVOKE ALL ON TABLE "_prisma_migrations" FROM "lawbid_app";
