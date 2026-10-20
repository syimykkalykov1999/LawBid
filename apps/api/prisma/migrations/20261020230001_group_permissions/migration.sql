ALTER TABLE "chat_groups" ADD COLUMN "who_can_media" "group_who" NOT NULL DEFAULT 'all';
ALTER TABLE "chat_groups" ADD COLUMN "who_can_poll" "group_who" NOT NULL DEFAULT 'all';
ALTER TABLE "chat_groups" ADD COLUMN "who_can_pin" "group_who" NOT NULL DEFAULT 'admins';
ALTER TABLE "chat_group_members" ADD COLUMN "admin_rights" TEXT[] DEFAULT ARRAY[]::TEXT[];
-- Admins made before per-admin rights keep what an admin could always do.
UPDATE "chat_group_members" SET "admin_rights" = ARRAY['info','delete','ban','invite','pin','calls']::TEXT[] WHERE "role" = 'admin';
