-- Owner 2026-10-15: a case may name several topics. The first stays in
-- cases.practice_area_id (existing cases are already «an array of one»).
CREATE TABLE "case_extra_practices" (
    "case_id" UUID NOT NULL,
    "practice_area_id" UUID NOT NULL,

    CONSTRAINT "case_extra_practices_pkey" PRIMARY KEY ("case_id","practice_area_id")
);

CREATE INDEX "case_extra_practices_practice_area_id_case_id_idx" ON "case_extra_practices"("practice_area_id", "case_id");

ALTER TABLE "case_extra_practices" ADD CONSTRAINT "case_extra_practices_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_extra_practices" ADD CONSTRAINT "case_extra_practices_practice_area_id_fkey" FOREIGN KEY ("practice_area_id") REFERENCES "practice_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
