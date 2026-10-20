import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma, SupportMessageFile } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { assertUploadCount } from '../files/upload-limits';
import type {
  SupportAttachmentDto,
  SupportAttachmentInputDto,
} from './support.dto';

type Tx = Prisma.TransactionClient;

/** Name the sender gave → a safe display / download name. */
export function cleanAttachmentName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const n = name.replace(/[\u0000-\u001f\u007f/\\]/g, '_').trim();
  return n.slice(0, 200) || 'file';
}

/**
 * Owner 2026-10-18 (OQ-055): files on support messages, both directions.
 * A file is the sender's own clean `support_attachment`, fits the admin's
 * `support` place (formats, MB per file, how many per message) and sits on
 * one message only. Links are signed here and only for callers who already
 * passed the ticket's access check (the ticket's user, support staff).
 */
@Injectable()
export class SupportFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  /** Before the transaction: every file is the sender's, clean, fits the
   * place and is not on a message yet. */
  async assertAttachable(
    senderId: string,
    attachments: readonly SupportAttachmentInputDto[] | undefined,
  ): Promise<void> {
    const list = attachments ?? [];
    if (list.length === 0) return;
    const ids = list.map((a) => a.fileId);
    if (new Set(ids).size !== ids.length) {
      throw this.notAttachable('The same file twice.');
    }
    assertUploadCount(
      await this.files.uploadLimits(),
      'support',
      'files',
      list.length,
    );
    for (const a of list) {
      const file = await this.files.assertAttachable(senderId, a.fileId, [
        'support_attachment',
      ]);
      await this.files.assertFitsPlace('support', file);
    }
    const used = await this.prisma.supportMessageFile.findFirst({
      where: { file_id: { in: ids } },
      select: { id: true },
    });
    if (used) throw this.notAttachable('This file was already sent.');
  }

  /** In the message's transaction. */
  async attach(
    tx: Tx,
    messageId: string,
    attachments: readonly SupportAttachmentInputDto[] | undefined,
  ): Promise<void> {
    const list = attachments ?? [];
    if (list.length === 0) return;
    await tx.supportMessageFile.createMany({
      data: list.map((a, position) => ({
        message_id: messageId,
        file_id: a.fileId,
        name: cleanAttachmentName(a.name),
        position,
      })),
    });
  }

  /** message id → its attachments with short signed links. */
  async forMessages(
    messageIds: string[],
  ): Promise<Map<string, SupportAttachmentDto[]>> {
    const out = new Map<string, SupportAttachmentDto[]>();
    if (messageIds.length === 0) return out;
    const rows = await this.prisma.supportMessageFile.findMany({
      where: { message_id: { in: messageIds } },
      orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
    });
    return this.present(rows, out);
  }

  private async present(
    rows: SupportMessageFile[],
    out: Map<string, SupportAttachmentDto[]>,
  ): Promise<Map<string, SupportAttachmentDto[]>> {
    if (rows.length === 0) return out;
    const links = await this.files.supportAttachmentUrls(
      rows.map((r) => ({ fileId: r.file_id, name: r.name })),
    );
    const meta = await this.prisma.file.findMany({
      where: { id: { in: rows.map((r) => r.file_id) } },
      select: {
        id: true,
        mime: true,
        size_bytes: true,
        width: true,
        height: true,
      },
    });
    const byId = new Map(meta.map((f) => [f.id, f]));
    for (const r of rows) {
      const f = byId.get(r.file_id);
      const link = links.get(r.file_id);
      const mime = f?.mime ?? 'application/octet-stream';
      const list = out.get(r.message_id) ?? [];
      list.push({
        id: r.file_id,
        name: r.name,
        mime,
        sizeBytes: Number(f?.size_bytes ?? 0),
        isImage: mime.startsWith('image/'),
        isVideo: mime.startsWith('video/'),
        url: link?.url ?? null,
        previewUrl: link?.previewUrl ?? null,
        width: f?.width ?? null,
        height: f?.height ?? null,
      });
      out.set(r.message_id, list);
    }
    return out;
  }

  private notAttachable(message: string): ConflictException {
    return new ConflictException({
      code: ErrorCode.FILE_NOT_ATTACHABLE,
      message,
    });
  }
}
