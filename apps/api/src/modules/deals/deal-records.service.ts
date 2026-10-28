import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DealRecord, PartyRole, Prisma } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { shardContext } from '../../sharding/shard-context';
import { newShardedId, shardOf } from '../../sharding/shard-id';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import type { RequestMeta } from '../auth/services/session.service';
import {
  BidAcceptanceService,
  bidNotFound,
  paymentTermsOf,
  planBidTransition,
} from '../bids/bids.public';
import { caseInvalidState, caseNotFound, pngSize } from '../cases/cases.public';
import type { ChatChange } from '../chat/chat-system.service';
import { FilesService } from '../files/files.service';
import { CaseJournalService } from '../journal/case-journal.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DealRecordTexts } from './deal-record-texts';
import {
  dealRecordTransition,
  invalidDealRecordState,
  LIVE_DEAL_RECORD_STATUSES,
  nextSigner,
} from './deal-record.machine';
import { DealRecordRunner } from './deal-record.runner';
import {
  fullNameOf,
  recordCodeOf,
  snapshotSha256,
  type DealRecordSnapshot,
} from './deal-record.snapshot';
import {
  type CreateDealRecordDto,
  type DeclineDealRecordDto,
  type AttachAgreementDto,
  type DealRecordDto,
  type SignDealRecordDto,
} from './dto/deal-record.dto';

/** Same cap as the Docs-tab signing (CaseSigningService). */
export const DEAL_SIGNATURE_IMAGE_MAX_BYTES = 150_000;
/** Kinds of `case_workspace_activity` the record emits (mobile maps them). */
export type DealRecordNotifyKind =
  'deal_record_sign' | 'deal_record_sealed' | 'deal_record_declined';

type RecordRow = DealRecord & {
  sign_request: {
    source_sha256: string;
    signatures: {
      signer_id: string;
      signer_role: string;
      signed_name: string;
      signed_at: Date;
    }[];
  } | null;
  bid: { attorney_id: string };
  case: { client_id: string };
};

const RECORD_INCLUDE = {
  sign_request: {
    select: {
      source_sha256: true,
      signatures: {
        select: {
          signer_id: true,
          signer_role: true,
          signed_name: true,
          signed_at: true,
        },
        orderBy: { signed_at: 'asc' as const },
      },
    },
  },
  bid: { select: { attorney_id: true } },
  case: { select: { client_id: true } },
} satisfies Prisma.DealRecordInclude;

/**
 * Deal record 2026-10-27 (docs/architecture/DEAL_RECORD_PLAN_2026-10-27.md):
 * the record both parties sign before a bid is really accepted. The request
 * path only writes small rows and enqueues; the PDFs are rendered by
 * DealRecordRunner. The second signature runs today's accept transaction
 * (BidAcceptanceService.acceptInTx) in the same transaction as the
 * signature row, so "accepted" and "both signed" can never disagree.
 */
@Injectable()
export class DealRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly acceptance: BidAcceptanceService,
    private readonly journal: CaseJournalService,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
    private readonly texts: DealRecordTexts,
    private readonly runner: DealRecordRunner,
  ) {}

  /** Off = the feature does not exist for the apps (404 everywhere). */
  private async assertEnabled(): Promise<void> {
    if (!(await this.settings.boolean('deal_record.enabled'))) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Not found.',
      });
    }
  }

  // ----------------------------------------------------------------- start

  /** POST /deal-records — the party whose turn it is taps Accept. */
  async start(
    user: RequestUser,
    dto: CreateDealRecordDto,
    meta: RequestMeta,
  ): Promise<DealRecordDto> {
    await this.assertEnabled();
    // POST /deal-records has no case id in its path: the bid id carries the
    // case's shard (shard-context.interceptor.ts only sees route params).
    return shardContext.runForCase(dto.bidId, () =>
      this.startInShard(user, dto, meta),
    );
  }

  private async startInShard(
    user: RequestUser,
    dto: CreateDealRecordDto,
    meta: RequestMeta,
  ): Promise<DealRecordDto> {
    const bid = await this.prisma.bid.findUnique({
      where: { id: dto.bidId },
      include: {
        offers: { orderBy: { round_no: 'asc' } },
        case: {
          select: {
            id: true,
            client_id: true,
            status: true,
            title: true,
            primary_state_code: true,
            practice_area_id: true,
            states: { select: { state_code: true } },
          },
        },
      },
    });
    if (!bid) throw bidNotFound();
    const by = partyOf(user, {
      client_id: bid.case.client_id,
      attorney_id: bid.attorney_id,
    });
    const now = new Date();
    if (bid.case.status !== 'open') {
      throw caseInvalidState('accept_bid', bid.case.status);
    }
    // Active and the caller's turn (BID_INVALID_STATE / BID_NOT_YOUR_TURN).
    planBidTransition(bid, 'accept', by, now);

    const [client, attorney, texts, practice] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: bid.case.client_id },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          client_profile: { select: { username: true } },
        },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: bid.attorney_id },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          attorney_profile: {
            select: {
              username: true,
              firm_name: true,
              licenses: {
                select: {
                  state_code: true,
                  bar_number: true,
                  license_status: true,
                },
                orderBy: { created_at: 'asc' },
              },
            },
          },
        },
      }),
      this.texts.pdf(),
      // PracticeArea is a global-family table: a query of its own, not an
      // include across families (sharding/cross-family-include.spec.ts).
      this.prisma.practiceArea.findUnique({
        where: { id: bid.case.practice_area_id },
        select: { name_en: true },
      }),
    ]);
    const licenses = attorney.attorney_profile?.licenses ?? [];
    const license =
      licenses.find((l) => l.license_status === 'verified') ??
      licenses.find((l) => l.state_code === bid.case.primary_state_code) ??
      licenses[0] ??
      null;
    // The record id carries the case's shard, like every case-family id.
    const recordId = newShardedId(shardOf(bid.case_id));
    const snapshot: DealRecordSnapshot = {
      version: 1,
      recordId,
      case: {
        id: bid.case.id,
        title: bid.case.title,
        practice: practice?.name_en ?? null,
        states: [
          bid.case.primary_state_code,
          ...bid.case.states
            .map((s) => s.state_code)
            .filter((s) => s !== bid.case.primary_state_code),
        ],
      },
      client: {
        id: client.id,
        fullName: fullNameOf({
          ...client,
          username: client.client_profile?.username ?? null,
        }),
        email: client.email,
        username: client.client_profile?.username ?? null,
      },
      attorney: {
        id: attorney.id,
        fullName: fullNameOf({
          ...attorney,
          username: attorney.attorney_profile?.username ?? null,
        }),
        email: attorney.email,
        username: attorney.attorney_profile?.username ?? null,
        barState: license?.state_code ?? null,
        barNumber: license?.bar_number ?? null,
        firmName: attorney.attorney_profile?.firm_name ?? null,
      },
      acceptedBy: by,
      acceptedAt: now.toISOString(),
      terms: {
        feeType: bid.fee_type,
        amountCents: bid.amount_cents,
        percentBps: bid.percent_bps,
        paymentTerms: paymentTermsOf(bid.payment_terms),
      },
      history: bid.offers.map((o) => ({
        roundNo: o.round_no,
        fromRole: o.from_role,
        createdAt: o.created_at.toISOString(),
        feeType: o.fee_type,
        amountCents: o.amount_cents,
        percentBps: o.percent_bps,
        paymentTerms: paymentTermsOf(o.payment_terms),
        message: o.message,
        // The pending offer is the one being accepted.
        status: o.status === 'pending' ? 'accepted' : o.status,
      })),
      texts: {
        notContract: texts.notContract,
        footer: texts.footer,
        textVersion: texts.textVersion,
      },
    };
    const sha = snapshotSha256(snapshot);

    const created = await withTxRetry(this.prisma, async (tx) => {
      // The case row first: every accept / record start on this case
      // queues here, so two parallel taps cannot both get a live record.
      await tx.$queryRaw`SELECT id FROM cases WHERE id = ${bid.case_id}::UUID FOR UPDATE`;
      const kase = await tx.case.findUnique({
        where: { id: bid.case_id },
        select: { status: true },
      });
      if (!kase) throw caseNotFound();
      if (kase.status !== 'open') {
        throw caseInvalidState('accept_bid', kase.status);
      }
      const live = await tx.dealRecord.findFirst({
        where: {
          case_id: bid.case_id,
          status: { in: [...LIVE_DEAL_RECORD_STATUSES] },
        },
        select: { id: true, bid_id: true },
      });
      if (live) {
        throw new ConflictException({
          code: ErrorCode.DEAL_RECORD_PENDING,
          message:
            'This case already has a deal record waiting for signatures.',
          details: { dealRecordId: live.id, bidId: live.bid_id },
        });
      }
      const fresh = await tx.bid.findUniqueOrThrow({ where: { id: bid.id } });
      planBidTransition(fresh, 'accept', by, now);
      const row = await tx.dealRecord.create({
        data: {
          id: recordId,
          case_id: bid.case_id,
          bid_id: bid.id,
          accepted_by: by,
          initiator_id: user.sub,
          status: 'preparing',
          snapshot: snapshot as unknown as Prisma.InputJsonObject,
          snapshot_sha256: sha,
          record_code: recordCodeOf(recordId, sha),
          text_version: texts.textVersion,
        },
        include: RECORD_INCLUDE,
      });
      await this.journal.append(tx, {
        caseId: bid.case_id,
        clientId: bid.case.client_id,
        actor: { userId: user.sub, role: by },
        attorneyId: bid.attorney_id,
        event: 'signature_requested',
        payload: {
          dealRecordId: recordId,
          bidId: bid.id,
          snapshotSha256: sha,
          acceptedBy: by,
          ip: meta.ip ?? null,
        },
      });
      return row;
    });
    try {
      await this.runner.enqueue(recordId, bid.case_id, 'unsigned');
    } catch (error) {
      await this.markFailed(
        recordId,
        'preparing',
        `enqueue: ${(error as Error).message}`,
      );
      throw error;
    }
    return this.toDto(created, user);
  }

  // ------------------------------------------------------------------ read

  async get(user: RequestUser, id: string): Promise<DealRecordDto> {
    await this.assertEnabled();
    const row = await this.load(id);
    partyOf(user, {
      client_id: row.case.client_id,
      attorney_id: row.bid.attorney_id,
    });
    return this.toDto(row, user);
  }

  /** The case's current record: a live one, else the latest sealed one. */
  async current(
    user: RequestUser,
    caseId: string,
  ): Promise<DealRecordDto | null> {
    await this.assertEnabled();
    const kase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        client_id: true,
        accepted_bid: { select: { attorney_id: true } },
      },
    });
    if (!kase) throw caseNotFound();
    const rows = await this.prisma.dealRecord.findMany({
      where: { case_id: caseId, status: { not: 'declined' } },
      orderBy: { created_at: 'desc' },
      take: 5,
      include: RECORD_INCLUDE,
    });
    const mine = rows.filter((r) => {
      try {
        partyOf(user, {
          client_id: r.case.client_id,
          attorney_id: r.bid.attorney_id,
        });
        return true;
      } catch {
        return false;
      }
    });
    const row =
      mine.find((r) => LIVE_DEAL_RECORD_STATUSES.includes(r.status)) ??
      mine.find((r) => r.status === 'sealed') ??
      mine[0] ??
      null;
    return row ? this.toDto(row, user) : null;
  }

  // ------------------------------------------------------------------ sign

  async sign(
    user: RequestUser,
    id: string,
    dto: SignDealRecordDto,
    meta: RequestMeta,
  ): Promise<DealRecordDto> {
    await this.assertEnabled();
    // An assistant acts as the attorney for the work, but a signature is
    // the attorney's own (same rule as the Docs-tab signing).
    if (user.assistant) {
      throw new ForbiddenException({
        code: ErrorCode.ASSISTANT_NOT_ALLOWED,
        message: 'Only the attorney can sign.',
      });
    }
    const row = await this.load(id);
    const role = partyOf(user, {
      client_id: row.case.client_id,
      attorney_id: row.bid.attorney_id,
    });
    if (row.status !== 'awaiting_signatures' || !row.sign_request_id) {
      throw invalidDealRecordState('sign', row.status);
    }
    const signed = row.sign_request?.signatures.map((s) => s.signer_role) ?? [];
    if (nextSigner(row.accepted_by, signed) !== role) {
      throw invalidDealRecordState(
        'sign',
        row.status,
        signed.includes(role)
          ? 'You have already signed this record.'
          : 'The other party signs first.',
      );
    }
    const image = Buffer.from(dto.imagePngBase64, 'base64');
    if (image.length > DEAL_SIGNATURE_IMAGE_MAX_BYTES || !pngSize(image)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'The drawn signature is not a valid image.',
        details: { fields: ['imagePngBase64'] },
      });
    }
    const name = dto.name.trim();
    const requestId = row.sign_request_id;
    const chat: ChatChange[] = [];
    let accepted: { case_id: string } | null = null;
    try {
      await withTxRetry(this.prisma, async (tx) => {
        chat.length = 0;
        accepted = null;
        const locked = await tx.$queryRaw<{ status: string }[]>`
          SELECT status::TEXT AS status FROM deal_records
          WHERE id = ${id}::UUID FOR UPDATE`;
        if (locked[0]?.status !== 'awaiting_signatures') {
          throw invalidDealRecordState('sign', row.status);
        }
        const before = await tx.caseSignature.count({
          where: { request_id: requestId },
        });
        const next = dealRecordTransition(
          'awaiting_signatures',
          'sign',
          before,
        );
        try {
          await tx.caseSignature.create({
            data: {
              request_id: requestId,
              signer_id: user.sub,
              signer_role: role,
              signed_name: name,
              method: 'drawn',
              image_png: new Uint8Array(image),
              doc_sha256:
                row.sign_request?.source_sha256 ?? row.snapshot_sha256,
              ip: meta.ip?.slice(0, 64) ?? null,
              user_agent: meta.userAgent?.slice(0, 300) ?? null,
            },
          });
        } catch (e) {
          if ((e as { code?: string }).code === 'P2002') {
            throw invalidDealRecordState(
              'sign',
              row.status,
              'You have already signed this record.',
            );
          }
          throw e;
        }
        await this.journal.append(tx, {
          caseId: row.case_id,
          clientId: row.case.client_id,
          actor: { userId: user.sub, role },
          attorneyId: row.bid.attorney_id,
          event: 'signature_signed',
          payload: {
            dealRecordId: id,
            requestId,
            role,
            name,
            docSha256: row.sign_request?.source_sha256 ?? row.snapshot_sha256,
            ip: meta.ip?.slice(0, 64) ?? null,
          },
        });
        if (next === 'sealing') {
          // The real acceptance (case → in_progress, other bids rejected,
          // contacts, chat, bid_accepted notifications) — same transaction.
          accepted = await this.acceptance.acceptInTx(
            tx,
            row.bid_id,
            row.accepted_by,
            row.initiator_id,
            meta,
            chat,
          );
          await tx.caseSignRequest.update({
            where: { id: requestId },
            data: { status: 'signed', completed_at: new Date() },
          });
        }
        await tx.dealRecord.update({
          where: { id },
          data: { status: next },
        });
        if (next === 'awaiting_signatures') {
          const other =
            role === 'client' ? row.bid.attorney_id : row.case.client_id;
          await this.notify(tx, other, user.sub, row, 'deal_record_sign');
        }
      });
    } catch (error) {
      const translated = await this.acceptance.translateAcceptError(
        row.bid_id,
        error,
      );
      if (translated !== error) {
        // The attorney is no longer eligible: the record cannot be sealed.
        await this.markFailed(id, 'awaiting_signatures', 'attorney_inactive');
      }
      throw translated;
    }
    if (accepted) {
      const result = accepted as { case_id: string };
      await this.acceptance.afterAccept(
        result,
        row.accepted_by,
        row.initiator_id,
        chat,
      );
      try {
        await this.runner.enqueue(id, row.case_id, 'sealed');
      } catch (error) {
        await this.markFailed(
          id,
          'sealing',
          `enqueue: ${(error as Error).message}`,
        );
      }
    }
    return this.toDto(await this.load(id), user);
  }

  // --------------------------------------------------------------- decline

  async decline(
    user: RequestUser,
    id: string,
    dto: DeclineDealRecordDto,
  ): Promise<DealRecordDto> {
    await this.assertEnabled();
    const row = await this.load(id);
    const role = partyOf(user, {
      client_id: row.case.client_id,
      attorney_id: row.bid.attorney_id,
    });
    dealRecordTransition(row.status, 'decline');
    const reason = dto.reason?.trim().slice(0, 300) || null;
    await withTxRetry(this.prisma, async (tx) => {
      const won = await tx.dealRecord.updateMany({
        where: { id, status: { in: ['preparing', 'awaiting_signatures'] } },
        data: {
          status: 'declined',
          declined_by: user.sub,
          decline_reason: reason,
          declined_at: new Date(),
        },
      });
      if (won.count === 0) throw invalidDealRecordState('decline', row.status);
      if (row.sign_request_id) {
        await tx.caseSignRequest.updateMany({
          where: { id: row.sign_request_id, status: 'pending' },
          data: {
            status: 'declined',
            declined_by: user.sub,
            decline_reason: reason,
          },
        });
      }
      await this.journal.append(tx, {
        caseId: row.case_id,
        clientId: row.case.client_id,
        actor: { userId: user.sub, role },
        attorneyId: row.bid.attorney_id,
        event: 'signature_declined',
        payload: { dealRecordId: id, role, reason },
      });
      const other =
        role === 'client' ? row.bid.attorney_id : row.case.client_id;
      await this.notify(tx, other, user.sub, row, 'deal_record_declined');
    });
    return this.toDto(await this.load(id), user);
  }

  // ------------------------------------------------------------- agreement

  /** The attorney links their own agreement PDF to a sealed record. */
  async attachAgreement(
    user: RequestUser,
    id: string,
    dto: AttachAgreementDto,
  ): Promise<DealRecordDto> {
    await this.assertEnabled();
    const row = await this.load(id);
    const role = partyOf(user, {
      client_id: row.case.client_id,
      attorney_id: row.bid.attorney_id,
    });
    if (role !== 'attorney') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the attorney attaches their agreement.',
      });
    }
    if (row.status !== 'sealed') {
      throw invalidDealRecordState(
        'sealed',
        row.status,
        'The record is not sealed yet.',
      );
    }
    const file = await this.files.assertAttachable(user.sub, dto.fileId, [
      'case_attachment',
    ]);
    if (file.mime !== 'application/pdf') {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'The agreement must be a PDF.',
        details: { fields: ['fileId'] },
      });
    }
    await withTxRetry(this.prisma, async (tx) => {
      await tx.dealRecord.update({
        where: { id },
        data: { agreement_file_id: file.id },
      });
      const linked = await tx.casePhoto.findFirst({
        where: { case_id: row.case_id, file_id: file.id },
        select: { id: true },
      });
      if (!linked) {
        await this.runner.linkFile(
          tx,
          row.case_id,
          file.id,
          user.sub,
          "Attorney's agreement",
        );
      }
    });
    return this.toDto(await this.load(id), user);
  }

  // --------------------------------------------------------------- helpers

  private async load(id: string): Promise<RecordRow> {
    const row = await this.prisma.dealRecord.findUnique({
      where: { id },
      include: RECORD_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Deal record not found.',
      });
    }
    return row;
  }

  private async markFailed(
    id: string,
    from: DealRecord['status'],
    reason: string,
  ) {
    await this.prisma.dealRecord
      .updateMany({
        where: { id, status: from },
        data: { status: 'failed', failed_reason: reason.slice(0, 300) },
      })
      .catch(() => undefined);
  }

  private async notify(
    tx: Prisma.TransactionClient,
    recipientId: string,
    actorId: string,
    row: { id: string; case_id: string },
    kind: DealRecordNotifyKind,
  ): Promise<void> {
    await this.notifications.emit(
      {
        type: 'case_workspace_activity',
        recipientId,
        payload: { caseId: row.case_id, actorId, kind, dealRecordId: row.id },
      },
      tx,
    );
  }

  private async toDto(
    row: RecordRow,
    user: RequestUser,
  ): Promise<DealRecordDto> {
    const s = row.snapshot as unknown as DealRecordSnapshot;
    const myRole = partyOf(user, {
      client_id: row.case.client_id,
      attorney_id: row.bid.attorney_id,
    });
    const signed = row.sign_request?.signatures ?? [];
    const ids = [
      row.unsigned_file_id,
      row.sealed_file_id,
      row.agreement_file_id,
    ].filter((x): x is string => !!x);
    const urls = new Map(
      (await this.files.casePhotoUrls(ids)).map(
        (u) => [u.fileId, u.url] as const,
      ),
    );
    return {
      id: row.id,
      caseId: row.case_id,
      bidId: row.bid_id,
      status: row.status,
      acceptedBy: row.accepted_by,
      myRole,
      myTurnToSign:
        row.status === 'awaiting_signatures' &&
        nextSigner(
          row.accepted_by,
          signed.map((x) => x.signer_role),
        ) === myRole,
      recordCode: row.record_code,
      snapshotSha256: row.snapshot_sha256,
      sealedSha256: row.sealed_sha256,
      textVersion: row.text_version,
      acceptedAt: s.acceptedAt,
      case: {
        title: s.case.title,
        practice: s.case.practice,
        states: s.case.states,
      },
      client: {
        fullName: s.client.fullName,
        email: s.client.email,
        username: s.client.username,
      },
      attorney: {
        fullName: s.attorney.fullName,
        email: s.attorney.email,
        username: s.attorney.username,
        barState: s.attorney.barState,
        barNumber: s.attorney.barNumber,
        firmName: s.attorney.firmName,
      },
      terms: {
        feeType: s.terms.feeType,
        amountCents: s.terms.amountCents,
        percentBps: s.terms.percentBps,
        paymentTerms: s.terms.paymentTerms,
      },
      history: s.history.map((o) => ({
        roundNo: o.roundNo,
        fromRole: o.fromRole,
        createdAt: o.createdAt,
        feeType: o.feeType,
        amountCents: o.amountCents,
        percentBps: o.percentBps,
        paymentTerms: o.paymentTerms,
        message: o.message,
        status: o.status,
      })),
      notContractText: s.texts.notContract,
      footerText: s.texts.footer,
      signatures: signed.map((x) => ({
        role: x.signer_role as PartyRole,
        name: x.signed_name,
        signedAt: x.signed_at.toISOString(),
      })),
      unsignedUrl: row.unsigned_file_id
        ? (urls.get(row.unsigned_file_id) ?? null)
        : null,
      sealedUrl: row.sealed_file_id
        ? (urls.get(row.sealed_file_id) ?? null)
        : null,
      sealedFileId: row.sealed_file_id,
      unsignedFileId: row.unsigned_file_id,
      agreementFileId: row.agreement_file_id,
      agreementUrl: row.agreement_file_id
        ? (urls.get(row.agreement_file_id) ?? null)
        : null,
      declineReason: row.decline_reason,
      failedReason: row.failed_reason,
      createdAt: row.created_at.toISOString(),
      sealedAt: row.sealed_at?.toISOString() ?? null,
      declinedAt: row.declined_at?.toISOString() ?? null,
    };
  }
}

/** Which party the caller is; anyone else is 404 (deny by default). */
export function partyOf(
  user: RequestUser,
  ids: { client_id: string; attorney_id: string },
): PartyRole {
  if (user.role === 'client' && ids.client_id === user.sub) return 'client';
  if (user.role === 'attorney' && ids.attorney_id === user.sub)
    return 'attorney';
  throw bidNotFound();
}
