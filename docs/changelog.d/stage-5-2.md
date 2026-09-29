## Stage 5.2 — Posts and media (API)

docs/05 §16 stage 5.2, §3.

- `PostsModule` (`modules/posts`): `POST /posts` (Idempotency-Key; verified
  active attorney only → else 403 POST_NOT_ALLOWED; §13 limit
  `post_create`; ContentModerationHook allow/hold/block → published /
  hidden / 422), `GET /posts/:id`, `PATCH /posts/:id` (text only, hashtags
  recomputed, `editedAt` = "Изменено"), `DELETE /posts/:id` (soft),
  `GET /attorneys/:id/posts` (cursor; the author also sees own hidden).
- Hashtags (§3.1): letters/digits/`_`, ≤ 30 chars, lowercase, max 10 (the
  11th ignored), stored in `tags` / `post_tags`.
- Photos (§3.2): up to 10 clean `post_image` files in order
  (`FilesService.assertAttachable`; a file can't be reused); the scan
  worker re-encodes post photos (EXIF/GPS stripped — was kept before),
  main ≤ 2048 px + 320 / 1080 px variants; `FilesService.postImageUrls`
  signs all three (CloudFront: TODO docs/06).
- `PostPresenter`: PostDto for a page in a fixed number of queries
  (authors + avatars, media, likedByMe/savedByMe, tags, pending counter
  deltas) — reused by feed, tags, search and saved lists.
  `VISIBLE_POST_WHERE`: published, not deleted, author active and not
  suspended.
- `posts_count` through the counters aggregator (+1 publish, −1 delete).

Tests: e2e `stage-5-2.e2e-spec.ts` 5/5; unit hashtags + post photo
processing.
