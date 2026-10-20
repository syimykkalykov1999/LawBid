-- Owner 2026-10-18: the composer has separate «Заголовок» / «Описание»
-- fields. A post published WITHOUT a title stores '' (not NULL): NULL keeps
-- meaning "an older post whose first line is its title", '' means "the
-- author chose no title" — the app then shows the description only.
ALTER TABLE "posts" DROP CONSTRAINT IF EXISTS "posts_title_len";
ALTER TABLE "posts" ADD CONSTRAINT "posts_title_len"
  CHECK (title IS NULL OR char_length(title) <= 300);
