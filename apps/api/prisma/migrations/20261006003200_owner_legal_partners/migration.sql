-- Owner 2026-10-05 (legal): partner rules and tax paperwork.
-- The partner accepts the rules (FTC Endorsement Guides disclosure, no
-- spam / cold calls, independent contractor, ...) in the app: when, which
-- version and from which IP. A W-9 (or W-8) must be on file before the
-- first payout when partners.program.requireW9 is on.
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "terms_accepted_at" TIMESTAMPTZ;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "terms_version" STRING(16);
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "terms_ip" STRING(45);
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "w9_received_at" TIMESTAMPTZ;
