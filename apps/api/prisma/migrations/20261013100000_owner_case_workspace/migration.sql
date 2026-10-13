-- Owner 2026-10-13: the case workspace — a note, a source and an author on
-- every case file; shared / for-client tasks with their activity; the
-- Updates feed.
ALTER TABLE "case_photos" ADD COLUMN IF NOT EXISTS "description" VARCHAR(500);
ALTER TABLE "case_photos" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'case';
ALTER TABLE "case_photos" ADD COLUMN IF NOT EXISTS "source_id" UUID;
ALTER TABLE "case_photos" ADD COLUMN IF NOT EXISTS "added_by" UUID;
ALTER TABLE "case_photos" ADD CONSTRAINT "case_photos_source_valid" CHECK ("source" IN ('case', 'task', 'update'));
CREATE INDEX IF NOT EXISTS "case_photos_source_source_id_idx" ON "case_photos"("source", "source_id");

CREATE TABLE IF NOT EXISTS "case_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "created_by" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "done_at" TIMESTAMPTZ,
    "done_by" UUID,
    "closed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "case_tasks_kind_valid" CHECK ("kind" IN ('shared', 'for_client')),
    CONSTRAINT "case_tasks_status_valid" CHECK ("status" IN ('open', 'done')),
    CONSTRAINT "case_tasks_description_len" CHECK ("description" IS NULL OR char_length("description") <= 5000)
);
CREATE INDEX IF NOT EXISTS "case_tasks_case_id_created_at_idx" ON "case_tasks"("case_id", "created_at");
ALTER TABLE "case_tasks" ADD CONSTRAINT "case_tasks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "case_task_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "note" VARCHAR(1000),
    "file_count" INT4 NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_task_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "case_task_events_type_valid" CHECK ("type" IN ('created', 'files_added', 'done', 'undone', 'closed', 'reopened'))
);
CREATE INDEX IF NOT EXISTS "case_task_events_task_id_created_at_idx" ON "case_task_events"("task_id", "created_at");
CREATE INDEX IF NOT EXISTS "case_task_events_case_id_created_at_idx" ON "case_task_events"("case_id", "created_at");
ALTER TABLE "case_task_events" ADD CONSTRAINT "case_task_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "case_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "case_updates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_updates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "case_updates_case_id_created_at_idx" ON "case_updates"("case_id", "created_at");
ALTER TABLE "case_updates" ADD CONSTRAINT "case_updates_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
