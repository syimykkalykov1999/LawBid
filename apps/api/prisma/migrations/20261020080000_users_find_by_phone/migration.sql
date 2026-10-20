-- Owner 2026-10-20 (privacy review of contacts sync): a client can switch
-- off "find me by my number"; default on, like WhatsApp.
ALTER TABLE "users" ADD COLUMN "find_by_phone" BOOLEAN NOT NULL DEFAULT true;
