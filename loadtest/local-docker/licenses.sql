-- The repo generators give attorneys no licences / practice areas, so the
-- attorney case feed (cases-visible.sql.ts) matched nothing and scanned every
-- open case. Real attorneys have them: one verified licence (state n % 45)
-- and two practice areas (n % 40, (n + 7) % 40), the same state / area
-- numbering the case generator uses. Idempotent.
\timing on
CREATE TEMP TABLE att AS SELECT user_id, row_number() over (order by user_id) AS n FROM attorney_profiles;
CREATE TEMP TABLE pa  AS SELECT id, row_number() over (order by id) AS n FROM practice_areas;
CREATE TEMP TABLE st  AS SELECT code, row_number() over (order by code) AS n FROM states;
CREATE INDEX ON pa(n); CREATE INDEX ON st(n); ANALYZE att; ANALYZE pa; ANALYZE st;
INSERT INTO attorney_licenses (attorney_id, state_code, bar_number, license_status, verified_at, created_at, updated_at)
SELECT a.user_id, s.code, 'LT' || a.n, 'verified', now(), now(), now()
FROM att a JOIN st s ON s.n = 1 + (a.n % 45)
WHERE NOT EXISTS (SELECT 1 FROM attorney_licenses l WHERE l.attorney_id = a.user_id);
INSERT INTO attorney_practice_areas (attorney_id, practice_area_id, created_at)
SELECT a.user_id, p.id, now() FROM att a JOIN pa p ON p.n IN (1 + (a.n % 40), 1 + ((a.n + 7) % 40))
ON CONFLICT DO NOTHING;
ANALYZE attorney_licenses; ANALYZE attorney_practice_areas;
SELECT (SELECT count(*) FROM attorney_licenses) licences, (SELECT count(*) FROM attorney_practice_areas) practice_rows;
