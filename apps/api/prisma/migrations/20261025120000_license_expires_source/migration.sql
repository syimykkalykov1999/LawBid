-- Owner 2026-10-24: where a license's expiry date came from.
ALTER TABLE "attorney_licenses" ADD COLUMN "expires_source" VARCHAR(16);
ALTER TABLE "attorney_licenses" ADD CONSTRAINT "attorney_licenses_expires_source_check"
  CHECK ("expires_source" IS NULL OR "expires_source" IN ('registry', 'attorney', 'admin'));
