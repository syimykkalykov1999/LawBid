-- Owner 2026-10-13: a post's qualification is also stored as hidden tags
-- (`~family`, `~family.divorce`): one tag algorithm for Topics, search, the
-- Reels filters and the profile filters. Data only — nothing is dropped, and
-- a rollback simply ignores the `~` tags.
WITH levels AS (
  SELECT p.id AS post_id,
         '~' || left(lower(pa.code), CASE WHEN substr(lower(pa.code), i, 1) = '.' THEN i - 1 ELSE i END) AS tag_lower
  FROM posts p
  JOIN practice_areas pa ON pa.id = p.practice_area_id
  CROSS JOIN LATERAL generate_series(1, length(pa.code)) AS i
  WHERE i = length(pa.code) OR substr(lower(pa.code), i, 1) = '.'
)
INSERT INTO tags (tag_lower)
SELECT DISTINCT tag_lower FROM levels
ON CONFLICT (tag_lower) DO NOTHING;

WITH levels AS (
  SELECT p.id AS post_id,
         '~' || left(lower(pa.code), CASE WHEN substr(lower(pa.code), i, 1) = '.' THEN i - 1 ELSE i END) AS tag_lower
  FROM posts p
  JOIN practice_areas pa ON pa.id = p.practice_area_id
  CROSS JOIN LATERAL generate_series(1, length(pa.code)) AS i
  WHERE i = length(pa.code) OR substr(lower(pa.code), i, 1) = '.'
)
INSERT INTO post_tags (post_id, tag_id)
SELECT DISTINCT l.post_id, t.id
FROM levels l
JOIN tags t ON t.tag_lower = l.tag_lower
ON CONFLICT (post_id, tag_id) DO NOTHING;
