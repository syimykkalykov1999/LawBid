## Owner 2026-10-06 — «Юр. посты» choice in topics, several states

- «Выберите темы» starts with a «Юр. посты» group (one choice, kept on the
  device): «Все юр. посты» (every post with a qualification) or «Только мои
  темы» (only posts of the qualifications picked below). The «Юр. посты»
  pill shows that; «Все» still shows every post.
- «Выберите штат» picks several states at once, in the post feed and in the
  attorney's «Кейсы» tab. A picked state is no longer a chip in the slider:
  the filter button turns gold and the sheet row lists the states.
- API: `GET /search/latest-posts?states=IL,NY&practices=a,b.c` and
  `GET /cases?states=NJ,NY` (comma-separated; `state` still works and joins
  them). Posts: authors with a verified licence in any of the states; cases:
  primary or additional state in any of them.
- Strings: `feed.legal.*` in `news_off_strings.dart`; other languages in
  `tmp-import/feed-legal-scope-keys.xlsx`.
