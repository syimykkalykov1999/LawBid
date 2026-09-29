## Stage 5.6 — Search (API)

docs/05 §16 stage 5.6, §7, §15 "Поиск".

- `modules/search`: `SearchProvider` interface (`searchAttorneys`,
  `searchCases`, `searchPosts`, `searchTags`) with `CockroachSearchProvider`
  on the docs/02 §5.3 indexes (trigram GIN on `username_lower` /
  `full_name_lower`, tsvector GIN on `posts/cases.search_tsv`, btree prefix
  on `tags.tag_lower`).
- `GET /search/attorneys` — name, `@username`, practice name, state; filters
  practice, state, min rating, language. Attorneys only (clients are never
  found), `suspended` hidden. Ranking: exact `@username`, prefix, trigram
  similarity, then `verified`, then rating. List rows gain
  `practiceI18nKeys` (first 3 practices, also in follows/suggestions).
- `GET /search/cases` (attorneys only, 403 otherwise) — full text within the
  docs/04 §4.1 visibility query (`buildVisibleCasesSql` gets optional
  `text` / `since`), filters practice, state, period 24h/7d/30d/all; every
  page also passes `CaseAccessPolicy.visibleCaseIds`. Unverified → empty.
- `GET /search/posts` — published posts by `ts_rank`, then date.
- `GET /search/tags` — hashtag prefix; `GET /search/trending-tags` — top 20
  of 7 days from Redis, rebuilt by cron `search.trending-tags` every 10 min.
- `GET /tags/:tag/posts?sort=top|new` — "Топ" by the §2.2.2 score over the
  newest 5000 tagged posts, "Новые" by date (keyset).
- Cost/scale: ranked results (attorneys, posts, tag top) are computed once
  per query into a shared Redis id list (5–10 min) and paged by position —
  next pages are one Redis read, no SQL OFFSET. Cache keys hash the query,
  never the user id. §13 `search` limit (30/min) on `/search/*` except
  trending. Request logs redact the query string of `/search/*` (§7.6).

Tests: e2e `stage-5-6.e2e-spec.ts` 4/4 (incl. EXPLAIN on the trigram and
tsvector indexes); unit `search-text.spec.ts`.
