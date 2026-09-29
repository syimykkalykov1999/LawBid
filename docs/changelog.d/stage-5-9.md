## Stage 5.9 — Flutter: feed, posts, comments, follows

docs/05 §16 stage 5.9, §2–§6, §11 (feed).

- `features/social`: repository (feed, posts CRUD, likes, saves via
  `/saved-items`, comments/replies, follows, suggestions, tag pages,
  reports, post photo upload presign → S3 → scan), drift store
  `lawbid_social` (feed first page for offline, chat outbox and recent
  searches for 5.10/5.11), providers with one source of truth for posts
  shown in many lists (likes/saves/edits/deletes sync everywhere),
  optimistic like/save/follow with rollback and in-flight dedupe (a second
  tap never calls the API twice).
- Feed: clients get one post stream; attorneys "Лента | Кейсы" with each
  tab's scroll kept (IndexedStack). Empty feed: "Пока в ленте пусто" +
  "Рекомендуемые адвокаты"; offline: the cached first page.
- Post card: author (gold ring for verified, blue check), time ago,
  "⋯" (report / copy link; own: edit text / delete / copy link), photo
  carousel with a gold page indicator, double tap = like with a heart
  bloom, animated like/save, share sheet with `lawbid.app/post/:id`,
  3-line text with "ещё", tappable #tags, "Посмотреть все комментарии".
  Text-only posts as quote cards.
- Post screen (`/post/:id`, also the deep link): post, disclaimer,
  comments with one reply level ("Anna K." for clients), likes, delete,
  report, composer with reply-to.
- Composer ("+" for attorneys): text with a 2200 counter, up to 10 photos
  uploaded as they're picked, drag to reorder, disclaimer.
- Tag page `#tag` (Топ / Новые), follower / following lists, profile:
  real Follow button (morphing pill), follower counters open the lists,
  "Посты" tab is a 3-column grid (text posts as tiles). "Моё →
  Сохранённое" shows saved posts ("Пост недоступен" when gone); attorneys
  switch between saved cases and posts.
- Packages: share_plus, cached_network_image (images cached by stable file
  key, so signed-URL rotation doesn't re-download), plus socket_io_client,
  firebase_core/messaging, app_badge_plus, flutter_timezone for 5.11.

Tests: `test/features/social` (optimistic like + rollback, no double API
call, double tap only likes, offline cache fallback, post card render);
deep link `/post/:id` now opens the post screen; feed/profile goldens
updated. flutter test 597/597.
