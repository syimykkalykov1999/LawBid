## Stage 5.4 — Likes, comments, saves, reports (API)

docs/05 §16 stage 5.4, §4, §5, §12.1.

- Post likes `POST/DELETE /posts/:id/like` — idempotent on the PK; counter
  and `post_like` notification only when a row changed; §13 `like` limit.
- Saved posts through `/saved-items` (`itemType = post`, was 501) and
  `GET /saved-items/posts` (deleted/hidden → `available = false`, "Пост
  недоступен"); `save_count` via the aggregator.
- Comments (`modules/comments`): `GET /posts/:id/comments`,
  `GET /comments/:id/replies` (newest first, 20), `POST /posts/:id/comments`
  (1–1000 chars, moderation hook, §13 `comment` limit; one level — a reply
  to a reply attaches to the top-level parent with `@username` put in
  front), `DELETE /comments/:id` (author or the post's author; a top-level
  comment takes its replies), `POST/DELETE /comments/:id/like`.
  Notifications `post_comment`, `comment_reply`, `comment_like`.
- Comment authors: attorney → public profile fields; client → only
  "Anna K." (no id, no avatar) — client profiles stay closed.
- `POST /reports` (post, comment, message, user): §13 `report` limit; a
  repeat by the same user on the same object is ignored (Redis claim + DB
  check; no unique index — §14 allows no other schema change).

Tests: e2e `stage-5-4.e2e-spec.ts` 4/4.
