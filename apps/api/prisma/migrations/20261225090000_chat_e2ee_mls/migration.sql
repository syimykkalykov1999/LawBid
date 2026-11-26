SET LOCAL lock_timeout = '5s';
-- Item 25 (docs/architecture/E2EE_MLS_PLAN_2026-11-25.md): end-to-end
-- encrypted chats on MLS (RFC 9420). The server becomes the MLS Delivery
-- Service: device directory with public signature keys, the KeyPackage
-- directory, one MLS group per conversation with its ordered commits,
-- Welcomes for joining devices, and `mls` messages that carry only the
-- ciphertext. Expand only: new tables, one enum value, nullable columns
-- (metadata-only ALTERs, no rewrite). Nothing changes until the app sends
-- MLS traffic (admin switch chat.e2ee_mode).
-- AlterEnum
ALTER TYPE "message_type" ADD VALUE IF NOT EXISTS 'mls';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "e2ee_since" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "ciphertext" BYTEA,
ADD COLUMN     "mls_epoch" INTEGER;

-- CreateTable
CREATE TABLE "mls_devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "signature_key" BYTEA NOT NULL,
    "platform" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "mls_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mls_key_packages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" UUID NOT NULL,
    "data" BYTEA NOT NULL,
    "last_resort" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mls_key_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mls_groups" (
    "conversation_id" UUID NOT NULL,
    "group_id" BYTEA NOT NULL,
    "epoch" INTEGER NOT NULL DEFAULT 0,
    "created_by_device" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "mls_groups_pkey" PRIMARY KEY ("conversation_id")
);

-- CreateTable
CREATE TABLE "mls_commits" (
    "conversation_id" UUID NOT NULL,
    "epoch" INTEGER NOT NULL,
    "sender_device_id" UUID NOT NULL,
    "data" BYTEA NOT NULL,
    "added_devices" UUID[] DEFAULT ARRAY[]::UUID[],
    "removed_devices" UUID[] DEFAULT ARRAY[]::UUID[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mls_commits_pkey" PRIMARY KEY ("conversation_id","epoch")
);

-- CreateTable
CREATE TABLE "mls_group_devices" (
    "conversation_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_epoch" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mls_group_devices_pkey" PRIMARY KEY ("conversation_id","device_id")
);

-- CreateTable
CREATE TABLE "mls_welcomes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "epoch" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mls_welcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mls_devices_user_id_revoked_at_idx" ON "mls_devices"("user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "mls_devices_user_id_signature_key_key" ON "mls_devices"("user_id", "signature_key");

-- CreateIndex
CREATE INDEX "mls_key_packages_device_id_last_resort_created_at_idx" ON "mls_key_packages"("device_id", "last_resort", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "mls_groups_group_id_key" ON "mls_groups"("group_id");

-- CreateIndex
CREATE INDEX "mls_group_devices_device_id_idx" ON "mls_group_devices"("device_id");

-- CreateIndex
CREATE INDEX "mls_group_devices_conversation_id_user_id_idx" ON "mls_group_devices"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "mls_welcomes_device_id_created_at_idx" ON "mls_welcomes"("device_id", "created_at");

-- CreateIndex
CREATE INDEX "mls_welcomes_conversation_id_idx" ON "mls_welcomes"("conversation_id");

-- CreateIndex
CREATE INDEX "mls_welcomes_created_at_idx" ON "mls_welcomes"("created_at");

-- AddForeignKey
ALTER TABLE "mls_devices" ADD CONSTRAINT "mls_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mls_key_packages" ADD CONSTRAINT "mls_key_packages_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "mls_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

