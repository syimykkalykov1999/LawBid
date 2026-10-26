-- Admin economy / speed pass (2026-10-23): a deterministic big-ish database for
-- measuring the admin endpoints (docs/perf/ADMIN_ECONOMY_2026-10-23.md).
--   100 000 users (10 % attorneys), 300 000 posts, 50 000 cases, 150 000 bids,
--   10 000 subscriptions, 30 000 payments, 20 000 case payments, 8 000 reports,
--   6 000 support tickets, 200 000 audit rows, 3 000 verification requests,
--   3 000 client fraud profiles, 2 000 bans, 100 000 comments.
-- No random(): every id is md5('<kind><n>')::uuid and every value a function
-- of n, so two runs give the same database. Run on a migrated EMPTY database:
--   psql "$DB" -f scripts/ops/admin-load-gen.sql          (about 1-2 minutes)
\timing on
SET synchronous_commit = off;

INSERT INTO practice_areas (id, code, name_en, i18n_key, sort)
SELECT md5('pa'||g)::uuid, 'perf_'||g, 'Perf '||g, 'practice.perf_'||g, g FROM generate_series(1,40) g;

-- users: 1 admin (n=0), then 100 000 people.
INSERT INTO users (id, role, first_name, last_name, email, status, country_code, created_at, updated_at)
SELECT md5('u'||g)::uuid,
  CASE WHEN g = 0 THEN 'admin'::user_role WHEN g % 10 = 0 THEN 'attorney'::user_role ELSE 'client'::user_role END,
  (ARRAY['Sofia','Ivan','Amelia','James','Priya','Victor','Emily','Daniel','Maria','Chen','Omar','Anna'])[1+g%12],
  (ARRAY['Hernandez','Carter','Alvarez','Nata','Whitfield','Kim','Goodman','Brown','Lopez','Singh'])[1+g%10] || (g % 997),
  'perf'||g||'@lawbid-perf.test',
  CASE WHEN g % 200 = 7 THEN 'suspended'::user_status ELSE 'active'::user_status END,
  (ARRAY['US','US','US','US','GB','CA','DE','FR'])[1+g%8],
  now() - (g || ' minutes')::interval, now()
FROM generate_series(0,100000) g;

INSERT INTO admin_profiles (user_id, admin_role, permissions, updated_at)
SELECT md5('u0')::uuid, 'super_admin', '{}'::jsonb, now()
ON CONFLICT DO NOTHING;

INSERT INTO attorney_profiles (user_id, username, username_lower, updated_at, verification_status)
SELECT id, 'law'||n, 'law'||n, now(),
  CASE WHEN n % 20 = 0 THEN 'pending'::verification_status WHEN n % 50 = 1 THEN 'suspended'::verification_status ELSE 'verified'::verification_status END
FROM (SELECT id, row_number() over (order by created_at) AS n FROM users WHERE role='attorney') a;

CREATE TEMP TABLE att AS SELECT user_id, row_number() over (order by user_id) AS n FROM attorney_profiles;
CREATE TEMP TABLE cli AS SELECT id, row_number() over (order by id) AS n FROM users WHERE role='client';
CREATE TEMP TABLE pa  AS SELECT id, row_number() over (order by id) AS n FROM practice_areas;
CREATE TEMP TABLE st  AS SELECT code, row_number() over (order by code) AS n FROM states;
CREATE INDEX ON att(n); CREATE INDEX ON cli(n); CREATE INDEX ON pa(n); CREATE INDEX ON st(n);
ANALYZE att; ANALYZE cli; ANALYZE pa; ANALYZE st;
CREATE TEMP TABLE nums AS SELECT g FROM generate_series(1,300000) g;

INSERT INTO posts (id, author_id, title, body, updated_at, created_at, like_count, comment_count)
SELECT md5('p'||g)::uuid, (SELECT user_id FROM att WHERE n = 1 + (g % (SELECT count(*) FROM att))),
  CASE WHEN g % 3 = 0 THEN 'Question about visa '||(g%500) END,
  'Body of the post number '||g||' about immigration, contracts and a landlord who keeps the deposit.',
  now(), now() - (g || ' minutes')::interval, g % 50, g % 7
FROM nums WHERE g <= 300000;

INSERT INTO comments (id, post_id, author_id, body, updated_at, created_at)
SELECT md5('c'||g)::uuid, md5('p'||(1 + g % 300000))::uuid, (SELECT id FROM cli WHERE n = 1 + (g % 90000)),
  'Comment '||g, now(), now() - (g || ' minutes')::interval
FROM generate_series(1,100000) g;

INSERT INTO cases (id, client_id, title, description, practice_area_id, primary_state_code, budget_mode, status, updated_at, created_at)
SELECT md5('case'||g)::uuid, (SELECT id FROM cli WHERE n = 1 + (g % 90000)), 'Case '||g||' landlord deposit',
  'Description of case '||g, (SELECT id FROM pa WHERE n = 1 + (g % 40)), (SELECT code FROM st WHERE n = 1 + (g % 45)),
  'clarify_later', (ARRAY['open','open','open','in_progress','closed','archived'])[1+g%6]::case_status, now(), now() - (g * 3 || ' minutes')::interval
FROM generate_series(1,50000) g;

INSERT INTO bids (id, case_id, attorney_id, fee_type, amount_cents, message, start_availability, turn, updated_at, created_at)
SELECT md5('b'||g)::uuid, md5('case'||(1 + g % 50000))::uuid, (SELECT user_id FROM att WHERE n = 1 + (g % 9000)),
  'fixed', 50000 + g % 100000, 'I can take this case.', 'immediately', 'client', now(), now() - (g || ' minutes')::interval
FROM generate_series(1,150000) g
ON CONFLICT DO NOTHING;

INSERT INTO subscriptions (id, user_id, status, price_cents, plan, assistant_seats, current_period_end, trial_ends_at, created_at, updated_at)
SELECT md5('s'||n)::uuid, user_id,
  (ARRAY['active','active','active','trialing','past_due','canceled','expired'])[1+n%7]::subscription_status,
  CASE WHEN n % 5 = 0 THEN 99000 ELSE 9900 END,
  CASE WHEN n % 5 = 0 THEN 'yearly'::subscription_plan ELSE 'monthly'::subscription_plan END,
  (n % 4)::smallint, now() + ((n % 40) || ' days')::interval, now() + ((n % 14) || ' days')::interval,
  now() - (n || ' hours')::interval, now()
FROM att WHERE n <= 10000;

INSERT INTO payments (id, user_id, amount_cents, status, paid_at, created_at, updated_at)
SELECT md5('pay'||g)::uuid, (SELECT user_id FROM att WHERE n = 1 + (g % 9000)), 9900,
  (ARRAY['succeeded','succeeded','succeeded','failed','refunded','pending'])[1+g%6]::payment_status,
  now() - (g || ' minutes')::interval, now() - (g || ' minutes')::interval, now()
FROM generate_series(1,30000) g;

INSERT INTO reports (id, reporter_id, target_type, target_id, reason, status, created_at, updated_at)
SELECT md5('r'||g)::uuid, (SELECT id FROM cli WHERE n = 1 + (g % 90000)), 'post', md5('p'||(1 + g % 300000))::uuid,
  (ARRAY['spam','abuse','misinformation','fraud'])[1+g%4]::report_reason,
  CASE WHEN g % 8 = 0 THEN 'open'::report_status ELSE 'dismissed'::report_status END,
  now() - (g || ' minutes')::interval, now()
FROM generate_series(1,8000) g;

INSERT INTO support_tickets (id, user_id, subject, status, created_at, updated_at)
SELECT md5('t'||g)::uuid, (SELECT id FROM cli WHERE n = 1 + (g % 90000)), 'Help with ticket '||g,
  (ARRAY['open','open','waiting_user','resolved','closed'])[1+g%5], now() - (g || ' minutes')::interval, now()
FROM generate_series(1,6000) g;

INSERT INTO audit_log (id, admin_id, action, target_type, target_id, created_at)
SELECT md5('a'||g)::uuid, md5('u0')::uuid, (ARRAY['user.suspend','report.dismiss','case.close','export.users'])[1+g%4],
  (ARRAY['user','report','case'])[1+g%3], md5('u'||(1 + g % 100000))::uuid, now() - (g || ' seconds')::interval
FROM generate_series(1,200000) g;

INSERT INTO verification_requests (id, attorney_id, status, submitted_at, created_at, updated_at)
SELECT md5('vr'||n)::uuid, user_id, (ARRAY['submitted','in_review','approved','rejected'])[1+n%4]::verification_request_status,
  now() - (n || ' minutes')::interval, now() - (n || ' minutes')::interval, now()
FROM att WHERE n <= 3000;

INSERT INTO client_fraud_profiles (user_id, status, score, updated_at)
SELECT id, (ARRAY['review','restricted','clear','clear'])[1+n%4], (n % 100)::int, now()
FROM (SELECT id, row_number() over (order by id) n FROM users WHERE role='client') c WHERE n <= 3000;

INSERT INTO account_bans (id, kind, value, reason, created_by, created_at)
SELECT md5('ban'||g)::uuid, (ARRAY['email','phone','device','email'])[1+g%4], 'banned'||g||'@spam.test', 'spam wave',
  md5('u0')::uuid, now() - (g || ' minutes')::interval
FROM generate_series(1,2000) g;

ANALYZE;
SELECT 'users' t, count(*) FROM users UNION ALL SELECT 'posts', count(*) FROM posts UNION ALL SELECT 'cases', count(*) FROM cases
UNION ALL SELECT 'bids', count(*) FROM bids UNION ALL SELECT 'subscriptions', count(*) FROM subscriptions
UNION ALL SELECT 'payments', count(*) FROM payments UNION ALL SELECT 'audit_log', count(*) FROM audit_log;
