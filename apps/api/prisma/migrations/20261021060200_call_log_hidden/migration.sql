-- Owner 2026-10-21 (WhatsApp): calls a person deleted from their own list.
CREATE TABLE "call_log_hidden" (
    "user_id" UUID NOT NULL,
    "call_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_log_hidden_pkey" PRIMARY KEY ("user_id","call_id")
);

ALTER TABLE "call_log_hidden" ADD CONSTRAINT "call_log_hidden_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "call_log_hidden" ADD CONSTRAINT "call_log_hidden_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
