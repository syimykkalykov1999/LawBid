-- Owner 2026-10-01: an admin changed the account's phone on request.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'security_phone_changed';
