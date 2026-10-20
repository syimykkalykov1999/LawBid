import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { S3StorageService } from '../files/storage/s3-storage.service';
import { PrismaService } from '../../prisma/prisma.service';

/** app_config key that marks the starter catalog as done (it is made once,
 * so what an admin later edits or deletes is never brought back). */
export const STARTER_CATALOG_KEY = 'stars.starter_catalog';
const LOCK_ID = 7_770_021;

interface Catalog {
  gifts: { file: string; title: string; priceStars: number }[];
  packs: {
    title: string;
    shortName: string;
    priceStars: number;
    stickers: { file: string; emoji: string }[];
  }[];
}

export interface StarterResult {
  gifts: number;
  packs: number;
  skipped?: string;
}

/**
 * Owner 2026-10-20 («целиком»): the first start after a deploy fills the
 * catalog — 17 gifts with prices and 3 official sticker packs (one free,
 * two paid) drawn by us (prisma/seed/economy, rebuilt by generate_art.py).
 * Idempotent and one-time: a marker in app_config, a Postgres advisory lock
 * against two tasks starting together. The admin edits everything after.
 * Skipped without storage keys (the images live in the media bucket), in
 * tests, and with SKIP_STARTER_CATALOG=1. Also `npm run seed:economy`.
 */
@Injectable()
export class StarterCatalogService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(StarterCatalogService.name);
  }

  onApplicationBootstrap(): void {
    if (
      this.config.get<string>('NODE_ENV') === 'test' ||
      process.env.SKIP_STARTER_CATALOG === '1'
    ) {
      return;
    }
    // Never holds the start of the API.
    void this.run()
      .then((r) => this.logger.info(r, 'Starter catalog'))
      .catch((err: unknown) =>
        this.logger.error({ err }, 'Starter catalog failed'),
      );
  }

  private dir(): string | null {
    const candidates = [
      join(__dirname, '../../../prisma/seed/economy'),
      join(__dirname, '../../../../prisma/seed/economy'),
      join(process.cwd(), 'prisma/seed/economy'),
      join(process.cwd(), 'apps/api/prisma/seed/economy'),
    ];
    return candidates.find((d) => existsSync(join(d, 'catalog.json'))) ?? null;
  }

  async run(): Promise<StarterResult> {
    const none = (skipped: string): StarterResult => ({
      gifts: 0,
      packs: 0,
      skipped,
    });
    if (
      await this.prisma.appConfig.findUnique({
        where: { key: STARTER_CATALOG_KEY },
      })
    ) {
      return none('already done');
    }
    const dir = this.dir();
    if (!dir) return none('no catalog files');
    if (!(await this.storage.ready())) return none('no file storage');
    const owner =
      (await this.prisma.user.findFirst({
        where: { role: 'admin', deleted_at: null },
        orderBy: { created_at: 'asc' },
        select: { id: true },
      })) ??
      (await this.prisma.user.findFirst({
        orderBy: { created_at: 'asc' },
        select: { id: true },
      }));
    if (!owner) return none('no users yet');
    const catalog = JSON.parse(
      readFileSync(join(dir, 'catalog.json'), 'utf8'),
    ) as Catalog;
    const bucket = this.storage.bucket('media');

    return this.prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<{ ok: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(${LOCK_ID}) AS ok`;
        if (!lock?.ok) return none('another task is doing it');
        if (
          await tx.appConfig.findUnique({ where: { key: STARTER_CATALOG_KEY } })
        ) {
          return none('already done');
        }
        const image = async (file: string): Promise<string> => {
          const data = readFileSync(join(dir, file));
          const id = randomUUID();
          const key = `sticker/starter/${id}.png`;
          await this.storage.put(bucket, key, data, 'image/png');
          const sha = createHash('sha256').update(data).digest('hex');
          await tx.file.create({
            data: {
              id,
              owner_user_id: owner.id,
              purpose: 'sticker',
              s3_bucket: bucket,
              s3_key: key,
              mime: 'image/png',
              size_bytes: BigInt(data.length),
              sha256: sha,
              source_sha256: sha,
              scan_status: 'clean',
              is_public: true,
            },
          });
          return id;
        };

        let gifts = 0;
        if ((await tx.gift.count()) === 0) {
          for (const [i, g] of catalog.gifts.entries()) {
            await tx.gift.create({
              data: {
                title: g.title,
                price_stars: g.priceStars,
                position: i,
                file_id: await image(g.file),
              },
            });
            gifts++;
          }
        }
        let packs = 0;
        for (const p of catalog.packs) {
          if (
            await tx.stickerPack.findUnique({
              where: { short_name: p.shortName },
            })
          ) {
            continue;
          }
          const pack = await tx.stickerPack.create({
            data: {
              title: p.title,
              short_name: p.shortName,
              is_official: true,
              price_stars: p.priceStars,
              sticker_count: p.stickers.length,
            },
          });
          for (const [i, s] of p.stickers.entries()) {
            await tx.sticker.create({
              data: {
                pack_id: pack.id,
                file_id: await image(s.file),
                emoji: s.emoji,
                position: i,
              },
            });
          }
          packs++;
        }
        await tx.appConfig.create({
          data: {
            key: STARTER_CATALOG_KEY,
            value: { gifts, packs, at: new Date().toISOString() },
          },
        });
        return { gifts, packs };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }
}
