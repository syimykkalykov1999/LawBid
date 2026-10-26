-- Owner 2026-10-21 (Telegram «Запретить копирование и пересылку»).
ALTER TABLE "chat_groups" ADD COLUMN "protect_content" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "channels" ADD COLUMN "protect_content" BOOLEAN NOT NULL DEFAULT false;
