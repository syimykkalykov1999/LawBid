import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Sticker, type StickerPack } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { FileDto, PresignedFileDto } from '../files/dto/files.dto';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  AdminStickerDto,
  AdminStickerPackDto,
  AdminStickerPackRowDto,
  AdminStickerPacksQueryDto,
  AdminStickerUploadDto,
  CreateOfficialStickerPackDto,
} from './admin-media.dto';

const PAGE = 50;
type Page<T> = { items: T[]; nextCursor: string | null };
type Owner = { first_name: string | null; last_name: string | null } | null;
type PackRow = StickerPack & { owner: Owner };

export const STICKER_AUDIT = {
  hide: 'admin.sticker_pack.hide',
  unhide: 'admin.sticker_pack.unhide',
  create: 'admin.sticker_pack.create',
  addSticker: 'admin.sticker.add',
  removeSticker: 'admin.sticker.remove',
} as const;

/**
 * Audit 2026-10-02 — admin panel → Media → Stickers: every pack (official
 * and users'), hide / unhide (a hidden pack can't be installed or sent;
 * stickers already in chats stay — StickersService filters on
 * status = 'active'), and the official packs the app shows in "Featured"
 * (owner NULL, is_official). Sticker images go through the normal file
 * pipeline (presign → confirm → antivirus scan) owned by the admin's user
 * id; only a clean `sticker` file can be added (FilesService.assertAttachable,
 * the same check StickersService.add uses).
 */
@Injectable()
export class AdminStickersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly settings: AppSettingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditLogService,
  ) {}

  async list(
    q: AdminStickerPacksQueryDto,
  ): Promise<Page<AdminStickerPackRowDto>> {
    const c = q.cursor ? decodeCursor(q.cursor) : undefined;
    const and: Prisma.StickerPackWhereInput[] = [];
    if (q.kind) and.push({ is_official: q.kind === 'official' });
    if (q.status) and.push({ status: q.status });
    if (q.q) {
      and.push({
        OR: [
          { title: { contains: q.q, mode: 'insensitive' } },
          { short_name: { contains: q.q, mode: 'insensitive' } },
        ],
      });
    }
    if (c) {
      and.push({
        OR: [
          { created_at: { lt: c.createdAt } },
          { created_at: c.createdAt, id: { lt: c.id } },
        ],
      });
    }
    const rows = await this.prisma.stickerPack.findMany({
      where: { AND: and },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      include: { owner: { select: { first_name: true, last_name: true } } },
    });
    const slice = rows.slice(0, PAGE);
    const last = slice[slice.length - 1];
    return {
      items: slice.map(packRow),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async get(id: string): Promise<AdminStickerPackDto> {
    const pack = await this.prisma.stickerPack.findFirst({
      where: { id },
      include: {
        owner: { select: { first_name: true, last_name: true } },
        stickers: {
          where: { deleted_at: null },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!pack) throw packNotFound();
    const urls = await this.files.stickerUrls(
      pack.stickers.map((s) => s.file_id),
    );
    return {
      ...packRow(pack),
      stickers: pack.stickers.map((s) => stickerDto(s, urls)),
    };
  }

  /** hide → `hidden` (the user author is told why); unhide → `active`. */
  async setHidden(
    admin: AdminActor,
    id: string,
    hidden: boolean,
    reason: string,
  ): Promise<AdminStickerPackDto> {
    const pack = await this.prisma.stickerPack.findFirst({ where: { id } });
    if (!pack) throw packNotFound();
    const next = hidden ? 'hidden' : 'active';
    if (pack.status === next) {
      throw new ConflictException({
        code: ErrorCode.CONTENT_INVALID_STATE,
        message: `The pack is already ${next}.`,
        details: { status: pack.status },
      });
    }
    await withTxRetry(this.prisma, async (tx) => {
      const { count } = await tx.stickerPack.updateMany({
        where: { id, status: pack.status, deleted_at: null },
        data: { status: next },
      });
      if (count !== 1) throw packNotFound();
      await this.audit.record(
        {
          adminId: admin.id,
          action: hidden ? STICKER_AUDIT.hide : STICKER_AUDIT.unhide,
          targetType: 'sticker_pack',
          targetId: id,
          before: { status: pack.status },
          after: { status: next, reason },
          ip: admin.ip,
        },
        tx,
      );
    });
    if (hidden && pack.owner_user_id) {
      await this.notifications.emit({
        type: 'moderation_notice',
        recipientId: pack.owner_user_id,
        payload: { reason, stickerPackId: id },
      });
    }
    return this.get(id);
  }

  async createOfficial(
    admin: AdminActor,
    dto: CreateOfficialStickerPackDto,
  ): Promise<AdminStickerPackDto> {
    const shortName = dto.shortName ?? `o${randomBytes(6).toString('hex')}`;
    const taken = await this.prisma.stickerPack.findFirst({
      where: {
        short_name: { equals: shortName, mode: 'insensitive' },
        deleted_at: {},
      },
      select: { id: true },
    });
    if (taken) throw nameTaken(shortName);
    let pack: StickerPack;
    try {
      pack = await withTxRetry(this.prisma, async (tx) => {
        const p = await tx.stickerPack.create({
          data: {
            owner_user_id: null,
            title: dto.title,
            short_name: shortName,
            is_official: true,
          },
        });
        await this.audit.record(
          {
            adminId: admin.id,
            action: STICKER_AUDIT.create,
            targetType: 'sticker_pack',
            targetId: p.id,
            after: { title: dto.title, shortName },
            ip: admin.ip,
          },
          tx,
        );
        return p;
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw nameTaken(shortName);
      }
      throw e;
    }
    return this.get(pack.id);
  }

  /** A clean `sticker` file uploaded by this admin, into an official pack. */
  async addSticker(
    admin: AdminActor,
    packId: string,
    fileId: string,
    emoji?: string,
  ): Promise<AdminStickerPackDto> {
    const pack = await this.officialPack(packId);
    const max = await this.settings.number('stickers.max_per_pack');
    if (pack.sticker_count >= max) {
      throw new ConflictException({
        code: ErrorCode.STICKER_LIMIT_REACHED,
        message: 'Limit reached: per_pack.',
        details: { what: 'per_pack', max },
      });
    }
    await this.files.assertAttachable(admin.id, fileId, ['sticker']);
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
    await withTxRetry(this.prisma, async (tx) => {
      const s = await tx.sticker.create({
        data: {
          pack_id: pack.id,
          file_id: fileId,
          emoji: (emoji ?? '').trim() || '🙂',
          position: pack.sticker_count,
        },
      });
      await tx.stickerPack.update({
        where: { id: pack.id },
        data: { sticker_count: { increment: 1 } },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: STICKER_AUDIT.addSticker,
          targetType: 'sticker_pack',
          targetId: pack.id,
          after: { stickerId: s.id, fileId, emoji: s.emoji },
          ip: admin.ip,
        },
        tx,
      );
    });
    return this.get(pack.id);
  }

  /** Soft delete; stickers already sent keep rendering in chats. */
  async removeSticker(
    admin: AdminActor,
    packId: string,
    stickerId: string,
  ): Promise<AdminStickerPackDto> {
    const pack = await this.officialPack(packId);
    const s = await this.prisma.sticker.findFirst({
      where: { id: stickerId, pack_id: pack.id, deleted_at: null },
    });
    if (!s) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Sticker not found.',
      });
    }
    await withTxRetry(this.prisma, async (tx) => {
      await tx.sticker.update({
        where: { id: s.id },
        data: { deleted_at: new Date() },
      });
      await tx.stickerPack.update({
        where: { id: pack.id },
        data: { sticker_count: { decrement: 1 } },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: STICKER_AUDIT.removeSticker,
          targetType: 'sticker_pack',
          targetId: pack.id,
          before: { stickerId: s.id, fileId: s.file_id },
          ip: admin.ip,
        },
        tx,
      );
    });
    return this.get(pack.id);
  }

  /** Step 1 of an image upload: a presigned POST (purpose `sticker`). */
  presignUpload(
    admin: AdminActor,
    dto: AdminStickerUploadDto,
  ): Promise<PresignedFileDto> {
    return this.files.presign(admin.id, { purpose: 'sticker', ...dto });
  }

  /** Step 2: size / SHA-256 / type checks, then the antivirus scan. */
  confirmUpload(admin: AdminActor, fileId: string): Promise<FileDto> {
    return this.files.confirm(admin.id, fileId);
  }

  private async officialPack(id: string): Promise<StickerPack> {
    const pack = await this.prisma.stickerPack.findFirst({ where: { id } });
    if (!pack) throw packNotFound();
    if (!pack.is_official) {
      throw new ConflictException({
        code: ErrorCode.CONTENT_INVALID_STATE,
        message:
          "Only official packs are edited here; a user's pack can be hidden.",
        details: { isOfficial: 'false' },
      });
    }
    return pack;
  }
}

function packRow(p: PackRow): AdminStickerPackRowDto {
  const ownerName = p.owner
    ? [p.owner.first_name, p.owner.last_name].filter(Boolean).join(' ') || '—'
    : null;
  return {
    id: p.id,
    title: p.title,
    shortName: p.short_name,
    isOfficial: p.is_official,
    status: p.status,
    ownerId: p.owner_user_id,
    ownerName,
    stickerCount: Math.max(0, p.sticker_count),
    installCount: Math.max(0, p.install_count),
    createdAt: p.created_at.toISOString(),
  };
}

function stickerDto(s: Sticker, urls: Map<string, string>): AdminStickerDto {
  return {
    id: s.id,
    fileId: s.file_id,
    emoji: s.emoji,
    position: s.position,
    url: urls.get(s.file_id) ?? null,
  };
}

function packNotFound() {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Sticker pack not found.',
  });
}

function nameTaken(shortName: string) {
  return new ConflictException({
    code: ErrorCode.STICKER_PACK_NAME_TAKEN,
    message: 'A sticker pack with this short name exists.',
    details: { shortName },
  });
}
