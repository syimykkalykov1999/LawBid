-- OQ-048: "Assistant of <attorney>" label — the assistant's name at send time.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_by_name STRING(80);
