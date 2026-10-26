import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Prisma, Sticker, StickerPack } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { readSwitchMode } from '../../common/app-settings/switch-mode';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { MediaModerationQueue } from '../media-moderation/media-moderation.queue';
import { ReportsService } from '../reports/reports.module';
import { StarsService } from '../stars/stars.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type {
  ReportStickerPackDto,
  StickerDto,
  StickerLibraryDto,
  StickerPackDto,
} from './stickers.dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PackWithStickers = StickerPack & { stickers: Sticker[] };

const limit = (what: string, max: number) =>
  new ConflictException({
    code: ErrorCode.STICKER_LIMIT_REACHED,
    message: `Limit reached: ${what}.`,
    details: { what, max },
  });

/**
 * Owner 2026-10-01 — stickers exactly like Telegram: anyone makes packs
 * with "+", adds their own images with an emoji, installs anyone's pack
 * from a sticker in a chat; recently used first. Official packs come from
 * the admin panel; a hidden pack can't be installed or sent any more
 * (stickers already in chats stay visible).
 */
@Injectable()
export class StickersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly settings: AppSettingsService,
    private readonly limits: UsageLimitsService,
    private readonly stars: StarsService,
    private readonly reports: ReportsService,
    // Owner 2026-10-28: the scan of a user's new image (media moderation).
    @Optional() private readonly mediaQueue?: MediaModerationQueue,
  ) {}

  /** GET /stickers — recent + my installed packs. */
  async library(userId: string): Promise<StickerLibraryDto> {
    const recentMax = await this.settings.number('stickers.recent_max');
    const [installs, recent] = await Promise.all([
      this.prisma.userStickerPack.findMany({
        where: {
          user_id: userId,
          pack: { deleted_at: null, status: 'active' },
        },
        orderBy: [{ position: 'asc' }, { installed_at: 'asc' }],
        include: {
          pack: {
            include: {
              stickers: {
                where: this.visible(userId),
                orderBy: { position: 'asc' },
              },
            },
          },
        },
      }),
      this.prisma.userRecentSticker.findMany({
        where: {
          user_id: userId,
          sticker: {
            deleted_at: null,
            moderation_status: 'active',
            pack: { deleted_at: null, status: 'active' },
          },
        },
        orderBy: { used_at: 'desc' },
        take: recentMax,
        include: { sticker: true },
      }),
    ]);
    const packs = installs.map((i) => i.pack);
    const urls = await this.urls([
      ...packs.flatMap((p) => p.stickers),
      ...recent.map((r) => r.sticker),
    ]);
    return {
      recent: recent.map((r) => this.sticker(r.sticker, urls)),
      packs: packs.map((p) => this.pack(p, userId, true, urls)),
    };
  }

  /** Delta audit P7: the inputs of GET /stickers/featured's cheap ETag:
   * the official packs and their stickers, plus this person's installs
   * (the `installed` flag). Aggregates only, no rows, no presigning. */
  async featuredStamp(
    userId: string,
  ): Promise<(string | number | Date | null)[]> {
    const official = { is_official: true, status: 'active', deleted_at: null };
    const [packs, stickers, mine] = await Promise.all([
      this.prisma.stickerPack.aggregate({
        where: official,
        _max: { updated_at: true },
        _sum: { install_count: true },
        _count: { _all: true },
      }),
      this.prisma.sticker.aggregate({
        where: { deleted_at: null, pack: official },
        _max: { created_at: true },
        _count: { _all: true },
      }),
      this.prisma.userStickerPack.aggregate({
        where: { user_id: userId },
        _max: { installed_at: true },
        _count: { _all: true },
      }),
    ]);
    return [
      packs._max.updated_at,
      packs._sum.install_count,
      packs._count._all,
      stickers._max.created_at,
      stickers._count._all,
      mine._max.installed_at,
      mine._count._all,
    ];
  }

  /** GET /stickers/featured — official packs, most installed first. */
  async featured(userId: string): Promise<StickerPackDto[]> {
    const packs = await this.prisma.stickerPack.findMany({
      where: { is_official: true, status: 'active', deleted_at: null },
      orderBy: { install_count: 'desc' },
      take: 50,
      include: this.withStickers(userId),
    });
    return this.present(packs, userId);
  }

  /** GET /stickers/packs/:ref — a pack by id or short name. */
  async get(userId: string, ref: string): Promise<StickerPackDto> {
    const pack = await this.find(ref, false, userId);
    const [dto] = await this.present([pack], userId);
    return dto;
  }

  /** POST /stickers/packs — a new own pack, installed right away. */
  async create(userId: string, title: string): Promise<StickerPackDto> {
    const max = await this.settings.number('stickers.max_own_packs');
    const own = await this.prisma.stickerPack.count({
      where: { owner_user_id: userId, deleted_at: null },
    });
    if (own >= max) throw limit('own_packs', max);
    await this.assertInstallRoom(userId);
    await this.limits.consume('sticker_pack_create', userId);
    const pack = await this.prisma.$transaction(async (tx) => {
      const p = await tx.stickerPack.create({
        data: {
          owner_user_id: userId,
          title: title.trim(),
          short_name: `s${randomBytes(6).toString('hex')}`,
          install_count: 1,
        },
        include: this.withStickers(userId),
      });
      await tx.userStickerPack.create({
        data: { user_id: userId, pack_id: p.id, position: -1 },
      });
      return p;
    });
    return this.pack(pack, userId, true, new Map());
  }

  async rename(
    userId: string,
    ref: string,
    title: string,
  ): Promise<StickerPackDto> {
    const pack = await this.own(userId, ref);
    await this.prisma.stickerPack.update({
      where: { id: pack.id },
      data: { title: title.trim() },
    });
    return this.get(userId, pack.id);
  }

  /** DELETE /stickers/packs/:ref — my pack goes away for everyone; sent
   * stickers keep showing in chats. */
  async remove(userId: string, ref: string): Promise<void> {
    const pack = await this.own(userId, ref);
    await this.prisma.$transaction([
      this.prisma.userStickerPack.deleteMany({ where: { pack_id: pack.id } }),
      this.prisma.stickerPack.update({
        where: { id: pack.id },
        data: { deleted_at: new Date(), install_count: 0 },
      }),
    ]);
  }

  /** POST /stickers/packs/:ref/stickers — my image with an emoji. */
  async add(
    userId: string,
    ref: string,
    fileId: string,
    emoji?: string,
  ): Promise<StickerDto> {
    const pack = await this.own(userId, ref);
    const max = await this.settings.number('stickers.max_per_pack');
    if (pack.sticker_count >= max) throw limit('per_pack', max);
    await this.files.assertAttachable(userId, fileId, ['sticker']);
    const used = await this.prisma.sticker.findUnique({
      where: { file_id: fileId },
      select: { id: true },
    });
    if (used) {
      throw new ConflictException({
        code: ErrorCode.FILE_NOT_ATTACHABLE,
        message: 'This image is already a sticker.',
      });
    }
    await this.limits.consume('sticker_add', userId);
    // Owner 2026-10-28 (legal safety, App Store 1.2): a new image of a user
    // is published only after the media scan (Rekognition + CSAM hash).
    const moderation = await this.initialModeration(fileId);
    const sticker = await this.prisma.$transaction(async (tx) => {
      const s = await tx.sticker.create({
        data: {
          pack_id: pack.id,
          file_id: fileId,
          emoji: (emoji ?? '').trim() || '🙂',
          position: pack.sticker_count,
          moderation_status: moderation,
        },
      });
      await tx.stickerPack.update({
        where: { id: pack.id },
        data: { sticker_count: { increment: 1 } },
      });
      return s;
    });
    if (moderation === 'pending') {
      // The upload already queued the check; this makes sure it exists.
      await this.mediaQueue?.enqueueFile(fileId, 'sticker');
    }
    return this.sticker(sticker, await this.urls([sticker]));
  }

  /** POST /stickers/packs/:ref/report - into the usual reports queue. */
  async report(
    userId: string,
    ref: string,
    dto: ReportStickerPackDto,
  ): Promise<void> {
    const pack = await this.find(ref, true);
    if (pack.owner_user_id === userId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'You cannot report your own pack.',
      });
    }
    await this.reports.create(userId, {
      targetType: 'sticker_pack',
      targetId: pack.id,
      reason: dto.reason,
      note: dto.note,
    });
  }

  /** DELETE /stickers/:id — a sticker from my pack. */
  async removeSticker(userId: string, id: string): Promise<void> {
    const s = await this.prisma.sticker.findUnique({
      where: { id },
      include: { pack: true },
    });
    if (!s || s.deleted_at || s.pack.owner_user_id !== userId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Sticker not found.',
      });
    }
    await this.prisma.$transaction([
      this.prisma.sticker.update({
        where: { id },
        data: { deleted_at: new Date() },
      }),
      this.prisma.stickerPack.update({
        where: { id: s.pack_id },
        data: { sticker_count: { decrement: 1 } },
      }),
    ]);
  }

  async install(userId: string, ref: string): Promise<StickerPackDto> {
    const pack = await this.find(ref);
    const has = await this.prisma.userStickerPack.findUnique({
      where: { user_id_pack_id: { user_id: userId, pack_id: pack.id } },
    });
    if (!has) {
      await this.assertInstallRoom(userId);
      // Owner 2026-10-20: a paid pack takes its stars (once — a pack added
      // before costs nothing again) in the same transaction as the install.
      await withTxRetry(this.prisma, async (tx) => {
        if (pack.owner_user_id !== userId) {
          await this.stars.chargeStickerPack(tx, userId, pack);
        }
        await tx.userStickerPack.create({
          data: { user_id: userId, pack_id: pack.id, position: -1 },
        });
        await tx.stickerPack.update({
          where: { id: pack.id },
          data: { install_count: { increment: 1 } },
        });
      });
    }
    return this.get(userId, pack.id);
  }

  async uninstall(userId: string, ref: string): Promise<void> {
    const pack = await this.find(ref, true);
    const { count } = await this.prisma.userStickerPack.deleteMany({
      where: { user_id: userId, pack_id: pack.id },
    });
    if (count > 0) {
      await this.prisma.stickerPack.update({
        where: { id: pack.id },
        data: { install_count: { decrement: 1 } },
      });
    }
  }

  /** PUT /stickers/order — my packs in the picker's order. */
  async reorder(userId: string, packIds: string[]): Promise<void> {
    await this.prisma.$transaction(
      packIds.map((pack_id, position) =>
        this.prisma.userStickerPack.updateMany({
          where: { user_id: userId, pack_id },
          data: { position },
        }),
      ),
    );
  }

  /** Chat: may [userId] send this sticker? Records it as recently used. */
  async useForMessage(userId: string, stickerId: string): Promise<Sticker> {
    const s = await this.prisma.sticker.findUnique({
      where: { id: stickerId },
      include: { pack: true },
    });
    if (
      !s ||
      s.deleted_at ||
      s.moderation_status !== 'active' ||
      s.pack.deleted_at ||
      s.pack.status !== 'active'
    ) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Sticker not found.',
      });
    }
    // Owner 2026-10-20: a paid pack is sent only once it is added (bought).
    if (s.pack.price_stars > 0 && s.pack.owner_user_id !== userId) {
      const has = await this.prisma.userStickerPack.findUnique({
        where: { user_id_pack_id: { user_id: userId, pack_id: s.pack_id } },
        select: { pack_id: true },
      });
      if (!has) {
        throw new ForbiddenException({
          code: ErrorCode.STICKER_PACK_NOT_OWNED,
          message: 'Add this sticker pack first.',
        });
      }
    }
    await this.prisma.userRecentSticker.upsert({
      where: { user_id_sticker_id: { user_id: userId, sticker_id: s.id } },
      create: { user_id: userId, sticker_id: s.id },
      update: { used_at: new Date() },
    });
    return s;
  }

  /** Chat bubbles: sticker id → DTO (deleted ones still render). */
  async forMessages(ids: string[]): Promise<Map<string, StickerDto>> {
    const out = new Map<string, StickerDto>();
    if (ids.length === 0) return out;
    const rows = await this.prisma.sticker.findMany({
      where: { id: { in: [...new Set(ids)] } },
    });
    const urls = await this.urls(rows);
    for (const r of rows) out.set(r.id, this.sticker(r, urls));
    return out;
  }

  // ── helpers ──────────────────────────────────────────────────────────

  /** Stickers [viewerId] sees: published ones, plus their own waiting
   * for the scan. A hidden (flagged / CSAM) one is never shown. */
  private visible(viewerId?: string): Prisma.StickerWhereInput {
    return {
      deleted_at: null,
      OR: [
        { moderation_status: 'active' },
        ...(viewerId
          ? [
              {
                moderation_status: 'pending',
                pack: { owner_user_id: viewerId },
              },
            ]
          : []),
      ],
    };
  }

  private withStickers(viewerId?: string) {
    return {
      stickers: {
        where: this.visible(viewerId),
        orderBy: { position: 'asc' as const },
      },
    };
  }

  /** The state a new user image starts in. */
  private async initialModeration(
    fileId: string,
  ): Promise<'pending' | 'active' | 'hidden'> {
    if (!(await this.settings.boolean('stickers.scan_uploads')))
      return 'active';
    // 3-state switch (off | on | auto): only `off` stops the paid scan.
    if (
      (await readSwitchMode(this.settings, 'moderation.image.enabled')) ===
      'off'
    )
      return 'active';
    const check = await this.prisma.mediaModerationCheck.findUnique({
      where: { file_id: fileId },
      select: { status: true, decision: true },
    });
    if (check?.decision === 'approved') return 'active';
    if (check?.decision === 'removed') return 'hidden';
    if (check?.status === 'clean' || check?.status === 'skipped')
      return 'active';
    if (check?.status === 'hidden' || check?.status === 'csam_match')
      return 'hidden';
    return 'pending';
  }

  private async find(
    ref: string,
    allowHidden = false,
    viewerId?: string,
  ): Promise<PackWithStickers> {
    const pack = await this.prisma.stickerPack.findFirst({
      where: {
        ...(UUID.test(ref) ? { id: ref } : { short_name: ref }),
        deleted_at: null,
        ...(allowHidden ? {} : { status: 'active' }),
      },
      include: this.withStickers(viewerId),
    });
    if (!pack) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Sticker pack not found.',
      });
    }
    return pack;
  }

  private async own(userId: string, ref: string): Promise<PackWithStickers> {
    const pack = await this.find(ref, true, userId);
    if (pack.owner_user_id !== userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the author changes this pack.',
      });
    }
    return pack;
  }

  private async assertInstallRoom(userId: string): Promise<void> {
    const max = await this.settings.number('stickers.max_installed');
    const n = await this.prisma.userStickerPack.count({
      where: { user_id: userId },
    });
    if (n >= max) throw limit('installed', max);
  }

  private async present(
    packs: PackWithStickers[],
    userId: string,
  ): Promise<StickerPackDto[]> {
    const installed = new Set(
      (
        await this.prisma.userStickerPack.findMany({
          where: { user_id: userId, pack_id: { in: packs.map((p) => p.id) } },
          select: { pack_id: true },
        })
      ).map((r) => r.pack_id),
    );
    const urls = await this.urls(packs.flatMap((p) => p.stickers));
    return packs.map((p) => this.pack(p, userId, installed.has(p.id), urls));
  }

  private urls(stickers: Sticker[]): Promise<Map<string, string>> {
    return this.files.stickerUrls([...new Set(stickers.map((s) => s.file_id))]);
  }

  private sticker(s: Sticker, urls: Map<string, string>): StickerDto {
    return {
      id: s.id,
      packId: s.pack_id,
      emoji: s.emoji,
      url: urls.get(s.file_id) ?? null,
    };
  }

  private pack(
    p: PackWithStickers,
    userId: string,
    installed: boolean,
    urls: Map<string, string>,
  ): StickerPackDto {
    return {
      id: p.id,
      title: p.title,
      shortName: p.short_name,
      isOfficial: p.is_official,
      isMine: p.owner_user_id === userId,
      installed,
      stickerCount: p.stickers.length,
      installCount: Math.max(0, p.install_count),
      priceStars: p.price_stars,
      stickers: p.stickers.map((s) => this.sticker(s, urls)),
    };
  }
}
