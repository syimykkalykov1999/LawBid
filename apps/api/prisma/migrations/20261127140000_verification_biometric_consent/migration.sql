-- Owner 2026-11-12 (row 52, face match): the attorney's written consent to
-- the automatic comparison of the selfie with the ID photo (Illinois BIPA,
-- Texas CUBI, Washington RCW 19.375): when it was given and which version
-- of the consent text was shown. Two nullable columns without a default: a
-- metadata-only change, no table rewrite.
SET LOCAL lock_timeout = '5s';
ALTER TABLE "verification_requests" ADD COLUMN "biometric_consent_at" TIMESTAMPTZ;
ALTER TABLE "verification_requests" ADD COLUMN "biometric_consent_version" TEXT;
