-- Owner 2026-10-21 (Instagram «Поделиться»): a post sent into a chat as a
-- card. Expand only: one enum value.
ALTER TYPE "message_type" ADD VALUE IF NOT EXISTS 'post';
