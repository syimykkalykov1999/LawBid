-- Owner 2026-10-20: stories (24 h) and Telegram-style channels. Expand only.

-- CreateTable
CREATE TABLE "stories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id" UUID NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "file_id" UUID,
    "video_asset_id" UUID,
    "text" VARCHAR(280),
    "background" VARCHAR(16),
    "overlays" JSONB NOT NULL DEFAULT '[]',
    "audience" VARCHAR(10) NOT NULL DEFAULT 'all',
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_views" (
    "story_id" UUID NOT NULL,
    "viewer_id" UUID NOT NULL,
    "viewed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_views_pkey" PRIMARY KEY ("story_id","viewer_id")
);

-- CreateTable
CREATE TABLE "story_hidden" (
    "owner_id" UUID NOT NULL,
    "hidden_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_hidden_pkey" PRIMARY KEY ("owner_id","hidden_user_id")
);

-- CreateTable
CREATE TABLE "story_settings" (
    "user_id" UUID NOT NULL,
    "audience" VARCHAR(10) NOT NULL DEFAULT 'all',
    "allow_replies" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "title" VARCHAR(64) NOT NULL,
    "username" VARCHAR(32) NOT NULL,
    "description" VARCHAR(255),
    "avatar_file_id" UUID,
    "comments_enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "moderation_note" VARCHAR(255),
    "subscriber_count" INTEGER NOT NULL DEFAULT 0,
    "post_count" INTEGER NOT NULL DEFAULT 0,
    "last_post_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_admins" (
    "channel_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(8) NOT NULL DEFAULT 'admin',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_admins_pkey" PRIMARY KEY ("channel_id","user_id")
);

-- CreateTable
CREATE TABLE "channel_subscriptions" (
    "channel_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_subscriptions_pkey" PRIMARY KEY ("channel_id","user_id")
);

-- CreateTable
CREATE TABLE "channel_posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "media_file_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "video_asset_id" UUID,
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "channel_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_post_views" (
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "viewed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_post_views_pkey" PRIMARY KEY ("post_id","user_id")
);

-- CreateTable
CREATE TABLE "channel_reactions" (
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "emoji" VARCHAR(8) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_reactions_pkey" PRIMARY KEY ("post_id","user_id")
);

-- CreateTable
CREATE TABLE "channel_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "channel_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stories_video_asset_id_key" ON "stories"("video_asset_id");

-- CreateIndex
CREATE INDEX "stories_author_created_idx" ON "stories"("author_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stories_expires_idx" ON "stories"("expires_at");

-- CreateIndex
CREATE INDEX "story_views_story_time_idx" ON "story_views"("story_id", "viewed_at" DESC);

-- CreateIndex
CREATE INDEX "story_views_viewer_time_idx" ON "story_views"("viewer_id", "viewed_at" DESC);

-- CreateIndex
CREATE INDEX "story_hidden_hidden_user_id_idx" ON "story_hidden"("hidden_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "channels_username_key" ON "channels"("username");

-- CreateIndex
CREATE INDEX "channels_status_subscribers_idx" ON "channels"("status", "subscriber_count" DESC);

-- CreateIndex
CREATE INDEX "channels_owner_idx" ON "channels"("owner_id");

-- CreateIndex
CREATE INDEX "channel_admins_user_id_idx" ON "channel_admins"("user_id");

-- CreateIndex
CREATE INDEX "channel_subscriptions_user_idx" ON "channel_subscriptions"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "channel_posts_video_asset_id_key" ON "channel_posts"("video_asset_id");

-- CreateIndex
CREATE INDEX "channel_posts_channel_created_idx" ON "channel_posts"("channel_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "channel_reactions_post_emoji_idx" ON "channel_reactions"("post_id", "emoji");

-- CreateIndex
CREATE INDEX "channel_comments_post_created_idx" ON "channel_comments"("post_id", "created_at");

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_author_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_file_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_video_asset_fkey" FOREIGN KEY ("video_asset_id") REFERENCES "video_assets"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_story_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_viewer_fkey" FOREIGN KEY ("viewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "story_hidden" ADD CONSTRAINT "story_hidden_owner_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "story_hidden" ADD CONSTRAINT "story_hidden_target_fkey" FOREIGN KEY ("hidden_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "story_settings" ADD CONSTRAINT "story_settings_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_owner_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_avatar_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "channel_admins" ADD CONSTRAINT "channel_admins_channel_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "channel_admins" ADD CONSTRAINT "channel_admins_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "channel_subscriptions" ADD CONSTRAINT "channel_subscriptions_channel_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "channel_subscriptions" ADD CONSTRAINT "channel_subscriptions_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "channel_posts" ADD CONSTRAINT "channel_posts_channel_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "channel_posts" ADD CONSTRAINT "channel_posts_author_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "channel_posts" ADD CONSTRAINT "channel_posts_video_asset_fkey" FOREIGN KEY ("video_asset_id") REFERENCES "video_assets"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "channel_post_views" ADD CONSTRAINT "channel_post_views_post_fkey" FOREIGN KEY ("post_id") REFERENCES "channel_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "channel_reactions" ADD CONSTRAINT "channel_reactions_post_fkey" FOREIGN KEY ("post_id") REFERENCES "channel_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "channel_reactions" ADD CONSTRAINT "channel_reactions_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "channel_comments" ADD CONSTRAINT "channel_comments_post_fkey" FOREIGN KEY ("post_id") REFERENCES "channel_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "channel_comments" ADD CONSTRAINT "channel_comments_author_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- Short string columns hold a fixed vocabulary.
ALTER TABLE "stories"
  ADD CONSTRAINT "stories_kind_check" CHECK (kind IN ('photo', 'video', 'text')),
  ADD CONSTRAINT "stories_audience_check" CHECK (audience IN ('all', 'followers', 'contacts')),
  ADD CONSTRAINT "stories_status_check" CHECK (status IN ('active', 'removed')),
  ADD CONSTRAINT "stories_media_check" CHECK (
    (kind = 'photo' AND file_id IS NOT NULL)
    OR (kind = 'video' AND video_asset_id IS NOT NULL)
    OR (kind = 'text' AND text IS NOT NULL)
  );
ALTER TABLE "story_settings"
  ADD CONSTRAINT "story_settings_audience_check" CHECK (audience IN ('all', 'followers', 'contacts'));
ALTER TABLE "channels"
  ADD CONSTRAINT "channels_status_check" CHECK (status IN ('active', 'hidden', 'banned')),
  ADD CONSTRAINT "channels_username_check" CHECK (username ~ '^[a-z][a-z0-9_]{3,31}$');
ALTER TABLE "channel_admins"
  ADD CONSTRAINT "channel_admins_role_check" CHECK (role IN ('owner', 'admin'));
ALTER TABLE "channel_posts"
  ADD CONSTRAINT "channel_posts_status_check" CHECK (status IN ('active', 'hidden', 'removed')),
  ADD CONSTRAINT "channel_posts_media_check" CHECK (cardinality(media_file_ids) <= 10);
