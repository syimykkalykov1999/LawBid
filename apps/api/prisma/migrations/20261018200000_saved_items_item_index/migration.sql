-- Owner 2026-10-18: post statistics (GET /posts/:id/insights) count the
-- saves of one post by day; saved_items is keyed by the saver, so look
-- them up by the saved item too.
CREATE INDEX IF NOT EXISTS "saved_items_item_type_item_id_created_at_idx"
  ON "saved_items" ("item_type", "item_id", "created_at");
