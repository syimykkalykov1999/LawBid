-- Owner 2026-10-22 (systems checklist §1): WebAuthn passkeys for the app
-- (sign-in option, step-up) and the admin panel (second factor next to
-- TOTP, step-up). Expand only: a new table, nothing existing changes.
CREATE TABLE "webauthn_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "scope" VARCHAR(8) NOT NULL,
    "credential_id" VARCHAR(1024) NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "device_type" VARCHAR(16) NOT NULL,
    "backed_up" BOOLEAN NOT NULL DEFAULT false,
    "aaguid" VARCHAR(36),
    "name" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ,

    CONSTRAINT "webauthn_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webauthn_credentials_credential_id_key" ON "webauthn_credentials"("credential_id");
CREATE INDEX "webauthn_credentials_user_id_scope_created_at_idx" ON "webauthn_credentials"("user_id", "scope", "created_at");

ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
