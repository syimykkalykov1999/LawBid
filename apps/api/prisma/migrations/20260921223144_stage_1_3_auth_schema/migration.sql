-- Stage 1.3: auth schema (docs/01_FOUNDATION_AUTH.md §15 -- generated via
-- `prisma migrate diff --from-empty --to-schema-datamodel` (no live
-- CockroachDB instance was available in the sandbox to run
-- `prisma migrate dev` directly). Verified: `prisma validate` and
-- `prisma generate` both pass against this schema. NOT yet verified:
-- this file has not been applied to a real running CockroachDB --
-- that must happen the first time `prisma migrate deploy` (or
-- `docker compose up` + `prisma migrate dev`) is run against a live
-- instance, per docs/CHANGELOG.md.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('client', 'attorney', 'admin');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'suspended', 'deletion_pending', 'deleted');

-- CreateEnum
CREATE TYPE "theme_pref" AS ENUM ('system', 'light', 'dark');

-- CreateEnum
CREATE TYPE "identifier_type" AS ENUM ('phone', 'email', 'apple', 'google');

-- CreateEnum
CREATE TYPE "consent_type" AS ENUM ('terms', 'privacy', 'disclaimer', 'client_contact_sharing', 'age_18', 'marketing_email', 'marketing_push', 'analytics');

-- CreateEnum
CREATE TYPE "legal_doc_type" AS ENUM ('terms', 'privacy', 'disclaimer', 'client_contact_sharing');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role" "user_role" NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'active',
    "first_name" STRING,
    "last_name" STRING,
    "avatar_file_id" UUID,
    "email" STRING,
    "email_verified_at" TIMESTAMPTZ,
    "phone_e164" STRING,
    "phone_verified_at" TIMESTAMPTZ,
    "ui_language" STRING NOT NULL DEFAULT 'en',
    "theme" "theme_pref" NOT NULL DEFAULT 'system',
    "suspended_reason" STRING,
    "last_active_at" TIMESTAMPTZ,
    "deletion_requested_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "anonymized_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_identifiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" "identifier_type" NOT NULL,
    "provider_uid" STRING NOT NULL,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "device_id" STRING,
    "device_name" STRING,
    "platform" STRING,
    "app_version" STRING,
    "ip" STRING,
    "user_agent" STRING,
    "refresh_hash" STRING NOT NULL,
    "last_used_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "revoked_reason" STRING,
    "replaced_by_session_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "event_type" STRING NOT NULL,
    "success" BOOL NOT NULL,
    "identifier_hash" STRING,
    "ip" STRING,
    "device_id" STRING,
    "user_agent" STRING,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "doc_type" "legal_doc_type" NOT NULL,
    "version" STRING NOT NULL,
    "locale" STRING NOT NULL,
    "content_url" STRING,
    "content_md" STRING,
    "published_at" TIMESTAMPTZ,
    "is_current" BOOL NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "consent_type" "consent_type" NOT NULL,
    "document_id" UUID,
    "granted" BOOL NOT NULL,
    "ip" STRING,
    "device_id" STRING,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_state" (
    "user_id" UUID NOT NULL,
    "current_step" STRING,
    "completed_at" TIMESTAMPTZ,
    "data" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "onboarding_state_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "blocked_email_domains" (
    "domain" STRING NOT NULL,
    "reason" STRING NOT NULL,

    CONSTRAINT "blocked_email_domains_pkey" PRIMARY KEY ("domain")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" STRING NOT NULL,
    "enabled" BOOL NOT NULL,
    "rollout_percent" INT4 NOT NULL DEFAULT 100,
    "description" STRING,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "i18n_languages" (
    "code" STRING NOT NULL,
    "name_native" STRING NOT NULL,
    "is_active" BOOL NOT NULL,
    "is_rtl" BOOL NOT NULL DEFAULT false,
    "sort" INT4 NOT NULL,

    CONSTRAINT "i18n_languages_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "i18n_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" STRING NOT NULL,
    "description" STRING,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "i18n_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "i18n_translations" (
    "key_id" UUID NOT NULL,
    "lang" STRING NOT NULL,
    "value" STRING NOT NULL,
    "version" INT4 NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "i18n_translations_pkey" PRIMARY KEY ("key_id","lang")
);

-- CreateTable
CREATE TABLE "i18n_bundle_versions" (
    "lang" STRING NOT NULL,
    "version" INT4 NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "i18n_bundle_versions_pkey" PRIMARY KEY ("lang")
);

-- CreateIndex
CREATE INDEX "user_identifiers_user_id_idx" ON "user_identifiers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_identifiers_provider_provider_uid_key" ON "user_identifiers"("provider", "provider_uid");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_hash_key" ON "sessions"("refresh_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_events_user_id_created_at_idx" ON "auth_events"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_doc_type_version_locale_key" ON "legal_documents"("doc_type", "version", "locale");

-- CreateIndex
CREATE INDEX "user_consents_user_id_consent_type_created_at_idx" ON "user_consents"("user_id", "consent_type", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "i18n_keys_key_key" ON "i18n_keys"("key");

-- AddForeignKey
ALTER TABLE "user_identifiers" ADD CONSTRAINT "user_identifiers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_state" ADD CONSTRAINT "onboarding_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "i18n_translations" ADD CONSTRAINT "i18n_translations_key_id_fkey" FOREIGN KEY ("key_id") REFERENCES "i18n_keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "i18n_translations" ADD CONSTRAINT "i18n_translations_lang_fkey" FOREIGN KEY ("lang") REFERENCES "i18n_languages"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "i18n_bundle_versions" ADD CONSTRAINT "i18n_bundle_versions_lang_fkey" FOREIGN KEY ("lang") REFERENCES "i18n_languages"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
