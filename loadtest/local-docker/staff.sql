-- Many concurrent staff for the admin load test (k6/staff.js), load-test
-- databases only. psql -v n=1000:
--  * n staff accounts md5('staff'||k): every 50th is an owner-level account
--    (the dashboards «Сегодня», system health, scale are theirs), the rest
--    by the admin presets in turn:
--    verifier (verification), moderator (moderation), support (support),
--    finance (accountant, no personal data); authenticator "set up"
--    (totp_enabled_at), no password: they exist only through minted tokens.
--  * queue switches of «Админка и сотрудники» ON: desk, leases (verification,
--    reports, support, appeals), workspaces OFF (one team).
--  * enough open items for n workers: verification requests back to
--    "submitted", reports back to "open", support tickets "open".
\set ON_ERROR_STOP 1
BEGIN;
CREATE TEMP TABLE st AS
SELECT k,
       (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-a'||substr(h,18,3)||'-'||substr(h,21,12))::uuid AS id,
       CASE WHEN k % 50 = 0 THEN 'super_admin'
            ELSE (ARRAY['verifier','moderator','support','finance'])[1 + (k % 4)] END AS role
FROM (SELECT k, md5('staff'||k) AS h FROM generate_series(1, :n) k) x;

INSERT INTO users (id, role, status, first_name, last_name, created_at, updated_at)
SELECT id, 'admin', 'active', 'Staff', 'LT' || k, now(), now() FROM st
ON CONFLICT (id) DO NOTHING;

INSERT INTO admin_profiles (user_id, admin_role, permissions, workspace, created_at, updated_at)
SELECT id, role::admin_role,
  CASE role
    WHEN 'verifier'  THEN '{"dashboard":"view","users":"view","verification":"manage"}'
    WHEN 'moderator' THEN '{"dashboard":"view","users":"view","moderation":"manage","verification":"manage"}'
    WHEN 'support'   THEN '{"dashboard":"view","users":"view","support":"manage","chats":"manage"}'
    WHEN 'finance'   THEN '{"dashboard":"view","users":"view","money":"view","economy":"view","budget_limits":"manage","noPii":true}'
    ELSE '{}'
  END::jsonb,
  CASE role WHEN 'finance' THEN 'finance' WHEN 'super_admin' THEN 'owner' ELSE 'mass' END::admin_workspace,
  now(), now()
FROM st
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO admin_credentials (user_id, totp_secret_enc, totp_enabled_at, created_at, updated_at)
SELECT id, 'loadtest-not-a-secret', now(), now(), now() FROM st
ON CONFLICT (user_id) DO NOTHING;
-- the owner account of the short mix too
UPDATE admin_credentials SET totp_enabled_at = coalesce(totp_enabled_at, now())
WHERE user_id IN (SELECT user_id FROM admin_profiles WHERE admin_role = 'super_admin');

INSERT INTO app_config (key, value, updated_at)
SELECT k, 'true'::jsonb, now() FROM unnest(ARRAY[
  'staff.desk_enabled', 'staff.lease_enabled', 'staff.lease_support_enabled',
  'staff.lease_verification_enabled', 'staff.lease_report_enabled',
  'staff.lease_appeal_enabled', 'staff.sampling_enabled'
]) k
ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb, updated_at = now();

UPDATE verification_requests SET status = 'submitted' WHERE status IN ('approved', 'rejected', 'in_review');
UPDATE reports SET status = 'open' WHERE status = 'dismissed';
UPDATE support_tickets SET status = 'open' WHERE status IN ('closed', 'resolved', 'waiting_user');
DELETE FROM work_leases;
-- The API validates path ids as version-4 uuids; the generators' md5 ids
-- mostly are not. Verification requests and support tickets get a v4 form
-- of the same id (version nibble 4, variant a; foreign keys follow, ON
-- UPDATE CASCADE); the report queue leases the reported TARGET, so open
-- reports point at posts whose ids already are v4.
UPDATE verification_requests SET id = overlay(overlay(id::text PLACING '4' FROM 15 FOR 1) PLACING 'a' FROM 20 FOR 1)::uuid
  WHERE id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab]';
UPDATE verification_documents SET id = overlay(overlay(id::text PLACING '4' FROM 15 FOR 1) PLACING 'a' FROM 20 FOR 1)::uuid
  WHERE id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab]';
UPDATE support_tickets SET id = overlay(overlay(id::text PLACING '4' FROM 15 FOR 1) PLACING 'a' FROM 20 FOR 1)::uuid
  WHERE id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab]';
WITH p AS (SELECT id, author_id, row_number() OVER () AS rn FROM posts
           WHERE id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab]' AND deleted_at IS NULL LIMIT 8000),
     r AS (SELECT id, row_number() OVER () AS rn FROM reports
           WHERE NOT (target_type = 'post' AND target_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab]'))
UPDATE reports SET target_type = 'post', target_id = p.id, target_author_id = p.author_id
FROM r JOIN p ON p.rn = r.rn WHERE reports.id = r.id;
COMMIT;
SELECT role, count(*) FROM st GROUP BY 1 ORDER BY 1;
\copy (SELECT k, id, role FROM st ORDER BY k) TO '/tmp/staff.txt'
