-- Owner 2026-10-15: the app's own crash reports, grouped by fingerprint in
-- the admin; old rows are purged by a daily job.
CREATE TABLE "crash_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fingerprint" VARCHAR(40) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "stack" VARCHAR(6000) NOT NULL,
    "fatal" BOOLEAN NOT NULL DEFAULT false,
    "platform" VARCHAR(12) NOT NULL,
    "app_version" VARCHAR(30) NOT NULL,
    "build" VARCHAR(20) NOT NULL,
    "flavor" VARCHAR(12) NOT NULL,
    "os_version" VARCHAR(40) NOT NULL,
    "device_model" VARCHAR(60) NOT NULL,
    "device_key" VARCHAR(80),
    "route" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crash_reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "crash_reports_fingerprint_created_at_idx" ON "crash_reports"("fingerprint", "created_at" DESC);
CREATE INDEX "crash_reports_created_at_idx" ON "crash_reports"("created_at");
