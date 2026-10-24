-- Run AFTER scripts/ops/admin-load-gen.sql and scripts/ops/user-load-gen.sql
-- on the same (migrated) load-test database. What the two generators do not
-- set up but the load test needs:
--   * calls: a call may only be started in a chat whose contacts are unlocked
--     (bid accepted) - unlock all seeded chats;
--   * admin share of the mix: the admin guard wants an authenticator to be
--     enabled on the admin account (admin_credentials.totp_enabled_at).
--   * ids: the seed's ids are md5-made uuids and the strict validators of
--     GET /cases/:id and /cases/:id/bids reject them (not version 4). 300
--     copies of cases of the first 400 clients (and their bids) get random
--     v4 ids, so the mix can open a case and its bids like a real person.
--     The chats of the first 1 200 attorneys (about 6 000 chats) get random v4
--     ids IN PLACE (the foreign keys are ON UPDATE CASCADE): sending a
--     message and starting a call need such an id.
--     The posts of the same attorneys (about 36 000) get v4 ids too, for
--     GET /posts/:id.
--   * calls and chats need the attorney's subscription to be active (the seed
--     gives 4 of 7 attorneys other statuses): all subscriptions active for 40 days.
-- Idempotent.
\timing on
UPDATE subscriptions SET status = 'active', current_period_end = now() + interval '40 days' WHERE status <> 'active' OR current_period_end < now() + interval '30 days';
UPDATE conversations SET contacts_unlocked = true WHERE NOT contacts_unlocked;

INSERT INTO admin_credentials (user_id, totp_secret_enc, totp_enabled_at, recovery_codes_hash, login, created_at, updated_at)
SELECT md5('u0')::uuid, 'loadtest-not-a-real-secret', now(), '{}', 'loadtest-admin', now(), now()
WHERE EXISTS (SELECT 1 FROM users WHERE id = md5('u0')::uuid)
ON CONFLICT (user_id) DO UPDATE SET totp_enabled_at = COALESCE(admin_credentials.totp_enabled_at, now());

-- posts with v4 ids (the authors are the first 1 200 attorneys)
UPDATE posts SET id = gen_random_uuid()
WHERE author_id IN (SELECT md5('u' || (10 * g))::uuid FROM generate_series(1, 1200) g)
  AND id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab]';

-- chats with v4 ids (see above); skipped when enough exist already
UPDATE conversations SET id = gen_random_uuid()
WHERE attorney_id IN (SELECT md5('u' || (10 * g))::uuid FROM generate_series(1, 1200) g)
  AND id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab]';

DO $$
DECLARE cc text; bc text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) INTO cc FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cases' AND is_generated = 'NEVER';
  SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) INTO bc FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bids' AND is_generated = 'NEVER';
  IF NOT EXISTS (SELECT 1 FROM cases WHERE title LIKE '%(v4)') THEN
    CREATE TEMP TABLE _map AS
      SELECT id AS old_id, gen_random_uuid() AS new_id FROM cases
      WHERE client_id IN (SELECT md5('u' || g)::uuid FROM generate_series(1, 400) g WHERE g % 10 <> 0)
      ORDER BY id LIMIT 300;
    CREATE TEMP TABLE _c AS SELECT c.* FROM cases c JOIN _map m ON m.old_id = c.id;
    UPDATE _c SET id = m.new_id, title = _c.title || ' (v4)' FROM _map m WHERE m.old_id = _c.id;
    EXECUTE format('INSERT INTO cases (%s) SELECT %s FROM _c', cc, cc);
    CREATE TEMP TABLE _b AS SELECT b.* FROM bids b JOIN _map m ON m.old_id = b.case_id;
    UPDATE _b SET id = gen_random_uuid(), case_id = m.new_id FROM _map m WHERE m.old_id = _b.case_id;
    EXECUTE format('INSERT INTO bids (%s) SELECT %s FROM _b', bc, bc);
  END IF;
END $$;

ANALYZE;
SELECT 'users' AS t, count(*) FROM users
UNION ALL SELECT 'conversations_unlocked', count(*) FROM conversations WHERE contacts_unlocked
UNION ALL SELECT 'chats_v4', count(*) FROM conversations WHERE id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab]'
UNION ALL SELECT 'posts_v4', count(*) FROM posts WHERE id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab]'
UNION ALL SELECT 'cases_v4', count(*) FROM cases WHERE title LIKE '%(v4)'
UNION ALL SELECT 'admin_credentials', count(*) FROM admin_credentials;
