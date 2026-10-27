-- Merge union 2026-10-27: #373's audit hash chain inside main's SERIALIZABLE
-- transactions (withTxRetry). The trigger read the newest audit row; a
-- serializable transaction reads it from its snapshot, so a row committed
-- by another writer after that snapshot was invisible and two rows took the
-- same seq (unique violation, HTTP 500 on admin invites / permissions).
-- Now the chain head lives in one row that every insert UPDATEs: READ
-- COMMITTED waits for the other writer and sees its value; SERIALIZABLE
-- gets a serialization failure (40001), which withTxRetry retries. The
-- hash formula and the verifier are unchanged.
CREATE TABLE "audit_log_chain_head" (
  "id" SMALLINT NOT NULL DEFAULT 1,
  "seq" BIGINT NOT NULL DEFAULT 0,
  "last_hash" TEXT,
  CONSTRAINT "audit_log_chain_head_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_log_chain_head_one_row" CHECK ("id" = 1)
);

INSERT INTO "audit_log_chain_head" ("id", "seq", "last_hash")
SELECT 1, coalesce(m.max_seq, 0),
       (SELECT a.row_hash FROM "audit_log" a WHERE a.seq = m.max_seq)
FROM (SELECT max(seq) AS max_seq FROM "audit_log") m;

CREATE OR REPLACE FUNCTION audit_log_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  head_seq bigint;
  head_hash text;
BEGIN
  UPDATE audit_log_chain_head SET seq = seq + 1 WHERE id = 1
    RETURNING seq, last_hash INTO head_seq, head_hash;
  NEW.seq := head_seq;
  NEW.prev_hash := head_hash;
  NEW.row_hash := audit_log_row_hash(head_hash, NEW);
  UPDATE audit_log_chain_head SET last_hash = NEW.row_hash WHERE id = 1;
  RETURN NEW;
END
$$;
