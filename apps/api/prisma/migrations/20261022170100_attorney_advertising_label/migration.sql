-- Owner 2026-10-22 (audit #4 §5): the «Attorney Advertising» label per state.
-- On by default for New York (Rule 7.1(f)); the owner switches other states
-- in the admin (Страны → регионы).
ALTER TABLE "states" ADD COLUMN "attorney_advertising_label" BOOLEAN NOT NULL DEFAULT false;

UPDATE "states" SET "attorney_advertising_label" = true
WHERE "code" = 'NY' AND "country_code" = 'US';
