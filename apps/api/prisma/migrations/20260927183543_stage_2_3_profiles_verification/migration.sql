-- CreateTable
CREATE TABLE "client_profiles" (
    "user_id" UUID NOT NULL,
    "state_code" CHAR(2) NOT NULL,
    "preferred_languages" STRING[],
    "preferred_contact_method" "contact_method",
    "preferred_contact_note" STRING,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "client_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "attorney_profiles" (
    "user_id" UUID NOT NULL,
    "username" STRING NOT NULL,
    "username_lower" STRING NOT NULL,
    "bio" STRING,
    "firm_name" STRING,
    "languages" STRING[],
    "verification_status" "verification_status" NOT NULL DEFAULT 'unverified',
    "verified_at" TIMESTAMPTZ,
    "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "rating_count" INT4 NOT NULL DEFAULT 0,
    "posts_count" INT4 NOT NULL DEFAULT 0,
    "followers_count" INT4 NOT NULL DEFAULT 0,
    "following_count" INT4 NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "attorney_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "attorney_licenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attorney_id" UUID NOT NULL,
    "state_code" CHAR(2) NOT NULL,
    "bar_number" STRING NOT NULL,
    "license_status" "license_status" NOT NULL DEFAULT 'pending',
    "expires_at" DATE,
    "verified_at" TIMESTAMPTZ,
    "verified_by" UUID,
    "auto_check_result" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "attorney_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attorney_practice_areas" (
    "attorney_id" UUID NOT NULL,
    "practice_area_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attorney_practice_areas_pkey" PRIMARY KEY ("attorney_id","practice_area_id")
);

-- CreateTable
CREATE TABLE "verification_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attorney_id" UUID NOT NULL,
    "status" "verification_request_status" NOT NULL,
    "provider" "verification_provider" NOT NULL DEFAULT 'manual',
    "provider_ref" STRING,
    "submitted_at" TIMESTAMPTZ,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "rejection_reason" STRING,
    "admin_note" STRING,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "doc_type" "verification_doc_type" NOT NULL,
    "file_id" UUID NOT NULL,
    "state_code" CHAR(2),
    "notes" STRING,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "verification_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "check_type" "verification_check_type" NOT NULL,
    "provider" "verification_provider" NOT NULL,
    "result" "check_result" NOT NULL,
    "details" JSONB NOT NULL,
    "checked_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attorney_profiles_username_lower_key" ON "attorney_profiles"("username_lower");

-- CreateIndex
CREATE INDEX "attorney_licenses_attorney_id_idx" ON "attorney_licenses"("attorney_id");

-- CreateIndex
CREATE INDEX "attorney_licenses_state_code_license_status_idx" ON "attorney_licenses"("state_code", "license_status");

-- CreateIndex
CREATE UNIQUE INDEX "attorney_licenses_state_code_bar_number_key" ON "attorney_licenses"("state_code", "bar_number");

-- CreateIndex
CREATE INDEX "attorney_practice_areas_practice_area_id_attorney_id_idx" ON "attorney_practice_areas"("practice_area_id", "attorney_id");

-- CreateIndex
CREATE INDEX "verification_requests_attorney_id_idx" ON "verification_requests"("attorney_id");

-- CreateIndex
CREATE INDEX "verification_requests_status_submitted_at_idx" ON "verification_requests"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "verification_documents_request_id_idx" ON "verification_documents"("request_id");

-- CreateIndex
CREATE INDEX "verification_checks_request_id_idx" ON "verification_checks"("request_id");

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_state_code_fkey" FOREIGN KEY ("state_code") REFERENCES "states"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attorney_profiles" ADD CONSTRAINT "attorney_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attorney_licenses" ADD CONSTRAINT "attorney_licenses_attorney_id_fkey" FOREIGN KEY ("attorney_id") REFERENCES "attorney_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attorney_licenses" ADD CONSTRAINT "attorney_licenses_state_code_fkey" FOREIGN KEY ("state_code") REFERENCES "states"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attorney_licenses" ADD CONSTRAINT "attorney_licenses_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attorney_practice_areas" ADD CONSTRAINT "attorney_practice_areas_attorney_id_fkey" FOREIGN KEY ("attorney_id") REFERENCES "attorney_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attorney_practice_areas" ADD CONSTRAINT "attorney_practice_areas_practice_area_id_fkey" FOREIGN KEY ("practice_area_id") REFERENCES "practice_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_attorney_id_fkey" FOREIGN KEY ("attorney_id") REFERENCES "attorney_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "verification_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_state_code_fkey" FOREIGN KEY ("state_code") REFERENCES "states"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_checks" ADD CONSTRAINT "verification_checks_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "verification_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- docs/02_DATABASE.md §4.C / §6.1: length limits.
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_contact_note_len" CHECK (char_length("preferred_contact_note") <= 200);
ALTER TABLE "attorney_profiles" ADD CONSTRAINT "attorney_profiles_bio_len" CHECK (char_length("bio") <= 300);
-- username_lower must be the lowercased username (UQ is case-insensitive by construction).
ALTER TABLE "attorney_profiles" ADD CONSTRAINT "attorney_profiles_username_lower_ck" CHECK ("username_lower" = lower("username"));
