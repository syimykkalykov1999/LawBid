-- Owner 2026-10-01: every kind of attorney work in the planner.
ALTER TYPE attorney_task_kind ADD VALUE IF NOT EXISTS 'consultation';
ALTER TYPE attorney_task_kind ADD VALUE IF NOT EXISTS 'hearing_prep';
ALTER TYPE attorney_task_kind ADD VALUE IF NOT EXISTS 'deposition';
ALTER TYPE attorney_task_kind ADD VALUE IF NOT EXISTS 'mediation';
ALTER TYPE attorney_task_kind ADD VALUE IF NOT EXISTS 'filing';
ALTER TYPE attorney_task_kind ADD VALUE IF NOT EXISTS 'review';
ALTER TYPE attorney_task_kind ADD VALUE IF NOT EXISTS 'email';
ALTER TYPE attorney_task_kind ADD VALUE IF NOT EXISTS 'sign';
ALTER TYPE attorney_task_kind ADD VALUE IF NOT EXISTS 'payment';
ALTER TYPE attorney_task_kind ADD VALUE IF NOT EXISTS 'research';
ALTER TYPE attorney_task_kind ADD VALUE IF NOT EXISTS 'jail_visit';
