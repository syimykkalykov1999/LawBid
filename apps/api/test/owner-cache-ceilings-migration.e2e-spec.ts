import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * Owner 2026-11-03: the media caches on the phone have no per-store ceiling
 * any more. A row saved earlier with the OLD default keeps overriding the new
 * code default for ever, so the migration resets those rows to 0 — only where
 * the stored value still equals the old default — and drops the keep-media
 * knob. Runs the real migration SQL against the test database.
 */
jest.setTimeout(60_000);

const SQL = readFileSync(
  join(
    __dirname,
    '../prisma/migrations/20261114120000_cache_ceilings_follow_user_cap/migration.sql',
  ),
  'utf8',
);
// Without the lock_timeout line (SET LOCAL needs a transaction, applied below).
const BODY = SQL.replace("SET LOCAL lock_timeout = '5s';", '');

const KEYS = [
  'cache.limit_mb.images',
  'cache.limit_mb.chat_media',
  'cache.limit_mb.files',
  'cache.limit_mb.video',
  'cache.limit_mb.http',
  'cache.keep_media_days.default',
];

describe('cache ceilings follow the user cap (migration)', () => {
  const prisma = new PrismaClient();

  const put = (key: string, value: unknown) =>
    prisma.appConfig.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
  const get = async (key: string) =>
    (await prisma.appConfig.findUnique({ where: { key } }))?.value;
  const migrate = () =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
      for (const stmt of BODY.split(';').filter((s) =>
        /\w/.test(s.replace(/--.*$/gm, '')),
      )) {
        await tx.$executeRawUnsafe(stmt);
      }
    });

  beforeEach(async () => {
    await prisma.appConfig.deleteMany({ where: { key: { in: KEYS } } });
  });
  afterAll(async () => {
    await prisma.appConfig.deleteMany({ where: { key: { in: KEYS } } });
    await prisma.$disconnect();
  });

  it('resets rows that still hold the old default (number or string)', async () => {
    await put('cache.limit_mb.images', 1000);
    await put('cache.limit_mb.chat_media', '1000');
    await put('cache.limit_mb.files', 500);
    await put('cache.limit_mb.video', 1000);
    await migrate();
    expect(await get('cache.limit_mb.images')).toBe(0);
    expect(await get('cache.limit_mb.chat_media')).toBe('0');
    expect(await get('cache.limit_mb.files')).toBe(0);
    expect(await get('cache.limit_mb.video')).toBe(0);
  });

  it('keeps a value an admin chose on purpose, and the small stores', async () => {
    await put('cache.limit_mb.images', 300);
    await put('cache.limit_mb.files', 1000); // not files' old default (500)
    await put('cache.limit_mb.http', 32);
    await migrate();
    expect(await get('cache.limit_mb.images')).toBe(300);
    expect(await get('cache.limit_mb.files')).toBe(1000);
    expect(await get('cache.limit_mb.http')).toBe(32);
  });

  it('drops the keep-media knob and is safe to run twice', async () => {
    await put('cache.keep_media_days.default', 30);
    await put('cache.limit_mb.video', 1000);
    await migrate();
    await migrate();
    expect(await get('cache.keep_media_days.default')).toBeUndefined();
    expect(await get('cache.limit_mb.video')).toBe(0);
  });

  it('starts with lock_timeout (squawk) and never touches other keys', () => {
    expect(SQL.trimStart().startsWith("SET LOCAL lock_timeout = '5s';")).toBe(
      true,
    );
    expect(SQL).toMatch(/"key" = 'cache\.keep_media_days\.default'/);
    expect(SQL).not.toMatch(/DELETE FROM "app_config";/);
  });
});
