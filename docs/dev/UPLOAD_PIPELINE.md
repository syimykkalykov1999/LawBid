# Upload pipeline (compression + chunked/resumable) — 2026-11-01

Goal (owner): every upload is compressed on the phone first, sent in parts straight to storage (never through the API), resumable, cheaper for S3 and Bunny.

## Photos
- Every picker passes `maxWidth/maxHeight/imageQuality` (chat, groups, channels, posts, stories, avatar, cases). Limits come from admin config `media.photo_max_px` / `media.photo_quality` (`core/media/photo_limits.dart`); chat and groups use `ClientTuning.chatPhotoMaxPx/Quality`.
- Aspect rules (feed ≤1:1, profile 3:4, story 9:16) are applied by the crop/framing screens.

## Video (feed, reels, stories, channels, chat, cases, support)
- Re-encoded on device before upload: `core/media/video_compression.dart` (max short side `media.video_max_height`, default 1080; fps `media.video_frame_rate`; skipped when already under ~8 Mbit/s). Web has no encoder: original is uploaded.
- Upload to Bunny Stream by **TUS** directly (`ReelsRepository`, 5 attempts, HEAD to resume the offset, location kept in the job so a restart resumes). API only issues the credentials (`POST /videos/uploads`).
- Playback: clips ≤30 s with an MP4 fallback play the MP4 on phones (HLS needs 3 round trips before the first frame); HLS stays for longer videos and as retry on failure (`PostVideo.playerUrl`).

## Other files (S3)
- Small files: presigned POST/PUT as before.
- Files ≥16 MiB: **multipart** (flag `files_multipart`, default OFF). `POST /files/:id/multipart` returns presigned part URLs (8 MiB parts) and the parts S3 already has; the app PUTs only missing parts (retry per part), then `POST /files/:id/multipart/complete`. Abandoned uploads are aborted by `storage-cleanup`. The app falls back to the single upload when the flag is off.

## Confirm without reading the file (R-252, flag `files_confirm_light`, off)
From 8 MiB `POST /files/:id/confirm` reads the first 256 KiB (type, allow-list) and keeps the file `pending` with an empty `source_sha256`. The scan worker then proves the hash and looks inside the container (`dangerousContent`) before anything else, the dedup included: a false hash must never point a row at someone else's object. A refused file is removed and ends `failed`. Only `clean` files can be attached. Off: the whole file is read in the API, as before.

## Queue job and the OS transfer
The OS transfer outlives the app and sends the file of ITS presign, so the target is saved in the job before the transfer starts and used again after a restart. If storage still has nothing, one fresh start with the OS record forgotten.

## Verification
- Auto: API `files.multipart.spec`, `multipart.spec` (182 files tests); app `storage_uploader_test` (ranges, resume, part retry, fallback), `post_video_url_test`.
- Phone only: real network cut mid-upload, battery/background upload, MP4-vs-HLS start time on a slow link, S3 CORS for PUT after Terraform apply (owner step).
