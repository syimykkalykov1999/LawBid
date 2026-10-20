-- Owner 2026-10-20: group chats (Telegram + WhatsApp): types, topics, polls.
-- CreateEnum
CREATE TYPE "chat_group_role" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "group_who" AS ENUM ('admins', 'all');

-- CreateEnum
CREATE TYPE "group_type" AS ENUM ('public', 'closed', 'private');

-- CreateEnum
CREATE TYPE "group_message_type" AS ENUM ('text', 'system', 'poll', 'attachment');

-- CreateTable
CREATE TABLE "chat_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "avatar_file_id" UUID,
    "created_by" UUID NOT NULL,
    "group_type" "group_type" NOT NULL DEFAULT 'private',
    "username" VARCHAR(32),
    "username_lower" VARCHAR(32),
    "join_approval" BOOLEAN NOT NULL DEFAULT false,
    "topics_enabled" BOOLEAN NOT NULL DEFAULT false,
    "general_topic_id" UUID,
    "invite_code" VARCHAR(24) NOT NULL,
    "invite_enabled" BOOLEAN NOT NULL DEFAULT false,
    "who_can_post" "group_who" NOT NULL DEFAULT 'all',
    "who_can_add" "group_who" NOT NULL DEFAULT 'admins',
    "who_can_edit_info" "group_who" NOT NULL DEFAULT 'admins',
    "who_can_call" "group_who" NOT NULL DEFAULT 'admins',
    "pinned_message_id" UUID,
    "last_message_id" UUID,
    "last_message_at" TIMESTAMPTZ,
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "chat_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_group_members" (
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "chat_group_role" NOT NULL DEFAULT 'member',
    "added_by" UUID,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ,
    "left_reason" VARCHAR(12),
    "last_read_message_id" UUID,
    "muted_until" TIMESTAMPTZ,
    "pinned_at" TIMESTAMPTZ,
    "hidden_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "chat_group_members_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateTable
CREATE TABLE "chat_group_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "sender_id" UUID,
    "type" "group_message_type" NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "client_message_id" TEXT NOT NULL,
    "system_kind" VARCHAR(24),
    "system_payload" JSONB,
    "topic_id" UUID,
    "reply_to_id" UUID,
    "mention_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "file_id" UUID,
    "file_name" TEXT,
    "edited_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_group_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_group_topics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "title" VARCHAR(64) NOT NULL,
    "icon_emoji" VARCHAR(16),
    "color" INTEGER NOT NULL DEFAULT 0,
    "is_general" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "closed_at" TIMESTAMPTZ,
    "pinned_at" TIMESTAMPTZ,
    "last_message_id" UUID,
    "last_message_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "chat_group_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_group_topic_reads" (
    "topic_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_message_id" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "chat_group_topic_reads_pkey" PRIMARY KEY ("topic_id","user_id")
);

-- CreateTable
CREATE TABLE "chat_group_join_requests" (
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_group_join_requests_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateTable
CREATE TABLE "chat_group_polls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "question" VARCHAR(300) NOT NULL,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "anonymous" BOOLEAN NOT NULL DEFAULT true,
    "closed_at" TIMESTAMPTZ,
    "closed_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_group_polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_group_poll_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "poll_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "text" VARCHAR(100) NOT NULL,

    CONSTRAINT "chat_group_poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_group_poll_votes" (
    "poll_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_group_poll_votes_pkey" PRIMARY KEY ("option_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_groups_username_lower_key" ON "chat_groups"("username_lower");

-- CreateIndex
CREATE UNIQUE INDEX "chat_groups_invite_code_key" ON "chat_groups"("invite_code");

-- CreateIndex
CREATE INDEX "chat_groups_created_by_idx" ON "chat_groups"("created_by");

-- CreateIndex
CREATE INDEX "chat_groups_avatar_file_id_idx" ON "chat_groups"("avatar_file_id");

-- CreateIndex
CREATE INDEX "chat_group_members_user_id_left_at_idx" ON "chat_group_members"("user_id", "left_at");

-- CreateIndex
CREATE INDEX "chat_group_messages_group_id_created_at_idx" ON "chat_group_messages"("group_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "chat_group_messages_topic_id_created_at_idx" ON "chat_group_messages"("topic_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "chat_group_messages_sender_id_idx" ON "chat_group_messages"("sender_id");

-- CreateIndex
CREATE INDEX "chat_group_messages_file_id_idx" ON "chat_group_messages"("file_id");

-- CreateIndex
CREATE INDEX "chat_group_messages_reply_to_id_idx" ON "chat_group_messages"("reply_to_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_group_messages_group_id_sender_id_client_message_id_key" ON "chat_group_messages"("group_id", "sender_id", "client_message_id");

-- CreateIndex
CREATE INDEX "chat_group_topics_group_id_last_message_at_idx" ON "chat_group_topics"("group_id", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "chat_group_topic_reads_user_id_idx" ON "chat_group_topic_reads"("user_id");

-- CreateIndex
CREATE INDEX "chat_group_join_requests_user_id_idx" ON "chat_group_join_requests"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_group_polls_message_id_key" ON "chat_group_polls"("message_id");

-- CreateIndex
CREATE INDEX "chat_group_polls_group_id_idx" ON "chat_group_polls"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_group_poll_options_poll_id_position_key" ON "chat_group_poll_options"("poll_id", "position");

-- CreateIndex
CREATE INDEX "chat_group_poll_votes_poll_id_user_id_idx" ON "chat_group_poll_votes"("poll_id", "user_id");

-- AddForeignKey
ALTER TABLE "chat_groups" ADD CONSTRAINT "chat_groups_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat_groups" ADD CONSTRAINT "chat_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat_group_members" ADD CONSTRAINT "chat_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "chat_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_group_members" ADD CONSTRAINT "chat_group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_group_messages" ADD CONSTRAINT "chat_group_messages_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "chat_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_group_messages" ADD CONSTRAINT "chat_group_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat_group_messages" ADD CONSTRAINT "chat_group_messages_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "chat_group_topics"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat_group_messages" ADD CONSTRAINT "chat_group_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "chat_group_messages"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat_group_messages" ADD CONSTRAINT "chat_group_messages_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat_group_topics" ADD CONSTRAINT "chat_group_topics_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "chat_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_group_topic_reads" ADD CONSTRAINT "chat_group_topic_reads_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "chat_group_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_group_topic_reads" ADD CONSTRAINT "chat_group_topic_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_group_join_requests" ADD CONSTRAINT "chat_group_join_requests_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "chat_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_group_join_requests" ADD CONSTRAINT "chat_group_join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_group_polls" ADD CONSTRAINT "chat_group_polls_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "chat_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_group_polls" ADD CONSTRAINT "chat_group_polls_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_group_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_group_polls" ADD CONSTRAINT "chat_group_polls_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat_group_poll_options" ADD CONSTRAINT "chat_group_poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "chat_group_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_group_poll_votes" ADD CONSTRAINT "chat_group_poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "chat_group_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_group_poll_votes" ADD CONSTRAINT "chat_group_poll_votes_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "chat_group_poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_group_poll_votes" ADD CONSTRAINT "chat_group_poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_groups"
  ADD CONSTRAINT "chat_groups_title_chk" CHECK (char_length(btrim("title")) BETWEEN 1 AND 80),
  ADD CONSTRAINT "chat_groups_member_count_chk" CHECK ("member_count" >= 0),
  ADD CONSTRAINT "chat_groups_username_chk" CHECK (
    ("group_type" = 'public') = ("username" IS NOT NULL)
    AND ("username" IS NULL OR "username" ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$')),
  ADD CONSTRAINT "chat_groups_private_no_link_chk" CHECK ("group_type" <> 'private' OR NOT "invite_enabled");
ALTER TABLE "chat_group_topics"
  ADD CONSTRAINT "chat_group_topics_title_chk" CHECK (char_length(btrim("title")) BETWEEN 1 AND 64),
  ADD CONSTRAINT "chat_group_topics_color_chk" CHECK ("color" BETWEEN 0 AND 6);
ALTER TABLE "chat_group_poll_options"
  ADD CONSTRAINT "chat_group_poll_options_text_chk" CHECK (char_length(btrim("text")) BETWEEN 1 AND 100);
ALTER TABLE "chat_group_polls"
  ADD CONSTRAINT "chat_group_polls_question_chk" CHECK (char_length(btrim("question")) BETWEEN 1 AND 300);
-- Active members of a group (the common lookup).
CREATE INDEX "chat_group_members_active_idx" ON "chat_group_members" ("group_id") WHERE "left_at" IS NULL;
-- One «General» topic per group.
CREATE UNIQUE INDEX "chat_group_topics_one_general_idx" ON "chat_group_topics" ("group_id") WHERE "is_general";
