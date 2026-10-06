-- Owner 2026-10-06: the News system is switched off for now (a News post and
-- a regular post land in the same feed). The code stays behind the
-- `news_posts` flag (Admin → Система → Функции); off by default.
INSERT INTO feature_flags (key, enabled, rollout_percent, description, updated_at)
VALUES ('news_posts', false, 100, 'News: the News topic, the Post/News switch and the profile News tab', now())
ON CONFLICT (key) DO NOTHING;
