-- A chat removed from my list only (Owner 2026-10-02); a new message revives it.
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
