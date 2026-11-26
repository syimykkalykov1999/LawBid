SET LOCAL lock_timeout = '5s';
-- Item 25 (docs/architecture/E2EE_MLS_PLAN_2026-11-25.md): a device that
-- could not join an MLS group from its Welcome (RFC 9420 §12.4.3.1) asks to
-- be added again; its group place is marked until a member removes the old
-- leaf and adds it from a new KeyPackage. Expand only: one nullable column
-- (metadata-only ALTER, no rewrite).
-- AlterTable
ALTER TABLE "mls_group_devices" ADD COLUMN     "rejoin_at" TIMESTAMPTZ;
