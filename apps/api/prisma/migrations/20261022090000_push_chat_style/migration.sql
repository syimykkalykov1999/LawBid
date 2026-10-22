-- Owner 2026-10-22 (message pushes like WhatsApp): the app on this Android
-- device draws chat notifications itself (sender's photo, one stack per
-- chat) from a data-only push; older app versions keep the normal alert.
ALTER TABLE "push_tokens" ADD COLUMN "chat_style" BOOLEAN NOT NULL DEFAULT false;
