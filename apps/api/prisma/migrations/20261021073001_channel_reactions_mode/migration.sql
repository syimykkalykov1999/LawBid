-- Owner 2026-10-21 (inbox 26b): channel reactions — all / selected / off.
ALTER TABLE "channels" ADD COLUMN "reactions_mode" VARCHAR(8) NOT NULL DEFAULT 'all';
ALTER TABLE "channels" ADD COLUMN "reactions_allowed" VARCHAR(16)[] DEFAULT ARRAY[]::VARCHAR(16)[];
