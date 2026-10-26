\timing on
INSERT INTO practice_areas (id, code, name_en, i18n_key, sort)
SELECT gen_random_uuid(), 'perf_'||g, 'Perf '||g, 'practice.perf_'||g, g FROM generate_series(1,40) g;
-- vocabulary: 60 legal words + a zipf-like long tail
CREATE TEMP TABLE vocab AS
SELECT row_number() over () AS n, w FROM unnest(ARRAY['immigration','green','card','visa','divorce','custody','speeding','ticket','license','dui','lawsuit','contract','landlord','tenant','deposit','eviction','trademark','patent','copyright','business','llc','tax','audit','injury','accident','insurance','claim','bankruptcy','debt','collector','employment','harassment','wages','discrimination','criminal','defense','bail','probate','estate','will','trust','real','estate','closing','mortgage','foreclosure','medical','malpractice','workers','compensation','social','security','disability','veterans','benefits','consumer','fraud','privacy','school','citizenship']) AS w;
CREATE OR REPLACE FUNCTION rnd_words(k int) RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT string_agg(CASE WHEN random() < 0.6 THEN (ARRAY['immigration','green','card','visa','divorce','custody','speeding','ticket','license','dui','lawsuit','contract','landlord','tenant','deposit','eviction','trademark','patent','copyright','business','llc','tax','audit','injury','accident','insurance','claim','bankruptcy','debt','collector','employment','harassment','wages','discrimination','criminal','defense','bail','probate','estate','will','trust','real','estate','closing','mortgage','foreclosure','medical','malpractice','workers','compensation','social','security','disability','veterans','benefits','consumer','fraud','privacy','school','citizenship'])[1 + floor(random()*60)::int] ELSE 'term'||floor(power(random(),3)*20000)::int END, ' ')
  FROM generate_series(1,k) $$;
INSERT INTO users (id, role, first_name, last_name, status, updated_at)
SELECT gen_random_uuid(), CASE WHEN g % 10 = 0 THEN 'attorney'::user_role ELSE 'client'::user_role END,
  (ARRAY['Sofia','Ivan','Amelia','James','Priya','Victor','Emily','Daniel','Maria','Chen','Omar','Anna'])[1+g%12],
  (ARRAY['Hernandez','Carter','Alvarez','Nata','Whitfield','Kim','Goodman','Brown','Lopez','Singh'])[1+g%10] || (g % 997), 'active', now()
FROM generate_series(1,500000) g;
INSERT INTO attorney_profiles (user_id, username, username_lower, updated_at, verification_status)
SELECT id, 'law'||row_number() over (), 'law'||row_number() over (), now(), 'verified'
FROM users WHERE role='attorney';
CREATE TEMP TABLE att AS SELECT user_id, row_number() over () AS n FROM attorney_profiles;
CREATE TEMP TABLE cli AS SELECT id, row_number() over () AS n FROM users WHERE role='client';
CREATE TEMP TABLE pa AS SELECT id, row_number() over () AS n FROM practice_areas;
CREATE TEMP TABLE st AS SELECT code, row_number() over () AS n FROM states;
CREATE INDEX ON att(n); CREATE INDEX ON cli(n); CREATE INDEX ON pa(n); CREATE INDEX ON st(n); CREATE INDEX ON vocab(n); ANALYZE att; ANALYZE cli; ANALYZE pa; ANALYZE st; ANALYZE vocab;
INSERT INTO posts (id, author_id, title, body, updated_at, created_at, like_count, comment_count)
SELECT gen_random_uuid(), (SELECT user_id FROM att WHERE n = 1 + (g % 50000)),
  CASE WHEN g % 3 = 0 THEN rnd_words(5) END, rnd_words(40), now(), now() - (g || ' seconds')::interval, g % 50, g % 7
FROM generate_series(1,2000000) g;
INSERT INTO cases (id, client_id, title, description, practice_area_id, primary_state_code, budget_mode, updated_at, created_at)
SELECT gen_random_uuid(), (SELECT id FROM cli WHERE n = 1 + (g % 400000)), rnd_words(7), rnd_words(50),
  (SELECT id FROM pa WHERE n = 1 + (g % 40)), (SELECT code FROM st WHERE n = 1 + (g % 45)), 'clarify_later', now(), now() - (g || ' seconds')::interval
FROM generate_series(1,1000000) g;
ANALYZE;
SELECT 'users', count(*) FROM users UNION ALL SELECT 'posts', count(*) FROM posts UNION ALL SELECT 'cases', count(*) FROM cases;
