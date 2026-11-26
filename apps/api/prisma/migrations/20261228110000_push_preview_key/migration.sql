SET LOCAL lock_timeout = '5s';
-- Third pass M12 (26.11): each device's push-preview public key (raw
-- X25519, base64). Expand only: one nullable column.
ALTER TABLE "push_tokens" ADD COLUMN     "preview_key" VARCHAR(44);
