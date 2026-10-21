-- Owner 2026-10-21: disappearing messages (WhatsApp). Nullable columns with
-- no default: metadata-only, no table rewrite.
ALTER TABLE public.conversations
  ADD COLUMN disappear_after_s integer,
  ADD CONSTRAINT conversations_disappear_after_chk
    CHECK (disappear_after_s IS NULL OR disappear_after_s BETWEEN 60 AND 31536000);
ALTER TABLE public.chat_groups
  ADD COLUMN disappear_after_s integer,
  ADD CONSTRAINT chat_groups_disappear_after_chk
    CHECK (disappear_after_s IS NULL OR disappear_after_s BETWEEN 60 AND 31536000);
ALTER TABLE public.messages ADD COLUMN expires_at timestamptz;
ALTER TABLE public.chat_group_messages ADD COLUMN expires_at timestamptz;
