-- Owner 2026-10-05: automatic license check per state. Each state picks an
-- adapter (manual by default) and, when the registry needs one, an API key
-- kept as an AES-256-GCM envelope. A self-attested license the registry
-- disagrees with stays verified and gets a flag for the admin.
ALTER TABLE "attorney_licenses" ADD COLUMN "registry_flag" STRING;
ALTER TABLE "attorney_licenses" ADD COLUMN "registry_flagged_at" TIMESTAMPTZ;

CREATE TABLE "state_bar_registries" (
    "state_code" CHAR(2) NOT NULL,
    "adapter" STRING NOT NULL DEFAULT 'manual',
    "enabled" BOOL NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secret_enc" STRING,
    "secret_masked" STRING,
    "test_bar_number" STRING,
    "last_test_at" TIMESTAMPTZ,
    "last_test_result" JSONB,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "state_bar_registries_pkey" PRIMARY KEY ("state_code")
);

CREATE INDEX "attorney_licenses_registry_flag_idx" ON "attorney_licenses"("registry_flag");

ALTER TABLE "state_bar_registries" ADD CONSTRAINT "state_bar_registries_state_code_fkey" FOREIGN KEY ("state_code") REFERENCES "states"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- New York's open dataset was the one registry behind the global flag
-- `auto_bar_check`; it becomes the NY row and keeps the flag's state.
INSERT INTO "state_bar_registries" ("state_code", "adapter", "enabled", "updated_at")
SELECT s.code, 'ny_open_data',
       COALESCE((SELECT f.enabled FROM feature_flags f WHERE f.key = 'auto_bar_check'), false),
       now()
  FROM states s
 WHERE s.code = 'NY'
ON CONFLICT ("state_code") DO NOTHING;
