-- Owner 2026-10-20: government-request evidence archives and legal holds.
CREATE TABLE "legal_exports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_id" UUID NOT NULL,
  "subject_user_id" UUID NOT NULL,
  "requested_by" UUID NOT NULL,
  "status" VARCHAR(10) NOT NULL DEFAULT 'queued',
  "selection" JSONB NOT NULL,
  "file_bucket" TEXT,
  "file_key" TEXT,
  "size_bytes" BIGINT,
  "sha256" TEXT,
  "row_counts" JSONB,
  "error" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "started_at" TIMESTAMPTZ,
  "finished_at" TIMESTAMPTZ,
  "expires_at" TIMESTAMPTZ,
  CONSTRAINT "legal_exports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "legal_exports_request_fkey" FOREIGN KEY ("request_id") REFERENCES "data_access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "legal_exports_request_id_created_at_idx" ON "legal_exports" ("request_id", "created_at" DESC);
CREATE INDEX "legal_exports_status_created_at_idx" ON "legal_exports" ("status", "created_at");
CREATE INDEX "legal_exports_requested_by_created_at_idx" ON "legal_exports" ("requested_by", "created_at");

CREATE TABLE "legal_holds" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_id" UUID NOT NULL,
  "target_type" VARCHAR(12) NOT NULL,
  "target_id" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "expires_at" TIMESTAMPTZ,
  "released_at" TIMESTAMPTZ,
  CONSTRAINT "legal_holds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "legal_holds_request_fkey" FOREIGN KEY ("request_id") REFERENCES "data_access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "legal_holds_target_type_check" CHECK ("target_type" IN ('user','conversation','group'))
);
CREATE INDEX "legal_holds_target_type_target_id_idx" ON "legal_holds" ("target_type", "target_id");
CREATE INDEX "legal_holds_request_id_idx" ON "legal_holds" ("request_id");
