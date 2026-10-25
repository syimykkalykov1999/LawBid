-- Owner 2026-10-28: attorney advertising archive (one row per published
-- version of an attorney's ad text; kept until retain_until). No FK so a
-- copy outlives the account.
CREATE TABLE "attorney_ad_archive" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "attorney_id"  UUID NOT NULL,
  "kind"         VARCHAR(16) NOT NULL,
  "source_id"    UUID NOT NULL,
  "version"      INTEGER NOT NULL,
  "content"      TEXT NOT NULL,
  "content_hash" VARCHAR(64) NOT NULL,
  "disclaimers"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "findings"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "state_codes"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "retain_until" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "attorney_ad_archive_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attorney_ad_archive_kind_check"
    CHECK ("kind" IN ('profile_bio', 'post', 'promotion'))
);
CREATE UNIQUE INDEX "attorney_ad_archive_kind_source_id_version_key"
  ON "attorney_ad_archive"("kind", "source_id", "version");
CREATE INDEX "attorney_ad_archive_attorney_id_created_at_idx"
  ON "attorney_ad_archive"("attorney_id", "created_at" DESC);
CREATE INDEX "attorney_ad_archive_retain_until_idx"
  ON "attorney_ad_archive"("retain_until");
