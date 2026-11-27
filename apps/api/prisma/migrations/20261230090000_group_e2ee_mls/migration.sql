SET LOCAL lock_timeout = '5s';
-- Group chats end to end encrypted, phase G1 (server)
-- (docs/architecture/GROUP_E2EE_DESIGN_2026-11-26.md §7): the MLS Delivery
-- Service of item 25 serves group chats too. Its tables get a `scope`
-- (conversation | group; chat and group ids are both UUIDs and never
-- collide, so the keys stay), the group keeps its latest GroupInfo for
-- external-commit joins (RFC 9420 §12.4.3.2), a device's last own commit
-- (the periodic self-update), and group messages carry only ciphertext.
-- Expand only: one enum value, nullable columns and columns with constant
-- defaults (metadata-only ALTERs, no table rewrite; on the partitioned
-- chat_group_messages the parent's ALTER reaches every partition).
-- Nothing changes until the admin switch groups.e2ee_mode leaves Выкл.

-- AlterEnum
ALTER TYPE "group_message_type" ADD VALUE IF NOT EXISTS 'mls';

-- AlterTable
ALTER TABLE "mls_groups" ADD COLUMN "scope" VARCHAR(12) NOT NULL DEFAULT 'conversation',
ADD COLUMN "group_info" BYTEA,
ADD COLUMN "group_info_file_id" UUID,
ADD COLUMN "group_info_epoch" INTEGER;

-- AlterTable
ALTER TABLE "mls_commits" ADD COLUMN "scope" VARCHAR(12) NOT NULL DEFAULT 'conversation',
ADD COLUMN "external" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "mls_group_devices" ADD COLUMN "scope" VARCHAR(12) NOT NULL DEFAULT 'conversation',
ADD COLUMN "last_commit_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "mls_welcomes" ADD COLUMN "scope" VARCHAR(12) NOT NULL DEFAULT 'conversation';

-- AlterTable
ALTER TABLE "chat_groups" ADD COLUMN "e2ee_since" TIMESTAMPTZ,
ADD COLUMN "history_sharing" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "chat_group_messages" ADD COLUMN "ciphertext" BYTEA,
ADD COLUMN "mls_epoch" INTEGER,
ADD COLUMN "sender_device_id" UUID,
ADD COLUMN "franking_tag" BYTEA;
