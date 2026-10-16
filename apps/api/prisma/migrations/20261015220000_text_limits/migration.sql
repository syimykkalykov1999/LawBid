-- Owner 2026-10-15: the admin sets how long each text may be (app_config
-- `limits.*`). The old fixed CHECKs would refuse a raised limit, so each
-- is widened to the highest value the admin panel accepts
-- (apps/api/src/common/app-settings/text-limits.ts). The limit itself is
-- checked by the API; these are only the outer bounds.

ALTER TABLE comments DROP CONSTRAINT comments_body_len;
ALTER TABLE comments ADD CONSTRAINT comments_body_len CHECK (char_length(body) <= 5000);

ALTER TABLE case_comments DROP CONSTRAINT case_comments_body_len;
ALTER TABLE case_comments ADD CONSTRAINT case_comments_body_len CHECK (char_length(body) >= 1 AND char_length(body) <= 5000);

ALTER TABLE posts DROP CONSTRAINT posts_title_len;
ALTER TABLE posts ADD CONSTRAINT posts_title_len CHECK (title IS NULL OR (char_length(title) >= 1 AND char_length(title) <= 300));

ALTER TABLE cases DROP CONSTRAINT cases_title_len;
ALTER TABLE cases ADD CONSTRAINT cases_title_len CHECK (char_length(title) <= 300);
ALTER TABLE cases DROP CONSTRAINT cases_description_len;
ALTER TABLE cases ADD CONSTRAINT cases_description_len CHECK (char_length(description) <= 20000);

ALTER TABLE bids DROP CONSTRAINT bids_message_len;
ALTER TABLE bids ADD CONSTRAINT bids_message_len CHECK (char_length(message) <= 10000);

ALTER TABLE reviews DROP CONSTRAINT reviews_body_len;
ALTER TABLE reviews ADD CONSTRAINT reviews_body_len CHECK (char_length(body) <= 5000);

ALTER TABLE attorney_profiles DROP CONSTRAINT attorney_profiles_bio_len;
ALTER TABLE attorney_profiles ADD CONSTRAINT attorney_profiles_bio_len CHECK (char_length(bio) <= 1000);

ALTER TABLE support_messages ALTER COLUMN body TYPE VARCHAR(20000);
ALTER TABLE case_updates ALTER COLUMN body TYPE VARCHAR(20000);
