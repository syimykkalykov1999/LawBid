-- Security pass 2026-10-25 (S3-5): chat attachment names and the case
-- «Личные данные» are stored sealed (AES-256-GCM text, about 4/3 of the
-- plain size plus ~70 characters). The old length checks were written for
-- plain text; the API still limits the PLAIN text (200 characters for a
-- file name, `limits.case_private_details_chars` up to 50000 for the
-- details) before it is sealed. Only the database ceiling moves.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_file_name_len;
ALTER TABLE messages ADD CONSTRAINT messages_file_name_len
  CHECK (file_name IS NULL OR (char_length(file_name) >= 1 AND char_length(file_name) <= 1400)) NOT VALID;
ALTER TABLE messages VALIDATE CONSTRAINT messages_file_name_len;

ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_private_details_len;
ALTER TABLE cases ADD CONSTRAINT cases_private_details_len
  CHECK (private_details IS NULL OR char_length(private_details) <= 300000) NOT VALID;
ALTER TABLE cases VALIDATE CONSTRAINT cases_private_details_len;
