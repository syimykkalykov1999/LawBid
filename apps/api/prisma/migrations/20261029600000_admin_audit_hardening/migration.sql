-- Owner 2026-10-28 (attorney-client privilege + admin hardening).
-- 1) audit_log.reason_code: the coded reason of a private-content read.
-- 2) A tamper-evident hash chain: every new audit row stores the hash of the
--    row before it. The trigger (not the application) fills seq, prev_hash
--    and row_hash, so every insert path is covered, and the advisory lock
--    makes concurrent writers take turns. Rows written before this
--    migration have no hash (the chain starts at the first hashed row).
ALTER TABLE "audit_log" ADD COLUMN "reason_code" TEXT;
ALTER TABLE "audit_log" ADD COLUMN "seq" BIGINT;
ALTER TABLE "audit_log" ADD COLUMN "prev_hash" TEXT;
ALTER TABLE "audit_log" ADD COLUMN "row_hash" TEXT;
CREATE UNIQUE INDEX "audit_log_seq_key" ON "audit_log"("seq");

-- The hash of one row given the hash before it. IMMUTABLE and shared by the
-- trigger and the verifier, so both always compute the same value.
CREATE FUNCTION audit_log_row_hash(prev text, r audit_log) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(
    coalesce(prev, '') || '|' || r.seq::text || '|' || r.id::text || '|' ||
    r.admin_id::text || '|' || r.action || '|' || r.target_type || '|' ||
    coalesce(r.target_id::text, '') || '|' || coalesce(r.justification, '') || '|' ||
    coalesce(r.reason_code, '') || '|' || coalesce(r.before::text, '') || '|' ||
    coalesce(r.after::text, '') || '|' || coalesce(r.ip, '') || '|' ||
    to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    'UTF8')), 'hex')
$$;

CREATE FUNCTION audit_log_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  last_seq bigint;
  last_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(7243001);
  SELECT seq, row_hash INTO last_seq, last_hash
    FROM audit_log WHERE seq IS NOT NULL ORDER BY seq DESC LIMIT 1;
  NEW.seq := coalesce(last_seq, 0) + 1;
  NEW.prev_hash := last_hash;
  NEW.row_hash := audit_log_row_hash(last_hash, NEW);
  RETURN NEW;
END
$$;

CREATE TRIGGER audit_log_chain_trg BEFORE INSERT ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_chain();
