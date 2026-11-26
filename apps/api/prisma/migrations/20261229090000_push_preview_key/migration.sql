SET LOCAL lock_timeout = '5s';
-- M12 (owner 26.11: the text of an end-to-end encrypted message in its
-- push, like WhatsApp): the device's push-preview public key (X25519, 32
-- bytes) next to its push token. The private half never leaves the phone;
-- senders seal a short preview to it (HPKE, RFC 9180) and the server only
-- forwards the sealed bytes. Expand only: one nullable column.
ALTER TABLE "push_tokens" ADD COLUMN "preview_key" BYTEA;
