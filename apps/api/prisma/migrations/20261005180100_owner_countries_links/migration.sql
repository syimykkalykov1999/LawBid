-- Owner 2026-10-05: every state/province, person and support ticket
-- belongs to a country. Everything that exists today is in the US.
ALTER TABLE "states" ADD COLUMN "country_code" CHAR(2) NOT NULL DEFAULT 'US';
ALTER TABLE "states" ADD COLUMN "iso_code" STRING;
ALTER TABLE "users" ADD COLUMN "country_code" CHAR(2) NOT NULL DEFAULT 'US';
ALTER TABLE "support_tickets" ADD COLUMN "country_code" CHAR(2) NOT NULL DEFAULT 'US';

CREATE INDEX "states_country_code_idx" ON "states"("country_code");
CREATE INDEX "users_country_code_idx" ON "users"("country_code");
CREATE INDEX "support_tickets_country_code_status_idx" ON "support_tickets"("country_code", "status");

ALTER TABLE "states" ADD CONSTRAINT "states_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
