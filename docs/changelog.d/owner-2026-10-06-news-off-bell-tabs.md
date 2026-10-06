## Owner 2026-10-06 — News off, «Юр. посты», photos and videos, bell tabs

- News is switched off but kept in code behind the new `news_posts` flag
  (Admin → Система → Функции → «Новости», off by default; migration
  `20261006170000_owner_news_off`). While off: no News topic in the feed or
  in «Выберите темы», no Post / News switch in the composer, no News tab in
  the attorney profile, no «News» label on cards and search tiles. The API
  stores a `kind: news` request (older apps, approved assistant requests) as
  a regular legal post.
- Feed filter row: «Все» · «Юр. посты» · topics. «Юр. посты» replaces the
  separate «Весь контент» pill and the News pill; it toggles the same
  legal-only setting as Filters → Content.
- Post composer: one «Фото и видео» section (one gallery for photos and a
  video when reels are on); clients may add a video too (their plans already
  include `video_posts`; the server never restricted them).
- Bell: «Все» · «Важные» · «Остальные» (· «Помощники» for attorneys).
  `GET /notifications?group=important|other`; the split is
  `NOTIFICATION_IMPORTANT` in notifications.service.ts. Likes, follows,
  comments, followed posts and new-device logins are «Остальные».
- An accepted bid (`bid_accepted` / `offer_accepted`) carries the
  `conversationId`; the row and the push open that chat, where the system
  message «Предложение принято, контакты открыты» is already posted.
- The bell never shows a raw key: missing texts added (`followed_post`,
  `new_case`, case invites, partner events) plus a generic fallback.
- Strings: `news_off_strings.dart`; other languages in
  `tmp-import/news-off-keys-update.xlsx`.
