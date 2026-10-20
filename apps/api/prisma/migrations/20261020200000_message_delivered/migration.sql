-- Two grey ticks: the newest message that reached the person's device.
ALTER TABLE "conversation_participants" ADD COLUMN "last_delivered_message_id" UUID;
ALTER TABLE "conversation_participants" ADD COLUMN "last_delivered_at" TIMESTAMPTZ;
