SET LOCAL lock_timeout = '5s';

-- Owner 2026-11-09: AVIF links only for files whose every size has its twin.
ALTER TABLE "files" ADD COLUMN "avif_twins" BOOLEAN NOT NULL DEFAULT false;
