import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  STARTER_CATALOG_KEY,
  StarterCatalogService,
} from '../src/modules/stars/starter-catalog.service';

/**
 * Owner 2026-10-20: the first start fills the gift catalog and the starter
 * sticker packs once (images drawn by us), never again, never over an
 * admin's own catalog.
 */
jest.setTimeout(120_000);

describe('Starter catalog (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stored: string[] = [];
  const removed: string[] = [];

  const storage = {
    ready: () => Promise.resolve(true),
    remove: (_b: string, keys: string[]) => {
      removed.push(...keys);
      return Promise.resolve();
    },
    bucket: () => 'media-test',
    put: (_b: string, key: string) => {
      stored.push(key);
      return Promise.resolve();
    },
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.appConfig.deleteMany({ where: { key: STARTER_CATALOG_KEY } });
    const files = { s3_key: { in: stored } };
    await prisma.gift.deleteMany({ where: { file: files } });
    await prisma.sticker.deleteMany({ where: { file: files } });
    await prisma.stickerPack.deleteMany({
      where: { short_name: { startsWith: 'lawbid_' }, is_official: true },
    });
    await prisma.file.deleteMany({ where: files });
    await prisma.user.deleteMany({
      where: { email: 'catalog@system.lawbid.invalid' },
    });
    await app.close();
  });

  it('makes the gifts and three packs once; a second run does nothing', async () => {
    await prisma.appConfig.deleteMany({ where: { key: STARTER_CATALOG_KEY } });
    const noGiftsYet = (await prisma.gift.count()) === 0;
    const svc = new StarterCatalogService(
      prisma,
      storage as never,
      app.get(ConfigService),
      { setContext: () => undefined, info: () => undefined } as never,
    );
    const first = await svc.run();
    expect(first.packs).toBe(3);
    expect(first.gifts).toBe(noGiftsYet ? 17 : 0);
    expect(stored.length).toBe(24 + first.gifts);

    const packs = await prisma.stickerPack.findMany({
      where: { short_name: { startsWith: 'lawbid_' }, is_official: true },
      include: { stickers: true },
      orderBy: { price_stars: 'asc' },
    });
    expect(packs.map((p) => p.price_stars)).toEqual([0, 49, 99]);
    expect(packs.every((p) => p.stickers.length === 8)).toBe(true);
    expect(packs.every((p) => p.sticker_count === 8)).toBe(true);
    const f = await prisma.file.findUniqueOrThrow({
      where: { id: packs[0].stickers[0].file_id },
    });
    const owner = await prisma.user.findUniqueOrThrow({
      where: { id: f.owner_user_id },
    });
    expect(owner.email).toBe('catalog@system.lawbid.invalid');
    expect(removed).toEqual([]);
    expect(f).toMatchObject({
      purpose: 'sticker',
      scan_status: 'clean',
      is_public: true,
      mime: 'image/png',
    });

    expect(await svc.run()).toMatchObject({ skipped: 'already done' });
    expect(stored.length).toBe(24 + first.gifts);
  });
});
