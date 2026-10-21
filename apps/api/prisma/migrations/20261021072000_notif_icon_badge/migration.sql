-- Owner 2026-10-21 (inbox 29): the switch «Счётчик на иконке в меню».
ALTER TABLE "users" ADD COLUMN "notif_icon_badge" BOOLEAN NOT NULL DEFAULT true;
