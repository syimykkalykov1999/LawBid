-- A signature is evidence: once written it is never changed, and it goes
-- only together with its signing request (the cascade when a case is purged).
CREATE FUNCTION case_signatures_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'case_signatures rows are immutable';
  END IF;
  IF EXISTS (SELECT 1 FROM case_sign_requests WHERE id = OLD.request_id) THEN
    RAISE EXCEPTION 'case_signatures rows are deleted only with their request';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_signatures_immutable
  BEFORE UPDATE OR DELETE ON case_signatures
  FOR EACH ROW EXECUTE FUNCTION case_signatures_guard();
