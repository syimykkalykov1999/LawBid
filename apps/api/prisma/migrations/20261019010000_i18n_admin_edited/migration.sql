-- Owner 2026-10-18: texts edited in the admin (Справочник) survive the
-- deploy's translations_seed.xlsx import.
ALTER TABLE i18n_translations ADD COLUMN admin_edited BOOLEAN NOT NULL DEFAULT false;
