# Media paths: what speed features each upload and download uses (2026-11-08)

State of branch `claude/media-speed-gaps` (PR #845, includes #841). Paths are in `apps/mobile/lib` unless the path starts with `api/`. "PR" = done in #841/#845. "Owner" = waits for an owner decision. "—" = does not apply to this path.

## Rules the same on every path
- **Store:** public pictures (avatar, post and review photos, stickers) go to R2 when `media.public_store` = r2. Everything else goes to AWS (`api/src/modules/files/files.policy.ts`, `mayUsePublicStore`). Videos and reels go to Bunny.
- **Presign:** every app upload sends `supportsPut: true` (`core/uploads/storage_uploader.dart` presign). The admin's stickers and gifts get PUT from the server (`api/.../admin-stickers.service.ts:353`).
- **Resumable parts:** files of 16 MiB or more, flag `files_multipart` (on in prod), up to 4 parts at once (`storage_uploader.dart` `putResumable`). Photos are always smaller, so they go as one request. The same on R2 and AWS.
- **Whole files at once:** a screen's uploads go at most `client.uploads_at_once` at a time, app-wide (`StorageUploader.filesAtOnce`, PR). Queue jobs: 3 at once (`core/uploads/upload_queue.dart`).
- **Server:** an avatar gets 1024 + 256 px. Post, review, case, chat and support pictures get at most 2048 px plus 320 and 1080 px, and a blurhash (`api/.../file-scan.processor.ts`). Variants are written in parallel (PR). Public media is cached `immutable`, private files `private, max-age=3600`. Private links are signed in time windows so the answer repeats (ETag/304), never longer than the TTL (PR).
- **Duplicate check (R-254, `files_reuse_own` on):** `StorageUploader.upload()` asks for an existing copy. The avatar asks too (PR); it is reused only after a passed moderation verdict (PR). Verification documents never share (a rule).

## Uploads

| Content | Platforms | Compression on the device | Parts / parallel | Background / survives leaving | Instant in the UI | Dedup | Status |
|---|---|---|---|---|---|---|---|
| Avatar (profile) | iPhone, Android | `avatarLimitsOf` (`profile/presentation/widgets/avatar_picker_field.dart`) | one request | yes, the upload lives for the session (`profile/application/avatar_upload_controller.dart`, PR) | yes, the picked photo shows at once on my profile (PR) | yes (PR) | OK |
| Avatar (profile) | web | `image_picker` maxWidth/quality, not checked in a browser | one request | yes (PR) | yes (PR) | yes (PR) | OK, browser not checked |
| Group photo | all | `pickGroupPhoto` → avatar limits | one request | set even when the screen was left (`groups/presentation/group_info_screen.dart`, #841) | no (spinner) | yes via the avatar repo (PR) | OK |
| Channel photo | all | `avatarLimitsOf` (`channels/presentation/channel_pickers.dart`) | one request | id kept in the form | no | `upload()` | OK |
| Post photos | all | `photoLimitsOf` (`social/presentation/screens/create_post_screen.dart`) | at most uploads_at_once (PR) | screen | photos show at once; publishing waits for every id | `upload()` | Owner: instant publish (see below) |
| Post documents | all | — | parts at ≥16 MiB | screen | no | `upload()` | OK |
| Reels | iPhone, Android | `media.video_max_height` / `video_frame_rate` (`core/media/video_compression.dart`) | Bunny TUS, parallel parts (`reels_tus_parallel`) | yes, upload queue (`reels/application/reel_publish_job.dart`) | the pending reel shows | — | OK |
| Reels | web | Mediabunny/WebCodecs, the original when the browser cannot (`core/media/browser_video_compressor.dart`, PR) | same | queue in the foreground only (no OS transfer in a browser) | same | — | OK, browser not checked |
| Reel cover | all | `photoLimitsOf` (`reels/presentation/video_editor_screen.dart`, PR) | one request | with the reel | — | — | OK |
| Stories | all | photo 2160 px / 90 (fixed full-screen format); video via the compressor, on web too (PR) | one request | story job | pending story | — | OK |
| Review photos | all | `photoLimitsOf` (`cases/presentation/widgets/client_review_sheet.dart`) | at most uploads_at_once (PR) | screen | no | `upload()` (moderated: uploads again) | Owner: instant publish |
| Stickers (app) | all | 512 px fixed format, no quality (PNG transparency) (`stickers/presentation/sticker_widgets.dart`) | one request | `upload()` + add, one chain | no | `upload()` | OK |
| Stickers, gifts (admin) | web (admin) | none | one request | page | — | server: none | OK (rare, admin only) |
| Chat photos / files | iPhone, Android | `media.chat_photo_max_px` / quality; video ≤720p (`chat/presentation/conversation_screen.dart`) | queue 3 at once, parts with `chat_upload_parallel` + `files_multipart` | yes, upload queue plus the OS transfer (`chat/application/chat_media_outbox.dart`) | yes, a pending bubble | `upload()` | OK |
| Chat photos / files | web | the same photo limits; video via Mediabunny (PR) | queue | queue in the foreground | yes | `upload()` | OK, browser not checked |
| Chat voice | all | m4a / webm already small | queue | yes | yes | `upload()` | OK |
| Group chat files | all | the chat picker (`groups/presentation/widgets/group_attach.dart`) | `uploads_at_once` with `chat_upload_parallel` | flag `group_files_from_disk` on: queue; off (prod today): finishes after leaving (`GroupThread.uploadAndSend`, PR) | pending bubble | `upload()` | OK; Owner: switch on `group_files_from_disk` |
| Case photos / files | all | `photoLimitsOf` (`cases/application/case_media_picker.dart`, `cases/workspace/compose_sheet.dart` PR) | `mapAtOnce` / uploads_at_once | screen | no | `upload()` | Owner: instant publish |
| Billing photo | all | `photoLimitsOf` (`cases/tools/billing_sheets.dart`, PR) | one request | sheet | no | `upload()` | OK |
| Task files | all | compose limits (PR) | `mapAtOnce` with uploads_at_once | screen | no | `upload()` | OK |
| Support files | all | chat picker; video ≤720p, Mediabunny on web (PR) | at most uploads_at_once (PR) | screen | no | `upload()` | OK; through the storage client (#841) |
| Verification | all | none (documents must stay readable); camera `ResolutionPreset.high` | one request | finishes after leaving the wizard (`verification/application/verification_wizard_controller.dart`, PR) | progress row | never (a rule) | OK |

## Downloads

| Content | Cache | Parts / resume | Status |
|---|---|---|---|
| Pictures (feed, chats, avatars) | two disk caches keyed by the file, not the signed link (`core/media/app_image_cache.dart`, `core/media/stable_network_image.dart`); on web the browser cache + immutable/ETag | — | OK |
| Videos (reels, chat) | chunk cache through the local proxy on the phone (`core/media/video_cache/`); off on web (`video_cache.dart:153`), the browser streams | Range requests | OK |
| Case documents | `CaseFileCache` (`cases/workspace/file_actions.dart`) | resumable, parallel pieces with `downloads_parallel` (`core/files/resumable_download.dart`) | OK |
| Chat documents (bubble) | `CaseFileCache.openKept` (PR #856, `chat/presentation/chat_album.dart`) | resumable, pieces | in #856 |
| Chat «Files» list, post documents, templates | `openKeptDocument` → `CaseFileCache.openKept` (`cases/presentation/widgets/case_photos.dart`); the browser opens the link | resumable, parallel pieces | OK (claude/speed-gaps-app) |
| Voice notes | kept on the phone by message id (`chat/data/voice_files.dart` `downloadVoiceNote`) | resumable through `ResumableDownload` (`Range: bytes=N-` after a cut) | OK (claude/speed-gaps-app) |

## Waiting for the owner
1. **Instant publish for posts, reviews and case files** (see the comparison in the #845 report). Recommendation: reuse our own `UploadQueue`.
2. **Switch on `group_files_from_disk`** in the admin (it is off on prod).
3. **Move the R2 bucket to Eastern North America**: about 60–70 ms saved per R2 round trip, roughly 0.2 s per confirm and per server check (an estimate; `files_confirm_slow` / `files_scan_slow` will give real numbers after deploy).
