-- Owner 2026-10-05: the planner's own notifications — a reminder before
-- a task, a task assigned to an assistant, archived tasks about to be
-- removed. Alone in this migration: a new enum value can't be used in the
-- transaction that adds it.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'task_reminder';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'task_assigned';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'task_purge_soon';
