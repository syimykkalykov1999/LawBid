-- Owner 2026-09-30: opt-in alerts — new posts / news of people I follow,
-- and (attorneys) new cases in my practices and licensed states. Both
-- categories are off until the user turns them on.
ALTER TYPE "notification_category" ADD VALUE 'following';
ALTER TYPE "notification_category" ADD VALUE 'new_cases';
ALTER TYPE "notification_type" ADD VALUE 'followed_post';
ALTER TYPE "notification_type" ADD VALUE 'new_case';
