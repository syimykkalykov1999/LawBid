-- Owner 2026-10-01: Telegram-style stickers — a sticker image is its own
-- file purpose (public media) and a chat message can be a sticker.
ALTER TYPE file_purpose ADD VALUE IF NOT EXISTS 'sticker';
ALTER TYPE message_type ADD VALUE IF NOT EXISTS 'sticker';
