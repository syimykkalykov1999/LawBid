import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';
import { MAX_INPUT_PIXELS } from '../files/files.policy';
import { detectMime } from '../files/magic-bytes';
import { S3StorageService } from '../files/files.public';
import type { AiImage } from '../staff-ai/staff-ai-client.service';
import {
  AI_IMAGE_LONG_EDGE,
  AI_IMAGES_PER_SET,
  AiAttachmentError,
  cleanIds,
  isAiImageMime,
  type AiAttachmentKind,
  type AiImageMime,
} from './ai-attachments.logic';

/** Signed preview links for the owner's page (private bucket). */
const PREVIEW_TTL_SEC = 600;

export interface AiAttachmentView {
  id: string;
  mime: string;
  /** Short signed link for the owner's own page; never sent to GitHub. */
  previewUrl: string | null;
  ready: boolean;
}

export interface PreparedImage extends AiImage {
  id: string;
}

/**
 * Owner 2026-11-12 (row 48): the owner's images for the two AIs. Uploads
 * go through the files pipeline (presign → S3 → confirm → antivirus → the
 * scan job re-encodes the picture, so no EXIF / GPS is stored); here they
 * are linked to a task / role / note and read back for the AI, at most
 * 1568 px on the long edge (sharp, the library the files pipeline uses).
 */
@Injectable()
export class AiAttachmentsService {
  private readonly log = new Logger('AiAttachments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
  ) {}

  /**
   * [fileIds] must be the owner's own `ai_attachment` uploads, not deleted,
   * not refused by the scan. Returns them in order.
   */
  private async usable(ownerId: string, fileIds: string[]): Promise<string[]> {
    const ids = cleanIds(fileIds);
    if (ids.length === 0) return ids;
    const files = await this.prisma.file.findMany({
      where: {
        id: { in: ids },
        owner_user_id: ownerId,
        purpose: 'ai_attachment',
        deleted_at: null,
        scan_status: { in: ['pending', 'clean'] },
      },
      select: { id: true },
    });
    const ok = new Set(files.map((f) => f.id.toLowerCase()));
    if (ids.some((id) => !ok.has(id))) {
      throw new AiAttachmentError(
        'Картинка не найдена или не прошла проверку: загрузите её ещё раз.',
      );
    }
    return ids;
  }

  private async insert(
    ownerId: string,
    kind: AiAttachmentKind,
    fileIds: string[],
    target: { issueNumber?: number; roleId?: string; runItemId?: string },
  ): Promise<string[]> {
    const rows = fileIds.map((fileId, position) => ({
      file_id: fileId,
      owner_id: ownerId,
      kind,
      position,
      issue_number: target.issueNumber ?? null,
      role_id: target.roleId ?? null,
      run_item_id: target.runItemId ?? null,
    }));
    if (rows.length === 0) return [];
    const created = await this.prisma.aiAttachment.createManyAndReturn({
      data: rows,
      select: { id: true },
    });
    return created.map((r) => r.id);
  }

  // ------------------------------------------------------------ technician

  /**
   * Before the issue exists: rows without an issue number (the ids go into
   * the issue body). [bindTask] gives them the number; a failed issue
   * leaves them closed, so the cleanup takes them.
   */
  async prepareTask(ownerId: string, fileIds: string[]): Promise<string[]> {
    const ids = await this.usable(ownerId, fileIds);
    return this.insert(ownerId, 'task', ids, {});
  }

  async bindTask(attachmentIds: string[], issueNumber: number): Promise<void> {
    if (attachmentIds.length === 0) return;
    await this.prisma.aiAttachment.updateMany({
      where: { id: { in: attachmentIds }, kind: 'task' },
      data: { issue_number: issueNumber },
    });
  }

  /** Closes the images of [issueNumbers] (issue closed, PR merged / rejected). */
  async closeTasks(issueNumbers: number[], now = new Date()): Promise<number> {
    if (issueNumbers.length === 0) return 0;
    const r = await this.prisma.aiAttachment.updateMany({
      where: {
        kind: 'task',
        issue_number: { in: issueNumbers },
        closed_at: null,
      },
      data: { closed_at: now },
    });
    return r.count;
  }

  async close(attachmentIds: string[], now = new Date()): Promise<void> {
    if (attachmentIds.length === 0) return;
    await this.prisma.aiAttachment.updateMany({
      where: { id: { in: attachmentIds }, closed_at: null },
      data: { closed_at: now },
    });
  }

  /**
   * What the workflow may fetch for issue [issueNumber]: only rows of that
   * issue among [ids] (the ids its body lists), still open. `pending` counts
   * pictures the antivirus has not finished yet (the workflow retries).
   */
  async taskImages(
    issueNumber: number,
    ids: string[],
  ): Promise<{ images: PreparedImage[]; pending: number }> {
    const clean = cleanIds(ids);
    if (clean.length === 0) return { images: [], pending: 0 };
    const rows = await this.prisma.aiAttachment.findMany({
      where: {
        id: { in: clean },
        kind: 'task',
        issue_number: issueNumber,
        closed_at: null,
      },
      orderBy: { position: 'asc' },
      select: { id: true, file_id: true },
    });
    return this.prepare(rows);
  }

  // ----------------------------------------------------------- AI employee

  /** The role's pictures become exactly [fileIds]; the removed ones close. */
  async setRole(
    ownerId: string,
    roleId: string,
    fileIds: string[],
    now = new Date(),
  ): Promise<void> {
    const ids = await this.usable(ownerId, fileIds);
    const open = await this.prisma.aiAttachment.findMany({
      where: { kind: 'role', role_id: roleId, closed_at: null },
      select: { id: true, file_id: true },
    });
    const keep = new Set(ids);
    const gone = open.filter((o) => !keep.has(o.file_id.toLowerCase()));
    await this.close(
      gone.map((g) => g.id),
      now,
    );
    const have = new Set(open.map((o) => o.file_id.toLowerCase()));
    await this.insert(
      ownerId,
      'role',
      ids.filter((id) => !have.has(id)),
      { roleId },
    );
    // Keep the owner's order.
    for (const [position, fileId] of ids.entries()) {
      await this.prisma.aiAttachment.updateMany({
        where: {
          kind: 'role',
          role_id: roleId,
          file_id: fileId,
          closed_at: null,
        },
        data: { position },
      });
    }
  }

  /** An archived role's pictures close (its rows stay, the images go). */
  async closeRole(roleId: string, now = new Date()): Promise<void> {
    await this.prisma.aiAttachment.updateMany({
      where: { kind: 'role', role_id: roleId, closed_at: null },
      data: { closed_at: now },
    });
  }

  /** The owner's correction pictures on the items he rejected. */
  async addNotes(
    ownerId: string,
    runItemIds: string[],
    fileIds: string[],
  ): Promise<void> {
    const ids = await this.usable(ownerId, fileIds);
    if (ids.length === 0) return;
    for (const runItemId of runItemIds) {
      await this.insert(ownerId, 'note', ids, { runItemId });
    }
  }

  /** The role's open pictures for the AI (in the owner's order). */
  async roleImages(roleId: string): Promise<PreparedImage[]> {
    const rows = await this.prisma.aiAttachment.findMany({
      where: { kind: 'role', role_id: roleId, closed_at: null },
      orderBy: { position: 'asc' },
      take: AI_IMAGES_PER_SET,
      select: { id: true, file_id: true },
    });
    return (await this.prepare(rows)).images;
  }

  /** Correction pictures per run item (feedback examples), at most [max]. */
  async noteImages(
    runItemIds: string[],
    max: number,
  ): Promise<Map<string, PreparedImage[]>> {
    const out = new Map<string, PreparedImage[]>();
    if (runItemIds.length === 0 || max <= 0) return out;
    const rows = await this.prisma.aiAttachment.findMany({
      where: { kind: 'note', run_item_id: { in: runItemIds }, closed_at: null },
      orderBy: [{ created_at: 'desc' }, { position: 'asc' }],
      take: max,
      select: { id: true, file_id: true, run_item_id: true },
    });
    const { images } = await this.prepare(rows);
    const byId = new Map(images.map((i) => [i.id, i]));
    for (const r of rows) {
      const img = byId.get(r.id);
      if (!img || !r.run_item_id) continue;
      out.set(r.run_item_id, [...(out.get(r.run_item_id) ?? []), img]);
    }
    return out;
  }

  /** The owner's page: the pictures of roles / items, with short previews. */
  async views(where: {
    roleIds?: string[];
    runItemIds?: string[];
  }): Promise<Map<string, AiAttachmentView[]>> {
    const out = new Map<string, AiAttachmentView[]>();
    const or = [
      ...(where.roleIds?.length
        ? [{ kind: 'role', role_id: { in: where.roleIds } }]
        : []),
      ...(where.runItemIds?.length
        ? [{ kind: 'note', run_item_id: { in: where.runItemIds } }]
        : []),
    ];
    if (or.length === 0) return out;
    const rows = await this.prisma.aiAttachment.findMany({
      where: { closed_at: null, OR: or },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        role_id: true,
        run_item_id: true,
        file: {
          select: {
            mime: true,
            s3_bucket: true,
            s3_key: true,
            scan_status: true,
            deleted_at: true,
          },
        },
      },
    });
    for (const r of rows) {
      const key = r.role_id ?? r.run_item_id;
      if (!key || r.file.deleted_at) continue;
      const ready = r.file.scan_status === 'clean';
      let previewUrl: string | null = null;
      if (ready && this.storage.configured) {
        previewUrl = await this.storage
          .signedGetUrl(r.file.s3_bucket, r.file.s3_key, PREVIEW_TTL_SEC)
          .catch(() => null);
      }
      out.set(key, [
        ...(out.get(key) ?? []),
        { id: r.id, mime: r.file.mime, previewUrl, ready },
      ]);
    }
    return out;
  }

  // -------------------------------------------------------------- pictures

  /**
   * Reads each clean file and makes the picture the AI gets: real type from
   * the bytes (never the declared one), long edge ≤ 1568 px, no metadata
   * (sharp writes none unless asked), the same format (a GIF becomes a PNG
   * of its first frame). A file still being checked counts as pending.
   */
  private async prepare(
    rows: { id: string; file_id: string }[],
  ): Promise<{ images: PreparedImage[]; pending: number }> {
    if (rows.length === 0) return { images: [], pending: 0 };
    const files = await this.prisma.file.findMany({
      where: { id: { in: rows.map((r) => r.file_id) }, deleted_at: null },
      select: {
        id: true,
        s3_bucket: true,
        s3_key: true,
        scan_status: true,
        mime: true,
      },
    });
    const byId = new Map(files.map((f) => [f.id, f]));
    const images: PreparedImage[] = [];
    let pending = 0;
    for (const r of rows) {
      const f = byId.get(r.file_id);
      if (!f) continue;
      if (f.scan_status === 'pending') {
        pending++;
        continue;
      }
      if (f.scan_status !== 'clean') continue;
      try {
        const raw = await this.storage.read(f.s3_bucket, f.s3_key);
        const img = await downscaleForAi(raw);
        if (img) images.push({ id: r.id, ...img });
      } catch (e) {
        this.log.warn(
          `ai image ${r.id} not readable: ${(e as Error).message.slice(0, 120)}`,
        );
      }
    }
    return { images, pending };
  }
}

/**
 * The picture as the AI gets it (pure, exported for the tests): null when
 * the bytes are none of JPEG / PNG / GIF / WebP.
 */
export async function downscaleForAi(
  raw: Buffer,
): Promise<{ mediaType: AiImageMime; data: string } | null> {
  const mime = detectMime(raw);
  if (!mime || !isAiImageMime(mime)) return null;
  const pipe = sharp(raw, {
    failOn: 'error',
    limitInputPixels: MAX_INPUT_PIXELS,
  })
    .rotate()
    .resize(AI_IMAGE_LONG_EDGE, AI_IMAGE_LONG_EDGE, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  const out: { buf: Buffer; mediaType: AiImageMime } =
    mime === 'image/jpeg'
      ? {
          buf: await pipe.jpeg({ quality: 88, mozjpeg: true }).toBuffer(),
          mediaType: 'image/jpeg',
        }
      : mime === 'image/webp'
        ? {
            buf: await pipe.webp({ quality: 88 }).toBuffer(),
            mediaType: 'image/webp',
          }
        : { buf: await pipe.png().toBuffer(), mediaType: 'image/png' };
  return { mediaType: out.mediaType, data: out.buf.toString('base64') };
}
