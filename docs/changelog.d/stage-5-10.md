## Stage 5.10 — Flutter: search

docs/05 §16 stage 5.10, §7, §11 (search).

- Search tab (replaces the stub): one query for all result tabs — clients
  "Адвокаты | Посты | Темы", attorneys "Люди | Кейсы | Посты | Темы";
  2+ characters and a 300 ms debounce, so one request per pause in typing
  (never per keystroke).
- Flip search bar: while idle and empty the hint flips through what can be
  searched (name, @username, #topics, practice/state or cases) like a
  split-flap board; focus warms the border to gold with a soft glow, the
  icon tilts, "Cancel" slides in, clear pops in. Reduced motion: static
  hint. The whole bar is a 48 px tap target.
- Before typing: recent searches (local drift, per account, "Очистить"),
  popular topics (trending, with post counts), recommended attorneys.
- Results: attorney rows (rating, practices, states, Follow), case cards
  (the attorney's accessible cases only — server-side), post cards, topic
  rows → the tag page.
- Filters sheet: practice (full tree, searchable), state, min rating and
  language for attorneys; practice, state and period (24h/7d/30d/all) for
  cases; active-filter badge on the tune button.

Tests: debounce + 2-char minimum (one API call for "sa→sau→saul"), role
tabs; a11y suite covers the search screen. flutter test 599/599.
