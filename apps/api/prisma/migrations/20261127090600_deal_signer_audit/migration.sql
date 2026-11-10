SET LOCAL lock_timeout = '5s';
-- 2026-11-08 (owner, deal record v2): the same audit data for both signers
-- of a deal record, captured at signing — the device, how the signer's
-- sign-in identity was verified, the app language, and the consent lines
-- shown above «Confirm». Additive and nullable: Docs-tab signatures and
-- every existing row stay as they are (the PDF prints «—» for a gap).
ALTER TABLE "case_signatures" ADD COLUMN "device" VARCHAR(160);
ALTER TABLE "case_signatures" ADD COLUMN "auth_method" VARCHAR(16);
ALTER TABLE "case_signatures" ADD COLUMN "lang" VARCHAR(16);
ALTER TABLE "case_signatures" ADD COLUMN "consents" JSONB;
