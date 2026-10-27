-- Staff package T1 (2026-10-27): validate the "no head in finance" CHECK
-- added NOT VALID in 20261107132000_staff_package (online DDL: the check
-- of existing rows runs under SHARE UPDATE EXCLUSIVE, writes keep going).
SET LOCAL lock_timeout = '5s';

ALTER TABLE "admin_profiles" VALIDATE CONSTRAINT "admin_profiles_no_finance_head";
