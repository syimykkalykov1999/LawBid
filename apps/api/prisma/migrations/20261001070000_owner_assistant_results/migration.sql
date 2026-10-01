-- OQ-048: the assistant hears back when the attorney answers a request or
-- finishes / moves a task they set.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'assistant_result';
