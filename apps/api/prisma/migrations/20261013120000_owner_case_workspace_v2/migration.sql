-- Owner 2026-10-13: checklist items in a for-client task (with their own
-- files), either side attaches files to a task, updates up to 5000
-- characters, the "read" mark of the Updates tab.
ALTER TABLE "case_photos" ADD COLUMN IF NOT EXISTS "source_item_id" UUID;
ALTER TABLE "case_updates" ALTER COLUMN "body" TYPE VARCHAR(5000);

CREATE TABLE IF NOT EXISTS "case_task_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "position" INT2 NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "done_at" TIMESTAMPTZ,
    "done_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_task_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "case_task_items_task_id_position_idx" ON "case_task_items"("task_id", "position");
ALTER TABLE "case_task_items" ADD CONSTRAINT "case_task_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "case_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "case_reads" (
    "case_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "updates_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_reads_pkey" PRIMARY KEY ("case_id", "user_id")
);
