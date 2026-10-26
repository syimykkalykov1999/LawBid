-- Owner 2026-10-22 (security audit #3): "a sign-in method, a contact or
-- the password changed on your account". Enum value in its own migration:
-- a new value cannot be used in the transaction that adds it.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'security_sign_in_changed';
