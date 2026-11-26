-- D8 (docs/dev/SECOND_PASS_2026-11-26.md, AWS Well-Architected SEC03-BP02;
-- Amazon RDS «Master user account privileges»: do not use the master user for
-- applications): migrations run as the narrow role lawbid_migrator, not as the
-- RDS master user. This file makes the role and moves the schema to it. It is
-- the ONE copy: the migrate task runs it (prisma/ensure-migrator-role.mjs,
-- admin switch aws.db_migrator_role), and a person can run it by hand with
--   psql "$MASTER_URL" -v ON_ERROR_STOP=1 -f apps/api/prisma/migrator-role.sql
-- as the master user (the role that owns the tables today). Re-running it is
-- harmless: every step only does what is still missing.
--
-- Pattern (PostgreSQL docs «Privileges», «ALTER DEFAULT PRIVILEGES»,
-- «Role Membership»; psql \gexec): each SELECT below writes the statements
-- still needed, and each statement then runs on its own (autocommit), so an
-- ALTER ... OWNER takes one table lock at a time and never holds the locks of
-- all tables together. Not REASSIGN OWNED: that would also hand over the
-- database itself (then the migrator could drop it) and the extensions.
--
-- What the role may do (least privilege):
--   - LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS,
--     no member of rds_superuser or of the master user;
--   - OWNS the tables, views, sequences, types and functions of schema public
--     (PostgreSQL: only the owner may ALTER / DROP a table or build an index on
--     it), USAGE + CREATE on schema public, CONNECT + CREATE on the database
--     (CREATE: owner of the publication lawbid_cache_cdc must have it, and the
--     trusted extensions pg_trgm / unaccent need it; it does not let the role
--     drop the database, which stays owned by the master user);
--   - may NOT create or change roles, so role passwords stay with the master
--     user (prisma/ensure-partition-login.mjs runs as the master user).
-- Honest limit: an owner can read its own tables, so the migrator can read
-- every column (PostgreSQL has no DDL-without-read for an owner).
--
-- The master user becomes a member of lawbid_migrator (INHERIT, SET): it keeps
-- every right on the moved objects, so switching aws.db_migrator_role off
-- (migrations run as the master user again) works in one step.
-- The password is set by the migrate task (MIGRATOR_ROLE_PASSWORD from
-- Secrets Manager, bound parameter); by hand: \password lawbid_migrator.

-- 1. The role.
SELECT 'CREATE ROLE lawbid_migrator WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT' AS stmt
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawbid_migrator')
\gexec

-- 2. Narrow attributes the role may have got earlier (only the wrong ones: a
-- non-superuser may not even name SUPERUSER / REPLICATION / BYPASSRLS).
SELECT 'ALTER ROLE lawbid_migrator WITH ' || concat_ws(' ',
         CASE WHEN rolsuper THEN 'NOSUPERUSER' END,
         CASE WHEN rolcreatedb THEN 'NOCREATEDB' END,
         CASE WHEN rolcreaterole THEN 'NOCREATEROLE' END,
         CASE WHEN rolreplication THEN 'NOREPLICATION' END,
         CASE WHEN rolbypassrls THEN 'NOBYPASSRLS' END,
         CASE WHEN NOT rolcanlogin THEN 'LOGIN' END,
         CASE WHEN NOT rolinherit THEN 'INHERIT' END) AS stmt
  FROM pg_roles
 WHERE rolname = 'lawbid_migrator'
   AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
        OR NOT rolcanlogin OR NOT rolinherit)
\gexec

-- 3. No membership in other roles (rds_superuser, the master user ...), except
-- lawbid_partition_tables (migration 20261112110000: the migrator alters the
-- tables the online partitioning runner owns).
SELECT format('REVOKE %I FROM lawbid_migrator', r.rolname) AS stmt
  FROM pg_auth_members m
  JOIN pg_roles r ON r.oid = m.roleid
 WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = 'lawbid_migrator')
   AND r.rolname <> 'lawbid_partition_tables'
\gexec

-- 4. Database and schema rights.
SELECT format('GRANT CONNECT, CREATE ON DATABASE %I TO lawbid_migrator', current_database()) AS stmt
\gexec
SELECT 'GRANT USAGE, CREATE ON SCHEMA public TO lawbid_migrator' AS stmt
\gexec

-- 5. The master user (the one running this) may act as the migrator: needed to
-- hand objects over (ALTER ... OWNER asks for it) and keeps the master user's
-- rights on them for the switch back. PostgreSQL 16+: the creator's own grant
-- carries ADMIN only, so INHERIT and SET are given explicitly.
SELECT format('GRANT lawbid_migrator TO %I WITH INHERIT TRUE, SET TRUE', current_user) AS stmt
 WHERE NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
   AND current_user <> 'lawbid_migrator'
   AND NOT EXISTS (
     SELECT 1 FROM pg_auth_members m
      WHERE m.roleid = (SELECT oid FROM pg_roles WHERE rolname = 'lawbid_migrator')
        AND m.member = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND m.inherit_option AND m.set_option)
\gexec

-- 6. Hand over what the master user owns in schema public. Tables first; the
-- sequences of their columns and their indexes follow the table by
-- themselves. Objects of extensions stay with the extension.
SELECT format('ALTER %s %I.%I OWNER TO lawbid_migrator',
         CASE c.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
                        WHEN 'S' THEN 'SEQUENCE' WHEN 'f' THEN 'FOREIGN TABLE'
                        ELSE 'TABLE' END,
         n.nspname, c.relname) AS stmt
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
   AND current_user <> 'lawbid_migrator'
   AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
   AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
   AND NOT (c.relkind = 'S' AND EXISTS (
         SELECT 1 FROM pg_depend d
          WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
            AND d.refclassid = 'pg_class'::regclass AND d.deptype IN ('a', 'i')))
 ORDER BY c.relkind = 'S', c.oid
\gexec

-- Enums, domains, ranges and stand-alone composite types.
SELECT format('ALTER %s %I.%I OWNER TO lawbid_migrator',
         CASE t.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END, n.nspname, t.typname) AS stmt
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
 WHERE n.nspname = 'public'
   AND t.typowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
   AND current_user <> 'lawbid_migrator'
   AND t.typtype IN ('e', 'd', 'r', 'c')
   AND (t.typtype <> 'c' OR (SELECT c.relkind FROM pg_class c WHERE c.oid = t.typrelid) = 'c')
   AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e')
 ORDER BY t.oid
\gexec

-- Functions, procedures, aggregates (the SECURITY DEFINER partition helpers
-- then run as the migrator, which owns the tables they change: less than the
-- master user they ran as before).
SELECT format('ALTER %s %I.%I(%s) OWNER TO lawbid_migrator',
         CASE p.prokind WHEN 'p' THEN 'PROCEDURE' WHEN 'a' THEN 'AGGREGATE' ELSE 'FUNCTION' END,
         n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS stmt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
   AND current_user <> 'lawbid_migrator'
   AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
 ORDER BY p.oid
\gexec

-- Publications of a table list (FOR ALL TABLES needs a superuser owner).
SELECT format('ALTER PUBLICATION %I OWNER TO lawbid_migrator', pubname) AS stmt
  FROM pg_publication
 WHERE pubowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
   AND current_user <> 'lawbid_migrator'
   AND NOT puballtables
 ORDER BY oid
\gexec

-- 7. New objects the migrator creates get the same rights the master user's
-- new objects got (a copy of its default privileges in schema public, e.g.
-- lawbid_app: SELECT/INSERT/UPDATE/DELETE on tables, USAGE/SELECT on
-- sequences from the baseline and 20261107134000).
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE lawbid_migrator IN SCHEMA public GRANT %s ON %s TO %s',
         a.privilege_type,
         CASE d.defaclobjtype WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES'
                              WHEN 'f' THEN 'FUNCTIONS' ELSE 'TYPES' END,
         CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END) AS stmt
  FROM pg_default_acl d
 CROSS JOIN LATERAL aclexplode(d.defaclacl) a
 WHERE d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
   AND current_user <> 'lawbid_migrator'
   AND d.defaclnamespace = 'public'::regnamespace
   AND d.defaclobjtype IN ('r', 'S', 'f', 'T')
   AND a.grantee <> d.defaclrole
   AND a.grantee <> (SELECT oid FROM pg_roles WHERE rolname = 'lawbid_migrator')
 ORDER BY d.defaclobjtype, a.grantee, a.privilege_type
\gexec
SELECT 'ALTER DEFAULT PRIVILEGES FOR ROLE lawbid_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lawbid_app' AS stmt
 WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawbid_app')
\gexec
SELECT 'ALTER DEFAULT PRIVILEGES FOR ROLE lawbid_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO lawbid_app' AS stmt
 WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawbid_app')
\gexec

-- 8. Limits of the role (the same as migration 20261101310000 and
-- infra/postgres/role-settings.sql): a migration never waits long for a lock.
SELECT 'ALTER ROLE lawbid_migrator SET lock_timeout = ''5s''' AS stmt
\gexec
SELECT 'ALTER ROLE lawbid_migrator SET statement_timeout = ''10min''' AS stmt
\gexec
