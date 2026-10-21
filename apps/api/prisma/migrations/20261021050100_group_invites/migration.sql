-- Owner 2026-10-21 (Instagram): nobody is put into a group; they are invited
-- and join after «Accept».
CREATE TABLE chat_group_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  invitee_id   UUID NOT NULL,
  inviter_id   UUID NOT NULL,
  status       VARCHAR(10) NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  CONSTRAINT chat_group_invites_status_chk CHECK (status IN ('pending', 'accepted', 'declined'))
);
CREATE UNIQUE INDEX chat_group_invites_group_id_invitee_id_key ON chat_group_invites (group_id, invitee_id);
CREATE INDEX chat_group_invites_invitee_id_status_idx ON chat_group_invites (invitee_id, status);
