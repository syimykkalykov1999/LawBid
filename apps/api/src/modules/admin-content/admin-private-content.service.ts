import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { MessageBodyCipher } from '../../common/secrets/message-body-cipher';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { S3StorageService } from '../files/storage/s3-storage.service';
import type {
  PrivateCallsDto,
  PrivateCaseFilesDto,
  PrivateFileUrlDto,
  PrivateMessagesPageDto,
  RevealedMessageDto,
} from './admin-private-content.dto';

const DEFAULT_LIMIT = 50;
/** Signed link lifetime for a private document (seconds). */
export const PRIVATE_FILE_URL_TTL_SEC = 300;
/** Document kinds an admin may open through the private-content gate. */
const CASE_FILE_PURPOSES = ['case_photo', 'case_attachment'] as const;

const notFound = (what: string) =>
  new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: `${what} not found.`,
  });

/**
 * Owner 2026-10-28 (attorney-client privilege). The ONLY admin read paths
 * for 1:1 chats, call metadata and case files. Every route is
 * `@PrivateRead(...)`: the guard has already demanded a reason code and a
 * free-text reason (also of the owner), and the audit interceptor writes the
 * `admin.private_read.<kind>` row BEFORE this code runs — if that row cannot
 * be written nothing here executes. Message texts never appear in a list:
 * revealing one needs a fresh 2FA step-up (one admin, no second admin).
 */
@Injectable()
export class AdminPrivateContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AdminAuthService,
    private readonly storage: S3StorageService,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() private readonly cipher?: MessageBodyCipher,
  ) {}

  /** An admin limited to some countries does not read private content. */
  private assertUnrestricted(admin: AdminActor): void {
    if (admin.countries && admin.countries.length > 0) {
      throw notFound('Conversation');
    }
  }

  async listMessages(
    admin: AdminActor,
    conversationId: string,
    cursor?: string,
    limit = DEFAULT_LIMIT,
  ): Promise<PrivateMessagesPageDto> {
    this.assertUnrestricted(admin);
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, attorney_id: true, client_id: true },
    });
    if (!convo) throw notFound('Conversation');
    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.message.findMany({
      where: {
        conversation_id: conversationId,
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
      // No body column: the text is not even read from the database here.
      select: {
        id: true,
        sender_id: true,
        type: true,
        created_at: true,
        deleted_at: true,
        file_name: true,
        duration_ms: true,
      },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      conversationId: convo.id,
      attorneyId: convo.attorney_id,
      clientId: convo.client_id,
      items: page.map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        type: m.type,
        createdAt: m.created_at.toISOString(),
        deleted: m.deleted_at !== null,
        fileName: m.file_name,
        durationMs: m.duration_ms,
        bodyHidden: true,
      })),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** One message text, after a fresh 2FA code (default: entered within
   * `admin.private_stepup_seconds`). The audit row is already written. */
  async revealMessage(
    admin: AdminActor,
    messageId: string,
  ): Promise<RevealedMessageDto> {
    this.assertUnrestricted(admin);
    const window = this.settings
      ? await this.settings.number('admin.private_stepup_seconds')
      : 120;
    await this.auth.assertFreshStepUp(admin.sessionId, window);
    // #358: messages are keyed by (id, conversation_id); id alone is still
    // unique (uuid) and leads the primary-key index.
    const m = await this.prisma.message.findFirst({
      where: { id: messageId },
      select: {
        id: true,
        conversation_id: true,
        sender_id: true,
        created_at: true,
        body_original: true,
      },
    });
    if (!m) throw notFound('Message');
    return {
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      createdAt: m.created_at.toISOString(),
      body: this.cipher?.open(m.body_original, m.id) ?? m.body_original,
    };
  }

  async listCalls(
    admin: AdminActor,
    conversationId: string,
  ): Promise<PrivateCallsDto> {
    this.assertUnrestricted(admin);
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true },
    });
    if (!convo) throw notFound('Conversation');
    const calls = await this.prisma.call.findMany({
      where: { conversation_id: conversationId },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    return {
      items: calls.map((k) => ({
        id: k.id,
        callerId: k.caller_id,
        calleeId: k.callee_id,
        status: k.status,
        video: k.video,
        isGroup: k.is_group,
        answeredAt: k.answered_at?.toISOString() ?? null,
        endedAt: k.ended_at?.toISOString() ?? null,
        durationSec: k.duration_sec,
        endReason: k.end_reason,
        createdAt: k.created_at.toISOString(),
      })),
    };
  }

  async listCaseFiles(
    admin: AdminActor,
    caseId: string,
  ): Promise<PrivateCaseFilesDto> {
    this.assertUnrestricted(admin);
    const rows = await this.prisma.casePhoto.findMany({
      where: { case_id: caseId },
      orderBy: { position: 'asc' },
      take: 500,
      select: {
        file_id: true,
        description: true,
        created_at: true,
      },
    });
    // Two queries instead of a cross-family include (sharding rule).
    const files = await this.prisma.file.findMany({
      where: { id: { in: rows.map((r) => r.file_id) } },
      select: { id: true, mime: true, size_bytes: true, deleted_at: true },
    });
    const byId = new Map(files.map((f) => [f.id, f]));
    return {
      items: rows.flatMap((r) => {
        const f = byId.get(r.file_id);
        if (!f || f.deleted_at) return [];
        return [
          {
            fileId: r.file_id,
            mime: f.mime,
            sizeBytes: Number(f.size_bytes),
            description: r.description,
            createdAt: r.created_at.toISOString(),
          },
        ];
      }),
    };
  }

  /** A 5-minute signed link to one case file; needs the fresh step-up too. */
  async caseFileUrl(
    admin: AdminActor,
    caseId: string,
    fileId: string,
  ): Promise<PrivateFileUrlDto> {
    this.assertUnrestricted(admin);
    const window = this.settings
      ? await this.settings.number('admin.private_stepup_seconds')
      : 120;
    await this.auth.assertFreshStepUp(admin.sessionId, window);
    const link = await this.prisma.casePhoto.findFirst({
      where: { case_id: caseId, file_id: fileId },
      select: { file_id: true },
    });
    const f = link
      ? await this.prisma.file.findUnique({
          where: { id: link.file_id },
          select: {
            s3_bucket: true,
            s3_key: true,
            purpose: true,
            scan_status: true,
            deleted_at: true,
            purged_at: true,
          },
        })
      : null;
    if (
      !f ||
      f.deleted_at ||
      f.purged_at ||
      f.scan_status !== 'clean' ||
      !(CASE_FILE_PURPOSES as readonly string[]).includes(f.purpose)
    ) {
      throw notFound('File');
    }
    return {
      url: await this.storage.signedGetUrl(
        f.s3_bucket,
        f.s3_key,
        PRIVATE_FILE_URL_TTL_SEC,
      ),
      expiresAt: new Date(
        Date.now() + PRIVATE_FILE_URL_TTL_SEC * 1000,
      ).toISOString(),
    };
  }
}
