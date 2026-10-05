-- Owner 2026-10-05: where the paid translator may be used (data only).
-- translate.scope: 'all' = every zone, 'zones' = only the zones whose
-- translate.<zone> is true (Ключи и сервисы → Google Translate).
INSERT INTO "app_config" ("key", "value", "updated_at") VALUES
  ('translate.scope', '"all"'::JSONB, now()),
  ('translate.chat', 'true'::JSONB, now()),
  ('translate.posts', 'true'::JSONB, now()),
  ('translate.cases', 'true'::JSONB, now()),
  ('translate.reviews', 'true'::JSONB, now()),
  ('translate.profiles', 'true'::JSONB, now())
ON CONFLICT ("key") DO NOTHING;
