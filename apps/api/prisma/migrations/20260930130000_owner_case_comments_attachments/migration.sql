-- Owner decision 2026-09-30 (OQ-034): comments under cases (like post
-- comments), case documents, new report/notification kinds.
ALTER TYPE "file_purpose" ADD VALUE 'case_attachment';
ALTER TYPE "report_target_type" ADD VALUE 'case_comment';
ALTER TYPE "notification_type" ADD VALUE 'case_comment';

ALTER TABLE "cases" ADD COLUMN "comment_count" INT4 NOT NULL DEFAULT 0;

CREATE TABLE "case_comments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "case_id" UUID NOT NULL REFERENCES "cases"("id") ON DELETE RESTRICT,
  "author_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "parent_comment_id" UUID REFERENCES "case_comments"("id") ON DELETE RESTRICT,
  "body" STRING NOT NULL,
  "status" "content_status" NOT NULL DEFAULT 'published',
  "like_count" INT4 NOT NULL DEFAULT 0,
  "reply_count" INT4 NOT NULL DEFAULT 0,
  "deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "case_comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "case_comments_body_len" CHECK (char_length("body") BETWEEN 1 AND 1000)
);
CREATE INDEX "case_comments_case_id_created_at_idx" ON "case_comments"("case_id", "created_at");
CREATE INDEX "case_comments_parent_comment_id_created_at_idx" ON "case_comments"("parent_comment_id", "created_at");

CREATE TABLE "case_comment_likes" (
  "comment_id" UUID NOT NULL REFERENCES "case_comments"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "case_comment_likes_pkey" PRIMARY KEY ("comment_id", "user_id")
);
