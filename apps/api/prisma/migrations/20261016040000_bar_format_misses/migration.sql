-- Owner 2026-10-16: unusual bar-number shapes, counted for the admin.
CREATE TABLE "bar_format_misses" (
    "id" UUID NOT NULL,
    "state_code" VARCHAR(2) NOT NULL,
    "shape" VARCHAR(40) NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "first_seen" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bar_format_misses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bar_format_misses_state_code_shape_key" ON "bar_format_misses"("state_code", "shape");
CREATE INDEX "bar_format_misses_last_seen_idx" ON "bar_format_misses"("last_seen");
