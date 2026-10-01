-- Owner 2026-10-01: one task card holds any number of steps (5 calls,
-- 6 meetings, several addresses…), each with its own time and checkmark.
CREATE TABLE IF NOT EXISTS attorney_task_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL,
  position INT4 NOT NULL DEFAULT 0,
  kind attorney_task_kind NULL,
  title STRING(160) NOT NULL,
  due_at TIMESTAMPTZ NULL,
  location STRING(200) NULL,
  contact_name STRING(120) NULL,
  contact_phone STRING(20) NULL,
  contact_email STRING(254) NULL,
  status attorney_task_status NOT NULL DEFAULT 'open',
  note STRING(1000) NULL,
  done_at TIMESTAMPTZ NULL,
  created_by_name STRING(120) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attorney_task_steps_pkey PRIMARY KEY (id),
  CONSTRAINT attorney_task_steps_task_fkey FOREIGN KEY (task_id) REFERENCES attorney_tasks(id) ON DELETE CASCADE,
  INDEX attorney_task_steps_task_idx (task_id, position)
);
