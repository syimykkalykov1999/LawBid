# Security follow-ups (open)

Items from `docs/perf/SYSTEM_AUDIT_2_2026-10-22.md` that were planned but not built yet.

## Message encryption (audit #6, part 2)

Part 1 is done (`apps/api/src/common/secrets/message-body-cipher.ts`):
- New bodies are `enc:v3.<kid>.<iv>.<tag>.<ct>`. Their AAD is `messages.body:<messageId>`, so a ciphertext copied to another message does not open.
- Old `enc:v2…` rows still open.
- If a body fails to decrypt, the API logs a warning with the message id and key id (never the text) and returns `''`. The app then shows «Не удалось расшифровать».

Still to do:

1. **Re-encryption job.** A background job that walks `messages` (`body_original`, `body_display`) and `message_edits.body_original` in batches. It rewrites every `enc:v2…` row, and every row under a retired key id, as `enc:v3` with the active key. Edit copies use their `message_id` as the AAD id. It must be resumable (keyset by id), throttled, and must count failures without logging any text. Once it reports zero rows for a key id, that key can leave `MESSAGE_ENC_KEYS`. Until then **no key id may be removed**: rows under a removed key read as `''`. Look for the warning `Message body failed to decrypt` in the logs.
2. **KMS-wrapped keys.** `MESSAGE_ENC_KEYS` should hold data keys encrypted by an AWS KMS key, not raw secrets in the task environment. At boot the API calls `kms:Decrypt` once per kid, keeps the plaintext key only in memory, and the IAM role gets `kms:Decrypt` on that key alone. Rotating a key then means a new data key plus the re-encryption job above.
3. **Data-only pushes (later).** Push bodies still carry the masked text to FCM/APNs (`notifications/push/push-dispatcher.ts`). The goal is for the device to fetch or decrypt the text itself.
