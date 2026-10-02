-- Admin access control (owner 2026-10-02): login + password as the first
-- factor, a security question for the super admin, per-area permissions.

ALTER TABLE admin_credentials ADD COLUMN login VARCHAR(40) NULL;
ALTER TABLE admin_credentials ADD COLUMN password_hash STRING NULL;
ALTER TABLE admin_credentials ADD COLUMN password_changed_at TIMESTAMPTZ NULL;
ALTER TABLE admin_credentials ADD COLUMN security_question VARCHAR(200) NULL;
ALTER TABLE admin_credentials ADD COLUMN security_answer_hash STRING NULL;
CREATE UNIQUE INDEX admin_credentials_login_key ON admin_credentials (login);

ALTER TABLE admin_profiles ADD COLUMN permissions JSONB NOT NULL DEFAULT '{}';

-- Existing staff keep what their role gave them, except money (hard-denied
-- for everyone but the super admin from now on).
UPDATE admin_profiles SET permissions = '{"dashboard":"view","moderation":"manage","content":"manage","media":"manage","users":"view"}'::JSONB
  WHERE admin_role = 'moderator';
UPDATE admin_profiles SET permissions = '{"dashboard":"view","verification":"manage","users":"view"}'::JSONB
  WHERE admin_role = 'verifier';
UPDATE admin_profiles SET permissions = '{"dashboard":"view","support":"manage","users":"view"}'::JSONB
  WHERE admin_role = 'support';
UPDATE admin_profiles SET permissions = '{"dashboard":"view","support":"view","users":"view"}'::JSONB
  WHERE admin_role = 'finance';
