## Stage 5.3 — Feed (API)

docs/05 §16 stage 5.3, §2.2.

- `GET /feed?cursor=&limit=10..20` (`modules/feed`, `FeedProvider` seam for
  later profile promotion): followed attorneys' posts (+ own for an
  attorney), newest first; with follows every 4th item is a
  recommendation, without follows 100%; when followed posts run out,
  recommendations fill the page.
- Recommendations: `FeedRecoJob` every 10 minutes scores posts of the last
  14 days `(likes + 2·comments + 2·saves) / (age_h + 2)^1.5` (active,
  non-suspended authors) into a versioned ZSET `feed:reco:<v>` (TTL 1 h)
  and moves `feed:reco:current`.
- Opaque cursor `{f: last followed (created_at,id) | null, r: offset in the
  pinned snapshot, v: snapshot version}` — no SQL offset; pages stay stable
  while the snapshot is recomputed.
- Exclusions: non-published / deleted / suspended-author posts
  (`VISIBLE_POST_WHERE`); recommendations skip followed and own authors and
  the viewer's last 500 shown recommendations (ZSET, TTL 3 days). Followed
  posts are not hidden by "seen" so the feed still opens on them.
- First page cached in Redis for 60 s per user.

Tests: unit `feed-mixer.spec.ts` (mixing, multi-page no dups/gaps, cursor,
score); e2e `stage-5-3.e2e-spec.ts` 2/2.
