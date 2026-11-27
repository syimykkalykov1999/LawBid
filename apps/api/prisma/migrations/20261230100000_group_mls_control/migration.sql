SET LOCAL lock_timeout = '5s';
-- Group E2EE G2b (GROUP_E2EE_DESIGN_2026-11-26.md §4.5): a reaction, vote,
-- edit or poll close of an encrypted group is an MLS message like any
-- other, but it changes another message instead of being one. The sender
-- marks it; the server keeps it out of unread counters, pushes and the
-- group's last message. Expand-only: a constant default is added without
-- rewriting the table (PostgreSQL 11+), and on the hash-partitioned
-- chat_group_messages the parent's ALTER reaches every partition.
ALTER TABLE "chat_group_messages" ADD COLUMN "mls_control" BOOLEAN NOT NULL DEFAULT false;
