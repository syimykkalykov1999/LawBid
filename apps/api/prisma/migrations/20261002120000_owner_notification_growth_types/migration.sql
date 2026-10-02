-- Notification types for the referral reward and case promotion events.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'referral_reward';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'promotion_started';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'promotion_ended';
