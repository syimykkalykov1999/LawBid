-- Owner 2026-10-04: an attorney confirms the license under a sworn
-- statement instead of documents. When, from where and which wording
-- version was accepted (additive, nullable).
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS attested_at TIMESTAMPTZ;
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS attestation_ip STRING;
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS attestation_version STRING;
