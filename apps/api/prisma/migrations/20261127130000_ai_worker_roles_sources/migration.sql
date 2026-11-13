SET LOCAL lock_timeout = '5s';
-- Owner 2026-11-12 (rows 53, 51): «ИИ-сотрудник» per-role «Вкл / Выкл», the
-- support-reply switch «Отправлять уверенные ответы сам» (default OFF) and
-- when an approved reply went out. Expand-only: three new columns with
-- constant defaults on small owner tables nobody else reads.
ALTER TABLE "ai_roles" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ai_roles" ADD COLUMN "auto_send" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ai_run_items" ADD COLUMN "delivered_at" TIMESTAMPTZ;
