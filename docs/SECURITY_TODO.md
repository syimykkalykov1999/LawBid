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

## Image moderation and CSAM reporting (audit #4 §5, owner steps)

Built on 2026-10-22: every public picture (post and story photos, avatars, review photos, reel thumbnails) goes through the `media-moderation` queue after upload (`apps/api/src/modules/media-moderation/`). Private files (chats, cases, documents) are never sent to a third party. Results are in the admin under Модерация → Медиа (`GET /admin/media-moderation`).

What happens to one picture:

1. **CSAM hash match** (PhotoDNA adapter). A match hides the content at once, keeps the file as evidence (it is never released or shown again, not even to staff) and opens a `csam_reports` row.
2. **AWS Rekognition `DetectModerationLabels`.** At `moderation.image.hide_confidence` (default 90) the post / story / review / avatar is hidden and queued; at `moderation.image.review_confidence` (60) it stays up and is queued. The admin approves (everything comes back) or removes (content removed, file released).
3. **Cost guard.** One `image_moderation` unit per paid call (Админка → Лимиты, `BUDGET_IMAGE_MODERATION_*`). The same picture again reuses the stored verdict for free. With the budget used up the check is `skipped (budget)` and listed for manual review. Rekognition costs about $1 per 1 000 images (first 1 M a month).

Owner steps:

1. **Rekognition (works at once).** Админка → Интеграции → «Image moderation (AWS Rekognition)»: region = the media bucket region. Leave the keys empty on AWS and add `rekognition:DetectModerationLabels` to the API/worker task role (Terraform, `infra/modules/ecs` task policy). Locally: an IAM user key with that one permission, or env `REKOGNITION_REGION` / `REKOGNITION_ACCESS_KEY_ID` / `REKOGNITION_SECRET_ACCESS_KEY`.
2. **PhotoDNA.** Apply at https://www.microsoft.com/en-us/photodna (Microsoft vets the company; takes weeks). Put the subscription key into «PhotoDNA (known-CSAM hash match)». The adapter (`csam.adapters.ts` `PhotoDnaMatcher`) is written against the public API and has never run against the real service: watch the first checks in Модерация → Медиа (`csam_status` must become `no_match`, not `error`).
3. **NCMEC CyberTipline.** Register as an Electronic Service Provider at https://report.cybertip.org/ (ESP registration) and ask for API access. Until then (and until the XML API call is written: `NcmecReporterStub` throws on purpose once keys exist) every report is `manual_required`: file it by hand on report.cybertip.org **as soon as reasonably possible** (18 U.S.C. §2258A(a)), then keep the CyberTipline report number with the evidence record. Preserve the content for **1 year** after the report (§2258A(h) as amended by the REPORT Act 2024) — the file is kept (never released) while its check is `csam_match`, account deletion included (`AccountAnonymizationService` skips it). After the year, release it by hand.
4. **Video.** Only the reel thumbnail and a chosen cover are checked today. Full-video moderation (Rekognition `StartContentModeration`) needs the video in S3; Bunny keeps it — decide later whether to copy uploads to S3 for that.
