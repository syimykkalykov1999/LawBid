-- Owner 2026-10-14: firm profile (a firm is its lawyers).
CREATE TABLE "firms" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(120) NOT NULL,
  "owner_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "firms_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "firms_owner_id_idx" ON "firms"("owner_id");

CREATE TABLE "firm_members" (
  "firm_id" UUID NOT NULL,
  "attorney_id" UUID NOT NULL,
  "role" VARCHAR(10) NOT NULL DEFAULT 'member',
  "status" VARCHAR(10) NOT NULL DEFAULT 'invited',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "firm_members_pkey" PRIMARY KEY ("firm_id", "attorney_id"),
  CONSTRAINT "firm_members_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "firm_members_role_chk" CHECK ("role" IN ('owner', 'member')),
  CONSTRAINT "firm_members_status_chk" CHECK ("status" IN ('invited', 'active'))
);
CREATE UNIQUE INDEX "firm_members_attorney_id_key" ON "firm_members"("attorney_id");
