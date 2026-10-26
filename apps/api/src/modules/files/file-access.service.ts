import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { readSwitchMode } from '../../common/app-settings/switch-mode';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { syncedAt, type SyncPage } from '../../common/sync/sync.util';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { viewerContext } from '../../common/viewer/viewer-context';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
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
    @Optional() private readonly realtime?: RealtimePublisher,
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
      const mode = await readSwitchMode(
        this.settings,
        'files.access_log_enabled',
      );
      if (mode === 'off') return;
      // auto: a sample of views (files.access_log_sample_percent).
      if (mode === 'auto') {
        const pct = await this.settings.number(
          'files.access_log_sample_percent',
        );
        if (Math.random() * 100 >= pct) return;
      }
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
      // Owner 2026-10-24: an open view list of the owner updates without
      // polling - one tiny per-user event (no names, no address).
      for (const [owner, list] of groupByOwner(fresh)) {
        this.realtime?.toUsers([owner], 'file:viewed', {
          fileIds: list.map((f) => f.id),
        });
      }
    } catch (e) {
      this.logger.warn(
        { err: e instanceof Error ? e.message : 'unknown' },
        'file access journal write failed',
      );
    }
  }

  /**
   * GET /files/:id/views — only the file's owner may read it. Owner
   * 2026-10-24: newest first, keyset-paged (small pages), and `since` = only
   * the rows logged after that time, so the phone keeps the list on the
   * device and fetches only what is new. [avatarOf] signs a viewer avatar
   * link (the controller passes FilesService.mediaUrl; this service does not
   * depend on FilesService, which depends on it).
   */
  async viewsOf(
    ownerId: string,
    fileId: string,
    opts: {
      cursor?: string;
      limit?: number;
      since?: string;
      avatarOf?: (fileId: string | null) => Promise<string | null>;
    } = {},
  ): Promise<SyncPage<FileViewDto>> {
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
    const limit = Math.min(Math.max(opts.limit ?? VIEWS_PAGE, 1), 50);
    const since = opts.since ? new Date(opts.since) : undefined;
    if (since && Number.isNaN(since.getTime())) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'since must be an ISO 8601 date-time.',
        details: { field: 'since' },
      });
    }
    const c = opts.cursor ? decodeCursor(opts.cursor) : undefined;
    const rows = await this.prisma.fileAccessLog.findMany({
      where: {
        file_id: fileId,
        ...(since ? { created_at: { gt: since } } : {}),
        ...(c
          ? {
              OR: [
                { created_at: { lt: c.createdAt } },
                { created_at: c.createdAt, id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor =
      rows.length > limit && last
        ? encodeCursor({ createdAt: last.created_at, id: last.id })
        : null;
    const syncedAtIso = syncedAt(
      page.map((r) => r.created_at),
      since ?? new Date(0),
    );
    if (page.length === 0) {
      return { items: [], nextCursor: null, syncedAt: syncedAtIso };
    }
    const viewers = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(page.map((r) => r.viewer_user_id))] } },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        role: true,
        avatar_file_id: true,
      },
    });
    const people = new Map(viewers.map((v) => [v.id, v]));
    const sessions = await this.prisma.session.findMany({
      where: {
        session_chain_id: {
          in: page.flatMap((r) => (r.session_id ? [r.session_id] : [])),
        },
      },
      distinct: ['session_chain_id'],
      select: { session_chain_id: true, device_name: true, platform: true },
    });
    const devices = new Map(sessions.map((s) => [s.session_chain_id, s]));
    const avatars = new Map<string, string | null>();
    for (const v of viewers) {
      avatars.set(
        v.id,
        opts.avatarOf ? await opts.avatarOf(v.avatar_file_id) : null,
      );
    }
    return {
      items: page.map((r) => {
        const d = r.session_id ? devices.get(r.session_id) : undefined;
        const p = people.get(r.viewer_user_id);
        return {
          id: r.id,
          viewerUserId: r.viewer_user_id,
          viewerName:
            [p?.first_name, p?.last_name].filter(Boolean).join(' ') || null,
          viewerAvatarUrl: avatars.get(r.viewer_user_id) ?? null,
          viewerRole: p?.role ?? null,
          viewedAt: r.created_at.toISOString(),
          device: d?.device_name ?? null,
          platform: d?.platform ?? null,
          ip: maskIp(r.ip),
        };
      }),
      nextCursor,
      syncedAt: syncedAtIso,
    };
  }
}

/** Page size of GET /files/:id/views. */
export const VIEWS_PAGE = 20;

/**
 * The address as the owner may see it: the host part is hidden
 * (203.0.113.9 -> 203.0.113.x; 2001:db8:1:2::9 -> 2001:db8:1::x). Enough to
 * tell "the usual office" from "another country", not enough to locate or
 * identify a person; the full address stays in the journal for the abuse
 * and legal-hold paths only.
 */
export function maskIp(ip: string | null): string | null {
  if (!ip) return null;
  const v4 = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/.exec(ip);
  if (v4) return `${v4[1]}.x`;
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/i.exec(ip);
  if (mapped) return `${mapped[1]}.x`;
  if (ip.includes(':')) {
    const head = ip.split(':').slice(0, 3).filter(Boolean).join(':');
    return head ? `${head}::x` : null;
  }
  return null;
}

function groupByOwner(files: readonly ViewedFile[]): Map<string, ViewedFile[]> {
  const out = new Map<string, ViewedFile[]>();
  for (const f of files) {
    const list = out.get(f.owner_user_id) ?? [];
    list.push(f);
    out.set(f.owner_user_id, list);
  }
  return out;
}
