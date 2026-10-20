ALTER TABLE "push_tokens" ADD COLUMN "armed_reminders" TEXT[] DEFAULT ARRAY[]::TEXT[];
