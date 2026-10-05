-- Owner 2026-10-05: where the paid translator may be used, per zone
-- (data only). Today the app translates chat messages; a new zone gets
-- its own `translate.<zone>` key when its "Translate" button ships.
INSERT INTO "app_config" ("key", "value", "updated_at") VALUES
  ('translate.chat', 'true'::JSONB, now())
ON CONFLICT ("key") DO NOTHING;
