import { createHash } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import type { Archiver } from 'archiver';
import type { Readable } from 'node:stream';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { MessageBodyCipher } from '../../common/secrets/message-body-cipher';
import { PrismaService } from '../../prisma/prisma.service';
import { withDeleted } from '../../prisma/soft-delete.extension';
import { S3StorageService } from '../files/storage/s3-storage.service';
import type { LegalSection } from './legal-export.dto';
import { renderLegalReportPdf } from './legal-export.pdf';
import {
  HashThrough,
  appendAndWait,
  createZipExport,
  jsonArrayStream,
  jsonValueStream,
} from '../../common/streaming/export-stream';

const DAY_MS = 24 * 3600 * 1000;
/** One evidence archive never exceeds this (the rows are capped too). */
const LEGAL_EXPORT_MAX_BYTES = 1024 * 1024 * 1024;
/** A `running` row older than this is a dead worker: the next tick retries. */
const STALE_RUNNING_MIN = 30;

export interface LegalSelection {
  sections: LegalSection[];
  conversationIds?: string[];
  groupIds?: string[];
  dateFrom?: string;
  dateTo?: string;
}

type Row = Record<string, unknown>;

/**
 * Owner 2026-10-20: builds the evidence archive for a government request.
 * Runs on the worker's `cron` queue — one archive per tick and never two at
 * once — and reads with a hard row cap per section, so a huge account is cut
 * (and says so in the manifest) instead of loading the database. Media are
 * listed as signed links (`legal.export_link_days`), never copied.
 */
@Injectable()
export class LegalExportBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
    private readonly settings: AppSettingsService,
    private readonly logger: PinoLogger,
    @Optional() private readonly cipher?: MessageBodyCipher,
  ) {
    this.logger.setContext(LegalExportBuilder.name);
  }

  /** The cron entry: one archive, then the expired files. */
  async run(
    now: Date = new Date(),
  ): Promise<{ built: string | null; expired: number }> {
    const id = await this.claim();
    if (id) await this.build(id, now);
    return { built: id, expired: await this.expire(now) };
  }

  /** Takes the oldest queued row unless another archive is in progress. */
  async claim(): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE legal_exports SET status = 'running', started_at = now()
      WHERE id = (
        SELECT id FROM legal_exports
        WHERE (status = 'queued'
               OR (status = 'running'
                   AND started_at < now() - make_interval(mins => ${STALE_RUNNING_MIN}::INT)))
          AND NOT EXISTS (
            SELECT 1 FROM legal_exports r
            WHERE r.status = 'running'
              AND r.started_at >= now() - make_interval(mins => ${STALE_RUNNING_MIN}::INT))
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED)
      RETURNING id`;
    return rows[0]?.id ?? null;
  }

  async build(id: string, now: Date = new Date()): Promise<void> {
    const job = await this.prisma.legalExport.findUnique({
      where: { id },
      include: { request: true },
    });
    if (!job) return;
    try {
      const selection = job.selection as unknown as LegalSelection;
      const maxRows = await this.settings.number('legal.export_max_rows');
      const linkDays = await this.settings.number('legal.export_link_days');
      const ttlDays = await this.settings.number('legal.export_ttl_days');
      const gathered = await this.gather(
        job.subject_user_id,
        selection,
        maxRows,
      );
      const media = await this.mediaLinks(gathered.fileIds, linkDays, now);

      const counts: Record<string, number> = {};
      for (const [k, v] of Object.entries(gathered.data)) {
        counts[k] = Array.isArray(v) ? v.length : 1;
      }
      const subject = gathered.subject;
      const pdf = await renderLegalReportPdf({
        referenceNumber: job.request.reference_number,
        agency: job.request.agency,
        requestType: job.request.request_type,
        scope: job.request.scope,
        exportId: job.id,
        requestedBy: job.requested_by,
        generatedAt: now,
        subject,
        period: `${selection.dateFrom ?? 'beginning'} — ${selection.dateTo ?? 'now'}`,
        counts,
        truncated: gathered.truncated,
        sections: gathered.readable,
      });

      // WP-G 2026-10-25: the archive is STREAMED. Every data file is
      // serialized row by row, hashed on the way, written into the ZIP and
      // uploaded as S3 multipart; SHA256SUMS.txt and manifest.json come
      // last (they need the hashes of the files before them).
      const hashes: Record<string, string> = {};
      const addStream = async (
        archive: Archiver,
        name: string,
        source: Readable,
      ) => {
        const h = new HashThrough();
        source.on('error', (err) => h.destroy(err));
        await appendAndWait(archive, source.pipe(h), name);
        hashes[name] = h.digest();
      };
      const addBuffer = async (archive: Archiver, name: string, b: Buffer) => {
        hashes[name] = sha256(b);
        await appendAndWait(archive, b, name);
      };
      const zip = createZipExport(
        async (archive) => {
          for (const [name, rows] of Object.entries(gathered.data)) {
            await addStream(
              archive,
              `data/${name}.json`,
              Array.isArray(rows)
                ? jsonArrayStream(rows)
                : jsonValueStream(rows),
            );
          }
          await addStream(archive, 'media.json', jsonArrayStream(media));
          await addBuffer(archive, 'report.pdf', pdf);
          const sums = Object.entries(hashes)
            .map(([n, h]) => `${h}  ${n}`)
            .sort()
            .join('\n');
          await addBuffer(archive, 'SHA256SUMS.txt', Buffer.from(`${sums}\n`));
          await addBuffer(
            archive,
            'manifest.json',
            Buffer.from(
              JSON.stringify(
                {
                  exportId: job.id,
                  requestId: job.request_id,
                  referenceNumber: job.request.reference_number,
                  generatedAt: now.toISOString(),
                  selection,
                  counts,
                  truncatedAtRows: gathered.truncated.length ? maxRows : null,
                  truncated: gathered.truncated,
                  hashes: { ...hashes },
                },
                replacer,
                2,
              ),
            ),
          );
        },
        { maxBytes: LEGAL_EXPORT_MAX_BYTES },
      );
      const bucket = this.storage.bucket('documents');
      const key = `legal-exports/${job.id}.zip`;
      await this.storage.putStream(bucket, key, zip.body, 'application/zip');
      const size = zip.body.bytes;
      const digest = zip.body.digest();
      await this.prisma.$transaction([
        this.prisma.legalExport.update({
          where: { id },
          data: {
            status: 'ready',
            file_bucket: bucket,
            file_key: key,
            size_bytes: BigInt(size),
            sha256: digest,
            row_counts: counts,
            error: null,
            finished_at: new Date(),
            expires_at: new Date(now.getTime() + ttlDays * DAY_MS),
          },
        }),
        this.prisma.dataAccessLog.createMany({
          data: gathered.accessed.map((a) => ({
            request_id: job.request_id,
            admin_id: job.requested_by,
            entity_type: a.type,
            entity_id: a.id,
            accessed_at: now,
          })),
        }),
        this.prisma.auditLog.create({
          data: {
            admin_id: job.requested_by,
            action: 'legal_export.built',
            target_type: 'legal_export',
            target_id: job.id,
            after: { sha256: digest, bytes: size, counts },
          },
        }),
      ]);
    } catch (e) {
      this.logger.error({ err: e, id }, 'legal export failed');
      await this.prisma.legalExport.update({
        where: { id },
        data: {
          status: 'failed',
          error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
          finished_at: new Date(),
        },
      });
    }
  }

  /** Files past `expires_at` are removed; the row and its hash stay. */
  async expire(now: Date): Promise<number> {
    const due = await this.prisma.legalExport.findMany({
      where: { status: 'ready', expires_at: { lt: now } },
      take: 100,
    });
    for (const row of due) {
      if (row.file_bucket && row.file_key) {
        await this.storage.remove(row.file_bucket, [row.file_key]);
      }
      await this.prisma.legalExport.update({
        where: { id: row.id },
        data: { status: 'expired', file_bucket: null, file_key: null },
      });
    }
    return due.length;
  }

  private open(v: string, messageId: string): string {
    return this.cipher?.open(v, messageId) ?? v;
  }

  private async gather(userId: string, sel: LegalSelection, cap: number) {
    const has = (s: LegalSection) => sel.sections.includes(s);
    const range = {
      ...(sel.dateFrom ? { gte: new Date(sel.dateFrom) } : {}),
      ...(sel.dateTo ? { lte: new Date(sel.dateTo) } : {}),
    };
    const created = Object.keys(range).length ? { created_at: range } : {};
    const data: Record<string, unknown> = {};
    const readable: { title: string; lines: string[] }[] = [];
    const truncated: string[] = [];
    const accessed: { type: string; id: string }[] = [
      { type: 'user', id: userId },
    ];
    const fileIds = new Set<string>();
    const cut = (name: string, rows: unknown[]) => {
      if (rows.length > cap) {
        truncated.push(name);
        rows.length = cap;
      }
    };

    const user = await this.prisma.user.findUniqueOrThrow({
      where: withDeleted({ id: userId }),
    });
    const subject = {
      id: user.id,
      name: [user.first_name, user.last_name].filter(Boolean).join(' ') || null,
      phone: user.phone_e164,
      email: user.email,
    };
    const nameOf = new Map<string, string>();
    const who = async (ids: (string | null)[]) => {
      const need = [...new Set(ids.filter((x): x is string => !!x))].filter(
        (x) => !nameOf.has(x),
      );
      if (!need.length) return;
      const us = await this.prisma.user.findMany({
        where: withDeleted({ id: { in: need } }),
        select: { id: true, first_name: true, last_name: true },
      });
      for (const u of us) {
        nameOf.set(u.id, [u.first_name, u.last_name].filter(Boolean).join(' '));
      }
    };
    const label = (id: string | null) =>
      id ? `${nameOf.get(id) ?? '?'} (${id.slice(0, 8)})` : 'system';
    const stamp = (d: Date | null | undefined) => (d ? d.toISOString() : '');

    if (has('profile')) {
      data.profile = [
        {
          id: user.id,
          role: user.role,
          status: user.status,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone_e164,
          phoneVerifiedAt: user.phone_verified_at,
          email: user.email,
          emailVerifiedAt: user.email_verified_at,
          language: user.ui_language,
          timezone: user.timezone,
          registeredAt: user.created_at,
          lastActiveAt: user.last_active_at,
          deletionRequestedAt: user.deletion_requested_at,
          deletedAt: user.deleted_at,
        },
      ];
      readable.push({
        title: 'Profile',
        lines: [
          `${subject.name ?? ''} · ${user.role ?? ''} · ${user.status}`,
          `Phone: ${user.phone_e164 ?? ''}  E-mail: ${user.email ?? ''}`,
          `Registered: ${stamp(user.created_at)}  Last active: ${stamp(user.last_active_at)}`,
        ],
      });
    }
    if (has('devices')) {
      const sessions = await this.prisma.session.findMany({
        where: { user_id: userId, ...created },
        orderBy: { created_at: 'desc' },
        take: cap + 1,
        select: {
          session_chain_id: true,
          device_id: true,
          device_name: true,
          platform: true,
          app_version: true,
          ip: true,
          user_agent: true,
          created_at: true,
          last_used_at: true,
          revoked_at: true,
          revoked_reason: true,
        },
      });
      const events = await this.prisma.authEvent.findMany({
        where: { user_id: userId, ...created },
        orderBy: { created_at: 'desc' },
        take: cap + 1,
        select: {
          event_type: true,
          success: true,
          ip: true,
          device_id: true,
          user_agent: true,
          created_at: true,
        },
      });
      cut('sessions', sessions);
      cut('auth_events', events);
      data.sessions = sessions;
      data.auth_events = events;
      readable.push({
        title: 'Sign-ins and devices',
        lines: events.map(
          (e) =>
            `${stamp(e.created_at)}  ${e.event_type}  ${e.success ? 'ok' : 'fail'}  ip ${e.ip ?? ''}  ${e.device_id ?? ''}`,
        ),
      });
    }
    if (has('usernames')) {
      const [now_, old, channels, groups] = await Promise.all([
        this.prisma.username.findMany({ where: { owner_id: userId } }),
        this.prisma.usernameHold.findMany({
          where: { holder_user_id: userId },
        }),
        this.prisma.channel.findMany({
          where: withDeleted({ owner_id: userId }),
          select: { id: true, username: true, title: true },
        }),
        this.prisma.chatGroup.findMany({
          where: withDeleted({ created_by: userId }),
          select: { id: true, username: true, title: true },
        }),
      ]);
      data.usernames = [
        ...now_.map((h) => ({
          username: h.username_lower,
          type: h.owner_type,
          current: true,
          since: h.created_at,
        })),
        ...old.map((h) => ({
          username: h.username_lower,
          type: 'user',
          current: false,
          releasedAt: h.released_at,
        })),
        ...channels.map((c) => ({
          username: c.username,
          type: 'channel',
          id: c.id,
          title: c.title,
        })),
        ...groups
          .filter((g) => g.username)
          .map((g) => ({
            username: g.username,
            type: 'group',
            id: g.id,
            title: g.title,
          })),
      ];
    }

    if (has('chats')) {
      const convs = await this.prisma.conversation.findMany({
        where: {
          OR: [{ client_id: userId }, { attorney_id: userId }],
          ...(sel.conversationIds?.length
            ? { id: { in: sel.conversationIds } }
            : {}),
        },
        select: {
          id: true,
          case_id: true,
          client_id: true,
          attorney_id: true,
          pair_kind: true,
          created_at: true,
        },
        take: 1000,
      });
      const msgs = convs.length
        ? await this.prisma.message.findMany({
            where: withDeleted({
              conversation_id: { in: convs.map((c) => c.id) },
              ...created,
            }),
            orderBy: [{ conversation_id: 'asc' }, { created_at: 'asc' }],
            take: cap + 1,
            include: { edits: { orderBy: { edited_at: 'asc' } } },
          })
        : [];
      cut('messages', msgs);
      await who(msgs.map((m) => m.sender_id));
      for (const m of msgs) if (m.file_id) fileIds.add(m.file_id);
      data.conversations = convs;
      data.messages = msgs.map((m) => ({
        id: m.id,
        conversationId: m.conversation_id,
        senderId: m.sender_id,
        type: m.type,
        text: this.open(m.body_original, m.id),
        shownText: this.open(m.body_display, m.id),
        fileId: m.file_id,
        fileName: m.file_name,
        replyToId: m.reply_to_id,
        forwarded: m.forwarded,
        createdAt: m.created_at,
        editedAt: m.edited_at,
        deletedAt: m.deleted_at,
        revokedAt: m.revoked_at,
        edits: m.edits.map((e) => ({
          text: this.open(e.body_original, m.id),
          editedAt: e.edited_at,
        })),
      }));
      for (const c of convs) accessed.push({ type: 'conversation', id: c.id });
      readable.push({
        title: 'Direct chats',
        lines: msgs.map(
          (m) =>
            `[${m.conversation_id.slice(0, 8)}] ${stamp(m.created_at)} ${label(m.sender_id)}${m.deleted_at || m.revoked_at ? ' [DELETED]' : ''}: ${this.open(m.body_original, m.id)}`,
        ),
      });
    }

    if (has('groups')) {
      const memberOf = await this.prisma.chatGroupMember.findMany({
        where: {
          user_id: userId,
          ...(sel.groupIds?.length ? { group_id: { in: sel.groupIds } } : {}),
        },
        select: { group_id: true },
        take: 1000,
      });
      const gids = memberOf.map((m) => m.group_id);
      const groups = gids.length
        ? await this.prisma.chatGroup.findMany({
            where: withDeleted({ id: { in: gids } }),
            select: {
              id: true,
              title: true,
              username: true,
              created_by: true,
              created_at: true,
              deleted_at: true,
            },
          })
        : [];
      const msgs = gids.length
        ? await this.prisma.chatGroupMessage.findMany({
            where: withDeleted({ group_id: { in: gids }, ...created }),
            orderBy: [{ group_id: 'asc' }, { created_at: 'asc' }],
            take: cap + 1,
          })
        : [];
      cut('group_messages', msgs);
      await who(msgs.map((m) => m.sender_id));
      for (const m of msgs) if (m.file_id) fileIds.add(m.file_id);
      data.groups = groups;
      data.group_messages = msgs.map((m) => ({
        id: m.id,
        groupId: m.group_id,
        senderId: m.sender_id,
        type: m.type,
        text: m.body,
        fileId: m.file_id,
        fileName: m.file_name,
        replyToId: m.reply_to_id,
        createdAt: m.created_at,
        editedAt: m.edited_at,
        deletedAt: m.deleted_at,
      }));
      for (const g of groups) accessed.push({ type: 'group', id: g.id });
      const gTitle = new Map(groups.map((g) => [g.id, g.title]));
      readable.push({
        title: 'Groups',
        lines: msgs.map(
          (m) =>
            `[${gTitle.get(m.group_id) ?? m.group_id.slice(0, 8)}] ${stamp(m.created_at)} ${label(m.sender_id)}${m.deleted_at ? ' [DELETED]' : ''}: ${m.body}`,
        ),
      });
    }

    if (has('channel_posts')) {
      const rows = await this.prisma.channelPost.findMany({
        where: withDeleted({ author_id: userId, ...created }),
        orderBy: { created_at: 'asc' },
        take: cap + 1,
        include: {
          video_asset: {
            select: { provider: true, library_id: true, external_id: true },
          },
        },
      });
      cut('channel_posts', rows);
      for (const r of rows) r.media_file_ids.forEach((f) => fileIds.add(f));
      data.channel_posts = rows;
      readable.push({
        title: 'Channel posts',
        lines: rows.map(
          (r) =>
            `${stamp(r.created_at)}${r.deleted_at ? ' [DELETED]' : ''}: ${r.body}`,
        ),
      });
    }

    for (const [section, isReel] of [
      ['posts', false],
      ['reels', true],
    ] as const) {
      if (!has(section)) continue;
      const rows = await this.prisma.post.findMany({
        where: withDeleted({
          author_id: userId,
          video_asset_id: isReel ? { not: null } : null,
          ...created,
        }),
        orderBy: { created_at: 'asc' },
        take: cap + 1,
        select: {
          id: true,
          kind: true,
          title: true,
          body: true,
          status: true,
          location_name: true,
          created_at: true,
          edited_at: true,
          deleted_at: true,
          media: {
            select: { file_id: true, media_type: true, position: true },
          },
          video_asset: {
            select: { provider: true, library_id: true, external_id: true },
          },
        },
      });
      cut(section, rows);
      for (const r of rows) r.media.forEach((m) => fileIds.add(m.file_id));
      data[section] = rows;
      readable.push({
        title: section === 'posts' ? 'Publications' : 'Reels',
        lines: rows.map(
          (r) =>
            `${stamp(r.created_at)}${r.deleted_at ? ' [DELETED]' : ''} ${r.title ?? ''}: ${r.body}`,
        ),
      });
    }

    if (has('stories')) {
      const rows = await this.prisma.story.findMany({
        where: withDeleted({ author_id: userId, ...created }),
        orderBy: { created_at: 'asc' },
        take: cap + 1,
        select: {
          id: true,
          kind: true,
          text: true,
          audience: true,
          file_id: true,
          created_at: true,
          expires_at: true,
          deleted_at: true,
          video_asset: {
            select: { provider: true, library_id: true, external_id: true },
          },
        },
      });
      cut('stories', rows);
      for (const r of rows) if (r.file_id) fileIds.add(r.file_id);
      data.stories = rows;
      readable.push({
        title: 'Stories',
        lines: rows.map(
          (r) =>
            `${stamp(r.created_at)}${r.deleted_at ? ' [DELETED]' : ''} ${r.kind}: ${r.text ?? ''}`,
        ),
      });
    }

    if (has('questions')) {
      const rows = await this.prisma.legalQuestion.findMany({
        where: withDeleted({ author_id: userId, ...created }),
        orderBy: { created_at: 'asc' },
        take: cap + 1,
      });
      cut('questions', rows);
      data.questions = rows;
      readable.push({
        title: 'Questions',
        lines: rows.map(
          (r) =>
            `${stamp(r.created_at)}${r.deleted_at ? ' [DELETED]' : ''} ${r.title}: ${r.body}`,
        ),
      });
    }
    for (const t of truncated) {
      readable.unshift({
        title: 'Notice',
        lines: [`${t}: cut at ${cap} rows.`],
      });
      break;
    }
    return { data, readable, truncated, accessed, fileIds, subject };
  }

  /** Signed GET links for the referenced files: nothing is copied. */
  private async mediaLinks(
    ids: Set<string>,
    linkDays: number,
    now: Date,
  ): Promise<Row[]> {
    if (!ids.size) return [];
    const files = await this.prisma.file.findMany({
      where: withDeleted({ id: { in: [...ids] } }),
      select: {
        id: true,
        s3_bucket: true,
        s3_key: true,
        mime: true,
        size_bytes: true,
        sha256: true,
        purged_at: true,
      },
    });
    const out: Row[] = [];
    for (const f of files) {
      let url: string | null = null;
      if (!f.purged_at) {
        try {
          url = await this.storage.signedGetUrl(
            f.s3_bucket,
            f.s3_key,
            linkDays * 86400,
          );
        } catch {
          url = null;
        }
      }
      out.push({
        fileId: f.id,
        mime: f.mime,
        sizeBytes: Number(f.size_bytes),
        sha256: f.sha256,
        url,
        urlExpiresAt: url
          ? new Date(now.getTime() + linkDays * DAY_MS).toISOString()
          : null,
      });
    }
    return out;
  }
}

function sha256(b: Buffer): string {
  return createHash('sha256').update(b).digest('hex');
}

/** BigInt-safe JSON. */
function replacer(_k: string, v: unknown): unknown {
  return typeof v === 'bigint' ? Number(v) : v;
}
