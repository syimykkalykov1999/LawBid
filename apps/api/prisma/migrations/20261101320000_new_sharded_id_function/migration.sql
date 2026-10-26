-- DB-ops hardening S5-12: a time-ordered id for DEFAULTs written in SQL.
-- The application generates UUIDv8 ids that carry their logical shard
-- (src/sharding/shard-id.ts); anything that inserts without the application
-- (raw SQL, a backfill, SHARD_IDS=off) still falls back to the random
-- gen_random_uuid() default and writes a random v4 into a hot primary key,
-- which loses the index locality the v8 design paid for. This is the same
-- layout as newShardedId() in SQL, for NEW tables and raw inserts going
-- forward (existing columns keep their default; nothing is changed here):
--
--   bytes 0-5  48-bit unix time in ms     bytes 8-15  variant `10` + 62 random bits
--   byte  6    version 8 | shard bits 11..8   byte 7  shard bits 7..0
--
--   id UUID PRIMARY KEY DEFAULT new_sharded_id()      -- shard 0 (global tables)
--   SELECT new_sharded_id(42);                        -- a given logical shard
CREATE OR REPLACE FUNCTION new_sharded_id(shard INTEGER DEFAULT 0)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
PARALLEL SAFE
AS $fn$
DECLARE
  ms BIGINT := floor(extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  b BYTEA := uuid_send(gen_random_uuid());
  i INTEGER;
BEGIN
  IF shard IS NULL OR shard < 0 OR shard > 4095 THEN
    RAISE EXCEPTION 'new_sharded_id: shard must be 0..4095, got %', shard;
  END IF;
  FOR i IN 0..5 LOOP
    b := set_byte(b, i, ((ms >> (8 * (5 - i))) & 255)::INTEGER);
  END LOOP;
  b := set_byte(b, 6, 128 | ((shard >> 8) & 15));
  b := set_byte(b, 7, shard & 255);
  b := set_byte(b, 8, 128 | (get_byte(b, 8) & 63));
  RETURN encode(b, 'hex')::UUID;
END
$fn$;
