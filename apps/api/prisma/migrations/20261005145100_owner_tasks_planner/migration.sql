-- Owner 2026-10-05: the attorney's planner — many addresses and many
-- people on one task, priority, repeating tasks, reminders, assignment
-- to an assistant, a link to the chat, and the archive (finished tasks
-- are kept, then removed after tasks.archive_retention_days unless kept
-- forever).
CREATE TYPE IF NOT EXISTS attorney_task_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE IF NOT EXISTS attorney_task_repeat AS ENUM ('none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly');

ALTER TABLE attorney_tasks
  ADD COLUMN IF NOT EXISTS assignee_membership_id UUID NULL,
  ADD COLUMN IF NOT EXISTS conversation_id UUID NULL,
  ADD COLUMN IF NOT EXISTS priority attorney_task_priority NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS repeat attorney_task_repeat NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS repeat_until TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS repeated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS remind_before_min INT4 NULL,
  ADD COLUMN IF NOT EXISTS remind_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS keep_forever BOOL NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS purge_notice_days INT4 NULL;

ALTER TABLE attorney_tasks
  ADD CONSTRAINT attorney_tasks_assignee_fkey FOREIGN KEY (assignee_membership_id)
  REFERENCES assistant_memberships(id) ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS attorney_tasks_remind_idx ON attorney_tasks (remind_at);
CREATE INDEX IF NOT EXISTS attorney_tasks_archived_idx ON attorney_tasks (archived_at);

CREATE TABLE IF NOT EXISTS attorney_task_places (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL,
  position INT4 NOT NULL DEFAULT 0,
  label STRING(80) NULL,
  address STRING(300) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attorney_task_places_pkey PRIMARY KEY (id),
  CONSTRAINT attorney_task_places_task_fkey FOREIGN KEY (task_id) REFERENCES attorney_tasks(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  INDEX attorney_task_places_task_idx (task_id, position)
);

CREATE TABLE IF NOT EXISTS attorney_task_people (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL,
  position INT4 NOT NULL DEFAULT 0,
  user_id UUID NULL,
  role STRING(60) NULL,
  name STRING(120) NOT NULL,
  phone STRING(20) NULL,
  email STRING(254) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attorney_task_people_pkey PRIMARY KEY (id),
  CONSTRAINT attorney_task_people_task_fkey FOREIGN KEY (task_id) REFERENCES attorney_tasks(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT attorney_task_people_user_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  INDEX attorney_task_people_task_idx (task_id, position),
  INDEX attorney_task_people_user_idx (user_id)
);

-- The single address / contact of existing tasks becomes the first place
-- and the first person.
INSERT INTO attorney_task_places (task_id, position, address)
SELECT id, 0, substring(location, 1, 300)
FROM attorney_tasks
WHERE location IS NOT NULL AND trim(location) <> '';

INSERT INTO attorney_task_people (task_id, position, name, phone, email)
SELECT id, 0,
       COALESCE(NULLIF(trim(contact_name), ''), contact_phone, contact_email),
       contact_phone, contact_email
FROM attorney_tasks
WHERE COALESCE(NULLIF(trim(contact_name), ''), contact_phone, contact_email) IS NOT NULL;

-- Finished tasks already in the history are the archive from today.
UPDATE attorney_tasks SET archived_at = COALESCE(done_at, updated_at)
WHERE status IN ('done', 'not_done', 'cancelled') AND archived_at IS NULL;

-- Reminders: tasks with a time get the default one (at the time).
UPDATE attorney_tasks SET remind_before_min = 0, remind_at = due_at
WHERE due_at IS NOT NULL AND status IN ('open', 'taken') AND due_at > now();

ALTER TABLE attorney_tasks DROP COLUMN IF EXISTS location;
ALTER TABLE attorney_tasks DROP COLUMN IF EXISTS contact_name;
ALTER TABLE attorney_tasks DROP COLUMN IF EXISTS contact_phone;
ALTER TABLE attorney_tasks DROP COLUMN IF EXISTS contact_email;
