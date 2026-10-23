# Instant video, photos and background publishing (2026-10-23)

Owner demand: content opens instantly (compared with Instagram) and
publishing happens in the background, everywhere.

## What Instagram / TikTok do (research)

- Meta and Google describe it themselves (Android Developers Blog, March 2026,
  "Instagram and Facebook deliver instant playback ... Media3 PreloadManager"):
  Meta first used **warm-up** (several player instances ready) plus **disk
  prefetch**; many players cost memory and hardware decoders, so they moved to
  a preload manager that keeps the *next items' media ready in memory* and
  removes the "join latency" (action -> first frame). More watch time followed.
- Common recipe: poster frame on screen in the first frame of the page; HLS
  with short first segments and a low first rendition (ABR climbs after);
  prefetch the first segment of the next 2-3 items; a small bounded player
  pool; hardware decode.
- Photos: a small variant (or blurhash) is shown at once, the sharp one fades
  in; the next items are downloaded and decoded ahead.
- Publishing: the post appears at the top of the feed at once with a thin
  inline progress line on the card, no global bar; a failure leaves the card
  with "Retry".

## What was already in the app (kept)

- Reels: warm neighbour player (+-1) waiting at the first frame, resume spot,
  fades of sound, `reelPosterProvider` precache, `prefetchPost` for feed photos
  (320 px backdrop + 1080 px decoded at draw size), persistent upload queue
  (`core/uploads`) with TUS resume, `ReelPublishCard` at the top of the feed,
  Idempotency-Key for reels.
- Server image variants: every post image already has 320 / 1080 / full
  variants (`FilesService.postImageUrls`). No `?w=` param was needed.

## What was built now

| Area | Change |
| --- | --- |
| Video poster | `ReelVideo` draws the poster from the first frame and keeps it over the player until the first frame really moves (no black box, no spinner before 1.2 s). Tile mode (`backdrop: false`) is unchanged (the tile's cover is under it). |
| Prefetch | `core/media/video_prefetch.dart`: `HlsPrefetcher` fetches master playlist, **lowest** rendition playlist and the first segment (range, <= 1 MB) of the next 3 reels / feed videos. At most 2 at once, 4 waiting, 16 remembered. `WarmPlan`: one player ahead + one behind (<= 2), prefetch 3 ahead. Wired in `reels_screen` (`onPageChanged`) and `prefetchPost` (feed). |
| Photos | `ProgressivePhoto`: the 320 px copy is the placeholder, the 1080 px one fades in. Used by the post card carousel. Feed poster precache now covers playable videos too. |
| Publishing | `PendingPosts` controller + `PendingPostsStrip` card (feed top and own profile top): form closes at once, thin inline line, then swap to the live post; failure -> "Retry" (same Idempotency-Key) and "x". Used for briefs, photo posts and document posts. Reels already use `ReelPublishCard`. |
| Limits | `video.reel_max_duration_sec` (180) and `video.post_max_duration_sec` (3600); `video.max_duration_sec` is the fallback. API: `POST /videos/uploads` accepts optional `kind: reel|post`; the check against Bunny's real length uses the declared length to pick the limit. Bootstrap exposes both keys. Admin -> Settings shows Russian text + English key. App reads them in `video_limits.dart`. |

## Honest limits

- `video_player` (ExoPlayer / AVPlayer) cannot be told which rendition to
  start with and reads through its own network stack, so segments cannot be
  stored in our media cache. The prefetch heats the CDN edge and the OS URL
  cache only; nothing is stored on our disk (so `core/cache` limits are not
  touched). A real "preload in memory" needs a native preload manager
  (Media3 `PreloadManager` / AVPlayer `preferredForwardBufferDuration` with a
  pool) or `media_kit`; that is a separate decision (platform channel work).
- The poster is the server's cover. When the author picked a *different*
  gallery cover, it shows for a moment before the first frame (the owner asked
  for instant over exact).
- Cases still publish synchronously: the server can refuse them (contact info
  in the text, consent) and the person must return to the wizard to fix it, so
  an optimistic card would hide a needed step.
- Posts waiting in `PendingPosts` live in memory (photos are already uploaded
  when the form closes); killing the app within the few seconds of the create
  call loses the text. Reels survive restarts (upload queue).

## Bunny settings the owner must check

1. Stream library -> Encoding: enable 240p and 360p/480p renditions (the
   prefetch and AVPlayer start from the lowest listed one).
2. Keep HLS (m3u8) output on; MP4 fallback only for web.
3. Short segments (Bunny default ~ 4-6 s) are fine; do not raise them.

## Manual checklist (device)

1. Feed, cold start, 4G: first video card shows its poster in the first frame,
   video starts <= ~0.5 s after it is 60 % visible.
2. Scroll to the next video card: starts without poster-to-black flash.
3. Reels: swipe 5 reels fast; each starts at the first frame; no more than 3
   players alive (Xcode / Android Studio memory graph), no decoder error.
4. Mute / unmute persists across reels.
5. Photo post on throttled network: soft copy at once, sharp fades in.
6. Publish a brief with airplane mode on: the card stays with "Retry", the
   form is already closed; turn network on, Retry -> live post, no duplicate.
7. Publish a reel and kill the app mid-upload: card returns, upload resumes.

## Automated

- `test/features/reels/reel_video_visibility_test.dart` (poster in the first
  frame with a never-initializing player = 0 frames to first visual; hand-over
  when the first frame moves).
- `test/core/media/video_prefetch_test.dart` (lowest rendition, first segment
  only, bounds of concurrency / queue / memory, WarmPlan bounds).
- `test/core/design_system/progressive_photo_test.dart`.
- `test/features/social/pending_posts_test.dart` (posting card, retry with the
  same key, dismiss).
- API: `videos.service.spec.ts` (limits fallback, post limit).
