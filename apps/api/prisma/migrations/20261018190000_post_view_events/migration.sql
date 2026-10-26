-- Owner 2026-10-18: per-post events (reel views now; impressions and
-- profile visits for the author's statistics later). One row per viewer +
-- post + kind per 24 h (PostEventsService.record); viewer_id NULL is an
-- anonymous event. posts.view_count = count(kind = 'view') (counter
-- reconcile).
CREATE TABLE IF NOT EXISTS "post_view_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "post_id" UUID NOT NULL,
  "viewer_id" UUID,
  "kind" VARCHAR(16) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_view_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "post_view_events_kind_check"
    CHECK ("kind" IN ('view', 'impression', 'profile_visit')),
  CONSTRAINT "post_view_events_post_id_fkey" FOREIGN KEY ("post_id")
    REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "post_view_events_viewer_id_fkey" FOREIGN KEY ("viewer_id")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "post_view_events_post_id_viewer_id_kind_created_at_idx"
  ON "post_view_events" ("post_id", "viewer_id", "kind", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "post_view_events_post_id_kind_created_at_idx"
  ON "post_view_events" ("post_id", "kind", "created_at" DESC);

-- The views counted so far (one per viewer, post_views) become 'view'
-- events at their time, so view_count keeps its value on recount.
INSERT INTO "post_view_events" ("post_id", "viewer_id", "kind", "created_at")
SELECT v."post_id", v."user_id", 'view', v."created_at"
FROM "post_views" v
WHERE NOT EXISTS (
  SELECT 1 FROM "post_view_events" e
  WHERE e."post_id" = v."post_id" AND e."viewer_id" = v."user_id"
    AND e."kind" = 'view'
);
