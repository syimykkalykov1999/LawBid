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

## Chat files from disk (R-255, flag `chat_files_from_disk`, off)
A video or document picked in a one-to-one chat is not read into memory: it is copied to the queue folder and streamed from there. Its shown size comes from the `moov` box alone (`videoSizeOfFile`). Photos stay in memory: they are small and open for editing. The browser has no paths.

## Group files from the queue (R-255, flag `group_files_from_disk`, off)
A file of a group chat is a job of the upload queue (kind `group.attachment`, target = the group, topic and reply in the payload). A video or document stays on disk until it is copied to the queue folder. The job id is the message's `clientMessageId`, so a retry never doubles. Off: read into memory and uploaded by the screen, as before.

## Verification
- Auto: API `files.multipart.spec`, `multipart.spec` (182 files tests); app `storage_uploader_test` (ranges, resume, part retry, fallback), `post_video_url_test`.
- Phone only: real network cut mid-upload, battery/background upload, MP4-vs-HLS start time on a slow link, S3 CORS for PUT after Terraform apply (owner step).
