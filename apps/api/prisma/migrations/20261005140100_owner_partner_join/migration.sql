-- Owner 2026-10-05: partners join by themselves; a request the admin
-- approves or declines tells the person.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'partner_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'partner_declined';
