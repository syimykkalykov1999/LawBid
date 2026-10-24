import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { viewerContext } from '../../common/viewer/viewer-context';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { FileViewDto } from './dto/files.dto';

/** One viewer sees one file once per this many seconds in the journal. */
export const FILE_VIEW_DEDUPE_SEC = 600;
/** Purposes whose links are handed out through the confidential-file
 * paths (case documents, tasks, chat and support attachments). */
export const CONFIDENTIAL_PURPOSES: ReadonlySet<string> = new Set([
  'case_photo',
  'case_attachment',
  'task_attachment',
  'chat_attachment',
  'support_attachment',
]);

export interface ViewedFile {
  id: string;
  owner_user_id: string;
  purpose: string;
}

/**
 * Security & legal pass 2026-10-24 (ABA Formal Opinion 477R: know who
 * touched a confidential document). Every link to a confidential file
 * minted for somebody other than the file's owner leaves a journal row —
 * who, which device (session chain), from which address, when. The owner
 * reads it with GET /files/:id/views. Recording is best effort and never
 * slows or fails the request that opens the file; no file names or text
 * are stored.
 */
@Injectable()
export class FileAccessService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly settings: AppSettingsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FileAccessService.name);
  }

  /** Fire-and-forget safe: never throws. */
  async recordViews(files: readonly ViewedFile[]): Promise<void> {
    try {
      const viewer = viewerContext.viewerId();
      if (!viewer) return; // jobs, sockets, admin: audited elsewhere
      const others = files.filter(
        (f) =>
          f.owner_user_id !== viewer && CONFIDENTIAL_PURPOSES.has(f.purpose),
      );
      if (others.length === 0) return;
      if (!(await this.settings.boolean('files.access_log_enabled'))) return;
      const fresh: ViewedFile[] = [];
      for (const f of others) {
        const ok = await this.redis.set(
          `fal:${viewer}:${f.id}`,
          '1',
          'EX',
          FILE_VIEW_DEDUPE_SEC,
          'NX',
        );
        if (ok === 'OK') fresh.push(f);
      }
      if (fresh.length === 0) return;
      const { sessionId, ip } = viewerContext.viewerDevice();
      await this.prisma.fileAccessLog.createMany({
        data: fresh.map((f) => ({
          file_id: f.id,
          owner_user_id: f.owner_user_id,
          viewer_user_id: viewer,
          purpose: f.purpose,
          session_id: sessionId,
          ip,
        })),
      });
    } catch (e) {
      this.logger.warn(
        { err: e instanceof Error ? e.message : 'unknown' },
        'file access journal write failed',
      );
    }
  }

  /** GET /files/:id/views — only the file's owner may read it. */
  async viewsOf(
    ownerId: string,
    fileId: string,
    limit = 50,
  ): Promise<FileViewDto[]> {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      select: { owner_user_id: true },
    });
    if (!file || file.owner_user_id !== ownerId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'File not found.',
      });
    }
    const rows = await this.prisma.fileAccessLog.findMany({
      where: { file_id: fileId },
      orderBy: { created_at: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    if (rows.length === 0) return [];
    const viewers = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.viewer_user_id))] } },
      select: { id: true, first_name: true, last_name: true },
    });
    const names = new Map(
      viewers.map((v) => [
        v.id,
        [v.first_name, v.last_name].filter(Boolean).join(' ') || null,
      ]),
    );
    const sessions = await this.prisma.session.findMany({
      where: {
        session_chain_id: {
          in: rows.flatMap((r) => (r.session_id ? [r.session_id] : [])),
        },
      },
      distinct: ['session_chain_id'],
      select: { session_chain_id: true, device_name: true, platform: true },
    });
    const devices = new Map(sessions.map((s) => [s.session_chain_id, s]));
    return rows.map((r) => {
      const d = r.session_id ? devices.get(r.session_id) : undefined;
      return {
        viewerUserId: r.viewer_user_id,
        viewerName: names.get(r.viewer_user_id) ?? null,
        viewedAt: r.created_at.toISOString(),
        device: d?.device_name ?? null,
        platform: d?.platform ?? null,
        ip: r.ip,
      };
    });
  }
}
