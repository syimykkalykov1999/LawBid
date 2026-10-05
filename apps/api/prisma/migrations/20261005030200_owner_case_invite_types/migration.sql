-- Owner 2026-10-05: a client offers a case to a chosen attorney.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'case_invite_received';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'case_invite_declined';
