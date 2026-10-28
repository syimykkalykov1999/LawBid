import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';
import { FilesService } from '../../files/files.service';
import { CaseJournalService } from '../../journal/case-journal.service';
import { CaseWorkspaceService } from '../workspace/case-workspace.service';
import { CaseToolsSettings } from './case-tools.settings';
import { CaseToolsSupport } from './case-tools.support';
import { isExpired, parseViewLog, withView } from './signing.lifecycle';
import type {
  CreateSignRequestDto,
  SignDto,
  SignRequestDto,
  SignVerifyDto,
} from './signing.dto';
import {
  appendPages,
  isSignablePdf,
  pngSize,
  renderSignaturePages,
  type SignedBy,
} from './signing.pdf';

const SIGNATURE_IMAGE_MAX_BYTES = 150_000;

type Side = Awaited<ReturnType<CaseWorkspaceService['side']>>;
type RequestRow = Prisma.CaseSignRequestGetPayload<{
  include: { signatures: true };
}>;

export const sha256 = (data: Buffer): string =>
  createHash('sha256').update(data).digest('hex');

const notFound = (): NotFoundException =>
  new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Signing request not found.',
  });

const invalid = (message: string, field?: string): BadRequestException =>
  new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    ...(field ? { details: { field } } : {}),
  });

/**
 * Owner 2026-10-20: both sides of an accepted case sign a PDF in the app —
 * a drawn signature or the typed name, with the consent, the time, the IP
 * and the SHA-256 of the file. Everything goes into the case journal (its
 * hash chain is the tamper evidence); when the second side has signed, the
 * original gets a signature page and a protocol page and becomes a new case
 * file. Own code, no third-party e-sign service. `verify` recomputes the
 * hashes from storage and the chain from the journal.
 */
@Injectable()
export class CaseSigningService {
  private readonly log = new Logger(CaseSigningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ws: CaseWorkspaceService,
    private readonly files: FilesService,
    private readonly journal: CaseJournalService,
    private readonly support: CaseToolsSupport,
    private readonly toolsSettings: CaseToolsSettings,
  ) {}

  async list(
    user: RequestUser,
    caseId: string,
    ctx?: { ip: string | null },
  ): Promise<SignRequestDto[]> {
    const s = await this.ws.side(user, caseId);
    const rows = await this.prisma.caseSignRequest.findMany({
      // Deal record 2026-10-27: its signing request has a card of its own.
      where: { case_id: caseId, deal_record: null },
      orderBy: { created_at: 'desc' },
      include: { signatures: { orderBy: { signed_at: 'asc' } } },
      take: 100,
    });
    // A finished request whose file did not get made (the last try died):
    // make it now. Best effort — the list still answers.
    for (const r of rows) {
      if (r.status === 'signed' && !r.final_file_id) {
        await this.finalize(r.id, user).catch((e: unknown) =>
          this.log.warn(
            `final file of signing request ${r.id} not made: ${String(e)}`,
          ),
        );
      }
    }
    const fresh = rows.some((r) => r.status === 'signed' && !r.final_file_id)
      ? await this.prisma.caseSignRequest.findMany({
          where: { case_id: caseId, deal_record: null },
          orderBy: { created_at: 'desc' },
          include: { signatures: { orderBy: { signed_at: 'asc' } } },
          take: 100,
        })
      : rows;
    if (ctx) await this.recordViews(fresh, s, user, ctx);
    return this.present(fresh, s, user);
  }

  /** Audit of who opened a waiting request (the list is the viewer). The
   * first view of each person goes into the case journal; every view (a
   * reopen within 10 minutes counts once) into the request's own log. */
  private async recordViews(
    rows: RequestRow[],
    s: Side,
    user: RequestUser,
    ctx: { ip: string | null },
  ): Promise<void> {
    const now = new Date();
    for (const r of rows) {
      if (r.status !== 'pending' || isExpired(r.expires_at, now)) continue;
      const next = withView(parseViewLog(r.view_log), {
        userId: user.sub,
        role: s.role,
        at: now.toISOString(),
        ip: ctx.ip?.slice(0, 64) ?? null,
      });
      if (!next) continue;
      try {
        await withTxRetry(this.prisma, async (tx) => {
          await tx.caseSignRequest.update({
            where: { id: r.id },
            data: { view_log: next.log as unknown as Prisma.InputJsonArray },
          });
          if (next.first) {
            await this.journal.append(tx, {
              caseId: r.case_id,
              clientId: s.clientId,
              actor: { userId: user.sub, role: s.role },
              attorneyId: s.attorneyId,
              event: 'signature_viewed',
              payload: { requestId: r.id, role: s.role },
            });
          }
        });
        r.view_log = next.log as unknown as Prisma.JsonValue;
      } catch (e) {
        // The audit must never break reading the list.
        this.log.warn(
          `view of signing request ${r.id} not logged: ${String(e)}`,
        );
      }
    }
  }

  async create(
    user: RequestUser,
    caseId: string,
    dto: CreateSignRequestDto,
  ): Promise<SignRequestDto[]> {
    const s = await this.ws.side(user, caseId, 'write');
    const file = await this.files.assertAttachable(user.sub, dto.fileId, [
      'case_attachment',
    ]);
    if (file.mime !== 'application/pdf') {
      throw invalid('Only a PDF can be signed.', 'fileId');
    }
    const { data } = await this.files.readClean(file.id);
    if (!(await isSignablePdf(data))) {
      throw invalid(
        'This PDF cannot be signed: it is damaged, protected or too long.',
        'fileId',
      );
    }
    const cfg = await this.toolsSettings.get();
    const changes = await withTxRetry(this.prisma, async (tx) => {
      const r = await tx.caseSignRequest.create({
        data: {
          case_id: caseId,
          created_by: user.sub,
          title: dto.title,
          source_file_id: file.id,
          source_sha256: sha256(data),
          expires_at:
            cfg.signExpiryDays > 0
              ? new Date(Date.now() + cfg.signExpiryDays * 86_400_000)
              : null,
        },
      });
      const linked = await tx.casePhoto.count({
        where: { case_id: caseId, file_id: file.id },
      });
      if (linked === 0) {
        await this.support.linkFile(tx, caseId, file.id, user.sub, dto.title);
      }
      await this.journal.append(tx, {
        caseId,
        clientId: s.clientId,
        actor: { userId: user.sub, role: s.role },
        attorneyId: s.attorneyId,
        event: 'signature_requested',
        payload: {
          requestId: r.id,
          title: dto.title,
          fileId: file.id,
          sha256: r.source_sha256,
        },
      });
      const chat = await this.support.chatLine(tx, caseId, 'sign_requested');
      await this.support.tell(
        user,
        s.role === 'client' ? s.attorneyId : s.clientId,
        caseId,
        'sign_request',
        tx,
      );
      return chat;
    });
    this.support.publish(changes);
    return this.list(user, caseId);
  }

  async sign(
    user: RequestUser,
    caseId: string,
    requestId: string,
    dto: SignDto,
    ctx: { ip: string | null; userAgent: string | null },
  ): Promise<SignRequestDto[]> {
    // An assistant acts as the attorney for the work, but a signature is
    // the attorney's own.
    if (user.assistant) {
      throw new ForbiddenException({
        code: ErrorCode.ASSISTANT_NOT_ALLOWED,
        message: 'Only the attorney can sign.',
      });
    }
    const s = await this.ws.side(user, caseId);
    const r = await this.request(caseId, requestId);
    if (r.status !== 'pending' || isExpired(r.expires_at, new Date())) {
      throw new ConflictException({
        code: ErrorCode.CASE_INVALID_STATE,
        message: 'This document is no longer waiting for signatures.',
      });
    }
    let image: Buffer | null = null;
    if (dto.method === 'drawn') {
      if (!dto.imagePngBase64)
        throw invalid('Draw your signature.', 'imagePngBase64');
      image = Buffer.from(dto.imagePngBase64, 'base64');
      if (image.length > SIGNATURE_IMAGE_MAX_BYTES || !pngSize(image)) {
        throw invalid(
          'The drawn signature is not a valid image.',
          'imagePngBase64',
        );
      }
    }
    // The file must still be exactly what was requested.
    const { data } = await this.files.readClean(r.source_file_id);
    if (sha256(data) !== r.source_sha256) {
      throw new ConflictException({
        code: ErrorCode.CASE_INVALID_STATE,
        message: 'The document no longer matches the one that was requested.',
      });
    }
    const completed = await withTxRetry(this.prisma, async (tx) => {
      const locked = await tx.$queryRaw<{ status: string }[]>`
        SELECT status::TEXT AS status FROM case_sign_requests
        WHERE id = ${requestId}::UUID FOR UPDATE`;
      const alive = await tx.caseSignRequest.count({
        where: {
          id: requestId,
          OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
        },
      });
      if (locked[0]?.status !== 'pending' || alive === 0) {
        throw new ConflictException({
          code: ErrorCode.CASE_INVALID_STATE,
          message: 'This document is no longer waiting for signatures.',
        });
      }
      try {
        await tx.caseSignature.create({
          data: {
            request_id: requestId,
            signer_id: user.sub,
            signer_role: s.role,
            signed_name: dto.name,
            method: dto.method,
            image_png: image ? new Uint8Array(image) : null,
            doc_sha256: r.source_sha256,
            ip: ctx.ip?.slice(0, 64) ?? null,
            user_agent: ctx.userAgent?.slice(0, 300) ?? null,
          },
        });
      } catch (e) {
        if ((e as { code?: string }).code === 'P2002') {
          throw new ConflictException({
            code: ErrorCode.CASE_INVALID_STATE,
            message: 'You have already signed this document.',
          });
        }
        throw e;
      }
      await this.journal.append(tx, {
        caseId,
        clientId: s.clientId,
        actor: { userId: user.sub, role: s.role },
        attorneyId: s.attorneyId,
        event: 'signature_signed',
        payload: {
          requestId,
          role: s.role,
          method: dto.method,
          name: dto.name,
          docSha256: r.source_sha256,
          ip: ctx.ip?.slice(0, 64) ?? null,
        },
      });
      const count = await tx.caseSignature.count({
        where: { request_id: requestId },
      });
      if (count >= 2) {
        await tx.caseSignRequest.update({
          where: { id: requestId },
          data: { status: 'signed', completed_at: new Date() },
        });
        return true;
      }
      return false;
    });
    if (completed) await this.finalize(requestId, user);
    return this.list(user, caseId);
  }

  async decline(
    user: RequestUser,
    caseId: string,
    requestId: string,
    reason: string | undefined,
  ): Promise<SignRequestDto[]> {
    // Declining is the signer's own act, like signing.
    if (user.assistant) {
      throw new ForbiddenException({
        code: ErrorCode.ASSISTANT_NOT_ALLOWED,
        message: 'Only the attorney can decline.',
      });
    }
    const s = await this.ws.side(user, caseId);
    const r = await this.request(caseId, requestId);
    if (r.status !== 'pending') {
      throw new ConflictException({
        code: ErrorCode.CASE_INVALID_STATE,
        message: 'This document is no longer waiting for signatures.',
      });
    }
    const changes = await withTxRetry(this.prisma, async (tx) => {
      const done = await tx.caseSignRequest.updateMany({
        where: { id: requestId, status: 'pending' },
        data: {
          status: 'declined',
          declined_by: user.sub,
          decline_reason: reason ?? null,
        },
      });
      if (done.count === 0) {
        throw new ConflictException({
          code: ErrorCode.CASE_INVALID_STATE,
          message: 'This document is no longer waiting for signatures.',
        });
      }
      await this.journal.append(tx, {
        caseId,
        clientId: s.clientId,
        actor: { userId: user.sub, role: s.role },
        attorneyId: s.attorneyId,
        event: 'signature_declined',
        payload: { requestId, reason: reason ?? null },
      });
      const chat = await this.support.chatLine(tx, caseId, 'sign_declined');
      await this.support.tell(
        user,
        s.role === 'client' ? s.attorneyId : s.clientId,
        caseId,
        'sign_declined',
        tx,
      );
      return chat;
    });
    this.support.publish(changes);
    return this.list(user, caseId);
  }

  /** The side that asked can withdraw the request until both have signed. */
  async cancel(
    user: RequestUser,
    caseId: string,
    requestId: string,
  ): Promise<SignRequestDto[]> {
    const s = await this.ws.side(user, caseId, 'write');
    const r = await this.request(caseId, requestId);
    if (!this.isCreator(r, s)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the side that asked for the signatures can cancel.',
      });
    }
    const done = await this.prisma.caseSignRequest.updateMany({
      where: { id: requestId, status: 'pending' },
      data: { status: 'canceled' },
    });
    if (done.count === 0) {
      throw new ConflictException({
        code: ErrorCode.CASE_INVALID_STATE,
        message: 'This document is no longer waiting for signatures.',
      });
    }
    return this.list(user, caseId);
  }

  /** The side that asked sends the reminder again now (cooldown from the
   * admin) and gives the request a fresh expiry when the admin sets one. */
  async resend(
    user: RequestUser,
    caseId: string,
    requestId: string,
  ): Promise<SignRequestDto[]> {
    const s = await this.ws.side(user, caseId, 'write');
    const r = await this.request(caseId, requestId);
    if (!this.isCreator(r, s)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the side that asked for the signatures can resend.',
      });
    }
    const now = new Date();
    const cfg = await this.toolsSettings.get();
    // A request that ran out of time (expired) can be revived by a resend.
    const revive = r.status === 'canceled' && r.expired_at !== null;
    if (r.status !== 'pending' && !revive) {
      throw new ConflictException({
        code: ErrorCode.CASE_INVALID_STATE,
        message: 'This document is no longer waiting for signatures.',
      });
    }
    const cooldownEnds = new Date(
      now.getTime() - cfg.signResendCooldownMinutes * 60_000,
    );
    const claimed = await this.prisma.caseSignRequest.updateMany({
      where: {
        id: requestId,
        status: revive ? 'canceled' : 'pending',
        OR: [
          { last_reminded_at: null },
          { last_reminded_at: { lt: cooldownEnds } },
        ],
      },
      data: {
        status: 'pending',
        expired_at: null,
        last_reminded_at: now,
        reminders_sent: { increment: 1 },
        ...(cfg.signExpiryDays > 0 || revive
          ? {
              expires_at:
                cfg.signExpiryDays > 0
                  ? new Date(now.getTime() + cfg.signExpiryDays * 86_400_000)
                  : null,
            }
          : {}),
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        code: ErrorCode.CASE_INVALID_STATE,
        message: 'The reminder was sent a moment ago. Try again later.',
      });
    }
    await this.remindUnsigned(user, s, r, 'sign_request');
    return this.list(user, caseId);
  }

  /** Bell + push to whoever of the two has not signed yet. */
  private async remindUnsigned(
    actor: RequestUser,
    s: { clientId: string; attorneyId: string },
    r: { case_id: string; signatures: { signer_id: string }[] },
    kind: 'sign_request' | 'sign_reminder',
  ): Promise<void> {
    const signed = new Set(r.signatures.map((x) => x.signer_id));
    for (const id of [s.clientId, s.attorneyId]) {
      if (signed.has(id) || id === actor.sub) continue;
      await this.support.tell(actor, id, r.case_id, kind);
    }
  }

  async verify(
    user: RequestUser,
    caseId: string,
    requestId: string,
  ): Promise<SignVerifyDto> {
    await this.ws.side(user, caseId);
    const r = await this.request(caseId, requestId);
    const source = await this.files.readClean(r.source_file_id);
    const finalOk = r.final_file_id
      ? sha256((await this.files.readClean(r.final_file_id)).data) ===
        r.final_sha256
      : null;
    const [chain, rows] = await Promise.all([
      this.journal.verifyChain(caseId),
      this.prisma.caseJournal.findMany({
        where: {
          case_id: caseId,
          event_type: 'signature_signed',
          payload: { path: ['requestId'], equals: requestId },
        },
        select: { actor_user_id: true },
      }),
    ]);
    const signers = new Set(r.signatures.map((x) => x.signer_id));
    return {
      sourceOk: sha256(source.data) === r.source_sha256,
      finalOk,
      journalOk: chain.valid,
      journalSignatures: rows.filter(
        (x) => x.actor_user_id && signers.has(x.actor_user_id),
      ).length,
      sourceSha256: r.source_sha256,
      finalSha256: r.final_sha256,
    };
  }

  // ---- finishing -----------------------------------------------------

  /** Both signed: original + signature page + protocol page = a new case
   * file. Runs once (the update below only takes a request without one). */
  private async finalize(requestId: string, actor: RequestUser): Promise<void> {
    const r = await this.prisma.caseSignRequest.findUnique({
      where: { id: requestId },
      include: { signatures: { orderBy: { signed_at: 'asc' } } },
    });
    if (!r || r.status !== 'signed' || r.final_file_id) return;
    const kase = await this.prisma.case.findUniqueOrThrow({
      where: { id: r.case_id },
      select: {
        title: true,
        client_id: true,
        accepted_bid: { select: { attorney_id: true } },
      },
    });
    const attorneyId = kase.accepted_bid?.attorney_id;
    if (!attorneyId) return;
    const { data } = await this.files.readClean(r.source_file_id);
    if (sha256(data) !== r.source_sha256) return;
    const journalRows = await this.prisma.caseJournal.findMany({
      where: {
        case_id: r.case_id,
        event_type: 'signature_signed',
        payload: { path: ['requestId'], equals: requestId },
      },
      select: { actor_user_id: true, row_hash: true },
    });
    const hashOf = new Map(
      journalRows.map((j) => [j.actor_user_id, j.row_hash]),
    );
    const requestedBy = await this.support.nameOf(r.created_by);
    const signers: SignedBy[] = r.signatures.map((x) => ({
      role: x.signer_role as 'client' | 'attorney',
      name: x.signed_name,
      method: x.method as 'drawn' | 'typed',
      image: x.image_png ? Buffer.from(x.image_png) : null,
      signedAt: x.signed_at,
      ip: x.ip,
      userAgent: x.user_agent,
      docSha256: x.doc_sha256,
      journalHash: hashOf.get(x.signer_id) ?? null,
    }));
    // The client's field first, as on a contract.
    signers.sort((a, b) =>
      a.role === b.role ? 0 : a.role === 'client' ? -1 : 1,
    );
    const pages = await renderSignaturePages({
      requestId,
      caseId: r.case_id,
      caseTitle: kase.title,
      documentTitle: r.title,
      sourceSha256: r.source_sha256,
      requestedBy,
      requestedAt: r.created_at,
      signers,
    });
    const merged = await appendPages(data, pages);
    const file = await this.files.storeGenerated(
      attorneyId,
      'case_attachment',
      merged,
      'application/pdf',
    );
    const other = actor.sub === kase.client_id ? attorneyId : kase.client_id;
    const changes = await withTxRetry(this.prisma, async (tx) => {
      const won = await tx.caseSignRequest.updateMany({
        where: { id: requestId, status: 'signed', final_file_id: null },
        data: { final_file_id: file.id, final_sha256: file.sha256 },
      });
      if (won.count === 0) return [];
      await this.support.linkFile(
        tx,
        r.case_id,
        file.id,
        attorneyId,
        `${r.title} (signed)`,
      );
      await this.journal.append(tx, {
        caseId: r.case_id,
        clientId: kase.client_id,
        actor: {
          userId: actor.sub,
          role: actor.sub === kase.client_id ? 'client' : 'attorney',
        },
        attorneyId,
        event: 'signature_completed',
        payload: {
          requestId,
          fileId: file.id,
          finalSha256: file.sha256,
          sourceSha256: r.source_sha256,
        },
      });
      const chat = await this.support.chatLine(tx, r.case_id, 'sign_completed');
      await this.support.tell(actor, other, r.case_id, 'sign_done', tx);
      return chat;
    });
    this.support.publish(changes);
  }

  // ---- presenting ----------------------------------------------------

  private async request(
    caseId: string,
    requestId: string,
  ): Promise<RequestRow> {
    const r = await this.prisma.caseSignRequest.findFirst({
      where: { id: requestId, case_id: caseId },
      include: { signatures: true },
    });
    if (!r) throw notFound();
    return r;
  }

  private isCreator(r: { created_by: string }, s: Side): boolean {
    const creatorRole = r.created_by === s.clientId ? 'client' : 'attorney';
    return creatorRole === s.role;
  }

  private async present(
    rows: RequestRow[],
    s: Side,
    user: RequestUser,
  ): Promise<SignRequestDto[]> {
    const ids = rows.flatMap((r) =>
      r.final_file_id
        ? [r.source_file_id, r.final_file_id]
        : [r.source_file_id],
    );
    const urls = new Map(
      (await this.files.casePhotoUrls(ids)).map((u) => [u.fileId, u.url]),
    );
    return rows.map((r) => {
      const mine = r.signatures.some((x) => x.signer_id === user.sub);
      const open = r.status === 'pending';
      return {
        id: r.id,
        title: r.title,
        status: r.status,
        createdByRole: r.created_by === s.clientId ? 'client' : 'attorney',
        createdAt: r.created_at.toISOString(),
        completedAt: r.completed_at?.toISOString() ?? null,
        sourceUrl: urls.get(r.source_file_id) ?? null,
        finalUrl: r.final_file_id ? (urls.get(r.final_file_id) ?? null) : null,
        sourceSha256: r.source_sha256,
        finalSha256: r.final_sha256,
        signatures: r.signatures
          .slice()
          .sort((a, b) => a.signed_at.getTime() - b.signed_at.getTime())
          .map((x) => ({
            role: x.signer_role as 'client' | 'attorney',
            name: x.signed_name,
            method: x.method as 'drawn' | 'typed',
            signedAt: x.signed_at.toISOString(),
          })),
        canSign: open && !mine && !user.assistant,
        canDecline: open && !mine && !user.assistant,
        canCancel: open && s.writable && this.isCreator(r, s),
        declinedByRole: r.declined_by
          ? r.declined_by === s.clientId
            ? 'client'
            : 'attorney'
          : null,
        declineReason: r.decline_reason,
        expiresAt: r.expires_at?.toISOString() ?? null,
        expired: r.expired_at !== null,
        remindersSent: r.reminders_sent,
        lastRemindedAt: r.last_reminded_at?.toISOString() ?? null,
        views: parseViewLog(r.view_log).map((v) => ({
          role: v.role,
          at: v.at,
        })),
        canResend:
          (r.status === 'pending' || r.expired_at !== null) &&
          s.writable &&
          this.isCreator(r, s),
      };
    });
  }
}
