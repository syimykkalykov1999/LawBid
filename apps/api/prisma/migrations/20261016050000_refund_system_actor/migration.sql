-- Owner 2026-10-16: a refund can be issued by the system (an attorney lost
-- verification), without an admin.
ALTER TABLE "refunds" ALTER COLUMN "admin_id" DROP NOT NULL;
