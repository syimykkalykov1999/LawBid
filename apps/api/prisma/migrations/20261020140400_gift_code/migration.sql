-- Starter gifts have a code so the app can show their names in every language.
ALTER TABLE "gifts" ADD COLUMN "code" VARCHAR(24);
-- Gifts the starter catalog already made (local databases).
UPDATE "gifts" SET "code" = 'rose' WHERE "title" = 'Rose' AND "file_id" IN (SELECT "id" FROM "files" WHERE "s3_key" LIKE 'sticker/starter/%');
UPDATE "gifts" SET "code" = 'heart' WHERE "title" = 'Heart' AND "file_id" IN (SELECT "id" FROM "files" WHERE "s3_key" LIKE 'sticker/starter/%');
UPDATE "gifts" SET "code" = 'star' WHERE "title" = 'Star' AND "file_id" IN (SELECT "id" FROM "files" WHERE "s3_key" LIKE 'sticker/starter/%');
UPDATE "gifts" SET "code" = 'balloon' WHERE "title" = 'Balloon' AND "file_id" IN (SELECT "id" FROM "files" WHERE "s3_key" LIKE 'sticker/starter/%');
UPDATE "gifts" SET "code" = 'coffee' WHERE "title" = 'Coffee' AND "file_id" IN (SELECT "id" FROM "files" WHERE "s3_key" LIKE 'sticker/starter/%');
UPDATE "gifts" SET "code" = 'clover' WHERE "title" = 'Lucky clover' AND "file_id" IN (SELECT "id" FROM "files" WHERE "s3_key" LIKE 'sticker/starter/%');
UPDATE "gifts" SET "code" = 'giftbox' WHERE "title" = 'Gift box' AND "file_id" IN (SELECT "id" FROM "files" WHERE "s3_key" LIKE 'sticker/starter/%');
UPDATE "gifts" SET "code" = 'cake' WHERE "title" = 'Cake' AND "file_id" IN (SELECT "id" FROM "files" WHERE "s3_key" LIKE 'sticker/starter/%');
UPDATE "gifts" SET "code" = 'gavel' WHERE "title" = 'Gavel' AND "file_id" IN (SELECT "id" FROM "files" WHERE "s3_key" LIKE 'sticker/starter/%');
UPDATE "gifts" SET "code" = 'scales' WHERE "title" = 'Scales of justice' AND "file_id" IN (SELECT "id" FROM "files" WHERE "s3_key" LIKE 'sticker/starter/%');
UPDATE "gifts" SET "code" = 'shield' WHERE "title" = 'Shield' AND "file_id" IN (SELECT "id" FROM "files" WHERE "s3_key" LIKE 'sticker/starter/%');
UPDATE "gifts" SET "code" = 'key' WHERE "title" = 'Golden key' AND "file_id" IN (SELECT "id" FROM "files" WHERE "s3_key" LIKE 'sticker/starter/%');
UPDATE "gifts" SET "code" = 'medal' WHERE "title" = 'Medal' AND "file_id" IN (SELECT "id" FROM "files" WHERE "s3_key" LIKE 'sticker/starter/%');
UPDATE "gifts" SET "code" = 'rocket' WHERE "title" = 'Rocket' AND "file_id" IN (SELECT "id" FROM "files" WHERE "s3_key" LIKE 'sticker/starter/%');
UPDATE "gifts" SET "code" = 'trophy' WHERE "title" = 'Trophy' AND "file_id" IN (SELECT "id" FROM "files" WHERE "s3_key" LIKE 'sticker/starter/%');
UPDATE "gifts" SET "code" = 'diamond' WHERE "title" = 'Diamond' AND "file_id" IN (SELECT "id" FROM "files" WHERE "s3_key" LIKE 'sticker/starter/%');
UPDATE "gifts" SET "code" = 'crown' WHERE "title" = 'Crown' AND "file_id" IN (SELECT "id" FROM "files" WHERE "s3_key" LIKE 'sticker/starter/%');
