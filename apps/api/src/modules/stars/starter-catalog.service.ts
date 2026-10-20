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
/** The account that owns the starter images (it never signs in). */
const SYSTEM_EMAIL = 'catalog@system.lawbid.invalid';

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
    const catalog = JSON.parse(
      readFileSync(join(dir, 'catalog.json'), 'utf8'),
    ) as Catalog;
    const bucket = this.storage.bucket('media');

    // The owner of the files is a system account of its own, so deleting a
    // real user (File.owner is Restrict) never meets these images.
    const owner = await this.prisma.user.upsert({
      where: { email: SYSTEM_EMAIL },
      create: {
        placeholder_kind: 'system',
        email: SYSTEM_EMAIL,
        first_name: 'LawBid',
        last_name: 'Catalog',
      },
      update: { placeholder_kind: 'system' },
      select: { id: true },
    });

    // Images go to storage first (outside the transaction); whatever is not
    // kept by the committed rows is removed again, so a rollback or a race
    // leaves no orphan objects.
    const uploaded = new Map<
      string,
      { id: string; key: string; size: number; sha: string }
    >();
    const used = new Set<string>();
    const upload = async (file: string): Promise<void> => {
      const data = readFileSync(join(dir, file));
      const id = randomUUID();
      const key = `sticker/starter/${id}.png`;
      await this.storage.put(bucket, key, data, 'image/png');
      uploaded.set(file, {
        id,
        key,
        size: data.length,
        sha: createHash('sha256').update(data).digest('hex'),
      });
    };
    try {
      const wantGifts = (await this.prisma.gift.count()) === 0;
      const have = new Set(
        (
          await this.prisma.stickerPack.findMany({
            where: {
              short_name: { in: catalog.packs.map((p) => p.shortName) },
            },
            select: { short_name: true },
          })
        ).map((p) => p.short_name),
      );
      const wantPacks = catalog.packs.filter((p) => !have.has(p.shortName));
      if (wantGifts) for (const g of catalog.gifts) await upload(g.file);
      for (const p of wantPacks)
        for (const s of p.stickers) await upload(s.file);

      const result = await this.prisma.$transaction(
        async (tx) => {
          const [lock] = await tx.$queryRaw<{ ok: boolean }[]>`
            SELECT pg_try_advisory_xact_lock(${LOCK_ID}) AS ok`;
          if (!lock?.ok) return none('another task is doing it');
          if (
            await tx.appConfig.findUnique({
              where: { key: STARTER_CATALOG_KEY },
            })
          ) {
            return none('already done');
          }
          const image = async (file: string): Promise<string> => {
            const u = uploaded.get(file)!;
            await tx.file.create({
              data: {
                id: u.id,
                owner_user_id: owner.id,
                purpose: 'sticker',
                s3_bucket: bucket,
                s3_key: u.key,
                mime: 'image/png',
                size_bytes: BigInt(u.size),
                sha256: u.sha,
                source_sha256: u.sha,
                scan_status: 'clean',
                is_public: true,
              },
            });
            used.add(file);
            return u.id;
          };
          let gifts = 0;
          if (wantGifts && (await tx.gift.count()) === 0) {
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
          for (const p of wantPacks) {
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
            for (const [i, st] of p.stickers.entries()) {
              await tx.sticker.create({
                data: {
                  pack_id: pack.id,
                  file_id: await image(st.file),
                  emoji: st.emoji,
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
        { timeout: 60_000, maxWait: 10_000 },
      );
      // Committed: only the rows that exist keep their objects.
      await this.dropUnused(
        bucket,
        uploaded,
        result.skipped ? new Set() : used,
      );
      return result;
    } catch (err) {
      await this.dropUnused(bucket, uploaded, new Set());
      throw err;
    }
  }

  private async dropUnused(
    bucket: string,
    uploaded: Map<string, { key: string }>,
    used: Set<string>,
  ): Promise<void> {
    const keys = [...uploaded]
      .filter(([file]) => !used.has(file))
      .map(([, u]) => u.key);
    try {
      await this.storage.remove(bucket, keys);
    } catch (err) {
      this.logger.warn({ err }, 'Starter catalog: could not remove objects');
    }
  }
}
