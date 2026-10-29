-- Accepted offers for the seeded cases that are past "open" (in_progress /
-- closed): the generators leave every bid "active" and accepted_bid_id empty,
-- so the deal record / workspace screens of the full k6 mix (MIX=full) had
-- nothing to open. One bid per such case becomes the accepted one.
-- Load-test databases only (lawbid_lt*), after seed.sh.
BEGIN;
CREATE TEMP TABLE pick ON COMMIT DROP AS
  SELECT DISTINCT ON (b.case_id) b.case_id, b.id AS bid_id
  FROM bids b JOIN cases c ON c.id = b.case_id
  WHERE c.status IN ('in_progress', 'closed') AND c.accepted_bid_id IS NULL
  ORDER BY b.case_id, b.id;
UPDATE bids b SET status = 'accepted' FROM pick p WHERE b.id = p.bid_id;
UPDATE cases c SET accepted_bid_id = p.bid_id FROM pick p WHERE c.id = p.case_id;
COMMIT;
ANALYZE bids; ANALYZE cases;
