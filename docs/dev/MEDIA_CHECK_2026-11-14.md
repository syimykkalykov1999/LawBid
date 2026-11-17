# Media check 14.11.2026 (owner rows 97, 144)

Every promise of the media PRs #1034, #1038, #1043, #1046 and #1051 was
checked on origin/main `2c545ab4a`. Real files went through the real code.
Samples were made locally: a 4032×3024 camera-like JPEG with EXIF GPS,
orientation 6, XMP GPS and an IPTC city (exiv2); an iPhone-style HEIC
(pillow-heif); PNG with alpha; WebP; H.264 MP4 with moov at the end and at
the start; rotated H.264; HEVC `hvc1` MOV; VP9 WebM; AAC m4a; Opus WebM;
Safari fragmented MP4 voice; PDF, plus a PDF with JavaScript.

How each part was run:
- **Server:** `ImageProcessor`, `detectMime`, `videoDimensions`,
  `dangerousContent` through ts-node.
- **Storage:** `S3StorageService` against a throwaway MinIO container.
- **Web:** `web/js/video_compress.js` and `voice_aac.js` in headless
  Google Chrome 156 (Linux).
- **App:** photo code in `flutter test` on the real engine.

Phone builds (iOS AVFoundation, Android Media3) cannot run on this laptop.
They are listed as not checked.

| # | Item | Expected | Measured | Result |
|---|---|---|---|---|
| P1 | Post/chat/case photo, JPEG 4032×3024 with orientation 6 and GPS | upright, ≤2048, 320/1080 sizes, no EXIF | 1536×2048 main + 240×320 + 810×1080 WebP, `exif` none, 256 ms | OK |
| P2 | iPhone HEIC 3024×4032 | JPEG/WebP, upright, no EXIF | post: 1536×2048 WebP; document: 3024×4032 JPEG 900 KB, no EXIF; 1.2–1.6 s (WASM libheif) | OK |
| P3 | PNG with alpha as a post photo | sized | 1200×800 WebP, flattened on white (by design: same path as JPEG) | OK |
| P4 | WebP 3000×2250 | ≤2048 | 2048×1536 WebP, 320/1080 sizes | OK |
| P5 | Small clean 1600 px JPEG, `images.keep_small_originals` | kept as sent, sizes made | main = the same 82 KB JPEG, 320/1080 WebP | OK |
| P6 | Avatar | 1024 + 256 square, no EXIF | 1024×1024 + 256×256, no EXIF | OK |
| P7 | **Sticker (public CDN) / task-attachment JPEG with GPS** | no location stored | stored **as uploaded, EXIF GPS kept** (`main = null`) | **BUG → fixed** |
| P8 | App: picked photo cleaned (`stripPhotoMetadata`) | no location, lossless | EXIF GPS removed, pixels identical, orientation 6 kept, **but XMP `exif:GPSLatitude`, IPTC city and Make in XMP stayed** | **BUG → fixed** |
| P9 | App: `shrinkPhotoToJpeg` 4032×3024 orientation 6 | upright JPEG ≤2048, no metadata | 1536×2048 JPEG 399 KB, no EXIF/XMP | OK |
| V1 | Server type check of H.264 MP4, HEVC MOV, VP9 WebM | accepted for chat | `video/mp4`, `video/quicktime`, `video/webm`, from the full file and from the 256 KiB prefix | OK |
| V2 | Shown size of a video (`videoDimensions`) | rotation applied | 1920×1080; rotated 90° → 1080×1920; HEVC MOV 1920×1080; WebM null (no `tkhd` in Matroska, as documented) | OK |
| V3 | Web: 1080p H.264 at 6.5 Mbit/s, moov at the end | 720p, admin bitrate, moov first | 3188 KB → 1039 KB, moov at byte 32, 1.3 s | OK |
| V4 | **Web: any source with an average bitrate below the admin rung (VP9 720p 1 Mbit/s, HEVC, faster/taller light H.264)** | re-encoded or kept | **`TypeError: options.bitrate, when provided, must be a positive integer`**: the fractional measured bitrate went to WebCodecs and the original was uploaded | **BUG → fixed** (encodes now. A result that is not smaller still keeps the original. VP9 1080p 1.8 Mbit/s → 720p 808 KB, moov at byte 32) |
| V5 | **Web: light H.264 kept as is, moov at the end** | fast start | kept with moov at byte 710400 of 701 KB (the player fetches the end of the file before the first frame) | **BUG → fixed** (remuxed with Mediabunny, no second encode: 731 KB, moov at byte 32, 60 ms. Already fast-start files are still kept) |
| V6 | Web: HEVC MOV in Linux Chrome | original if it cannot decode | null → original uploaded (no HEVC decoder in Linux Chrome) | OK (by design) |
| V7 | Phones: iOS AVFoundation / Android Media3 encode, HDR, High profile | as #1034/#1046 | not run (no phone or simulator on this laptop) | NOT CHECKED |
| V8 | Phones: light H.264 kept as is | — | the same keep rule as V5 (`VideoEncoder.swift` `keep`, `VideoEncoder.kt` `keepOriginal`) does not look at the moov position | NOT FIXED (needs a phone check; see the PR) |
| A1 | Voice: iOS/Android AAC m4a, Chrome Opus WebM, Safari fragmented MP4 | accepted for `chat_voice` | `audio/mp4`, `audio/webm`, `audio/mp4`, all accepted | OK |
| A2 | Voice: Ogg/Opus, 3GP | not produced by any client | refused (`detect = null`). The app records AAC, or WebM in the browser (`record` web) | OK |
| A3 | Web voice: WebM → AAC (`voice_aac.js`) | AAC where the browser encodes it | Linux Chrome has no AAC encoder → null → WebM is sent, as documented | OK (by design; macOS/Windows not checked) |
| D1 | PDF document | accepted, stored as uploaded | `application/pdf`, accepted | OK |
| D2 | PDF with JavaScript (`/OpenAction` `/JS`) | refused | `pdf-active-content` | OK |
| D3 | PDF first-page preview / thumbnail | — | not built anywhere (app, web or server). Documents show as an icon card. None of the five PRs promised it | MISSING (feature, not a regression) |
| U1 | Resumable multipart upload | a killed upload resumes, nothing is lost | MinIO, 23 MiB: parts 1 and 3 in parallel → "app killed" → `listParts` [1,3] → missing [2,4,5] → complete → SHA-256 equal | OK |
| U2 | App: parallel photos, background parts | #1043 / #1051 | covered by their unit tests (`queued_photos_parallel_test`, `background_parts_test`). The OS service needs a phone | OK in tests, phone NOT CHECKED |
| C1 | Public media `Cache-Control` | `public, max-age=31536000, immutable` | object and signed GET: exactly that | OK |
| C2 | Private documents `Cache-Control` | `private, max-age=3600` | object and signed GET: exactly that | OK |
| C3 | **Documents-bucket streams (data export ZIP, legal export)** | private | **object written `public, max-age=31536000, immutable`** (signed GET overrides it, but any read without the override is publicly cacheable for a year) | **BUG → fixed** |
| C4 | Download caching (app / web / admin) | same URL within the signing window, 304 on revalidate | the same signed URL 2.5 s later. `If-None-Match` → 304. The app keys images by the unsigned path (`stableImageCacheKey`). The admin uses `<img>` with these URLs | OK |
