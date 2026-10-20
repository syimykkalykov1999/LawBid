-- A prepared statement is planned with the real values for its first five
-- runs, then Postgres may keep one "generic" plan. For the post reads the
-- generic plan reads the whole table (4 s on 100 k posts), so always plan
-- with the real values; planning costs about 1 ms on the heaviest queries.
-- Applies to new connections (the API picks it up on its next deploy).
DO $$
BEGIN
  EXECUTE format(
    'ALTER DATABASE %I SET plan_cache_mode = force_custom_plan',
    current_database());
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'plan_cache_mode not set: set it in the RDS parameter group';
END $$;
