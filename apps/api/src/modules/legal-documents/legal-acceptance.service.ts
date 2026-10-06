import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { ConsentType, LegalDocType } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import {
  docLocaleOf,
  isAcceptableDocType,
  LEGACY_ACCEPTED_TYPES,
  requiredDocTypes,
  titleOf,
} from './legal-documents.constants';
import { computePending, type PendingItem } from './legal-documents.logic';

export interface PendingLegalDocument {
  id: string;
  docType: LegalDocType;
  locale: string;
  version: string;
  title: string;
  /** `new` — never accepted; `updated` — a material change since. */
  reason: 'new' | 'updated';
  publishedAt: string | null;
}

export interface AcceptMeta {
  ip: string | null;
  deviceId?: string | null;
}

/**
 * Owner 2026-10-05 (legal documents): which legal documents a user still
 * has to accept at their current version, and recording the acceptance
 * (an append-only `user_consents` row with the document id, IP and
 * device). Used by `GET /users/me`, the acceptance endpoint, onboarding
 * and the guard on key actions (publish a case, place a bid).
 */
@Injectable()
export class LegalAcceptanceService {
  private readonly logger = new Logger(LegalAcceptanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** What this user must accept now (their role's documents). */
  async pending(userId: string): Promise<PendingLegalDocument[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, ui_language: true },
    });
    if (!user) return [];
    return this.pendingFor(
      userId,
      requiredDocTypes(user.role),
      docLocaleOf(user.ui_language),
    );
  }

  async pendingFor(
    userId: string,
    types: readonly LegalDocType[],
    locale: string,
  ): Promise<PendingLegalDocument[]> {
    if (types.length === 0) return [];
    const consentTypes = types.filter(isAcceptableDocType) as ConsentType[];
    // Only acceptable types have a consent (the others are read-only).
    let rows;
    try {
      rows = await this.loadRows(userId, types, consentTypes);
    } catch (e) {
      // A CockroachDB enum value added by a migration is unusable until its
      // schema change finishes («enum value is not yet public»); on a
      // damaged restore that never happens. Everyone's /users/me would 500,
      // so treat it as "nothing to accept" and say so in the log.
      if (!String((e as Error)?.message).includes('is not yet public')) throw e;
      this.logger.warn('legal documents skipped: enum value not yet public');
      return [];
    }
    const { docs, consents } = rows;
    return computePending({
      types,
      locale,
      docs: docs,
      consents: consents,
    }).map((p) => present(p));
  }

  private async loadRows(
    userId: string,
    types: readonly LegalDocType[],
    consentTypes: ConsentType[],
  ) {
    const [docs, consents] = await Promise.all([
      this.prisma.legalDocument.findMany({
        where: {
          doc_type: { in: [...types] },
          status: { in: ['published', 'archived'] },
        },
        select: {
          id: true,
          doc_type: true,
          locale: true,
          version: true,
          published_at: true,
          is_current: true,
          requires_reacceptance: true,
        },
      }),
      this.prisma.userConsent.findMany({
        where: {
          user_id: userId,
          consent_type: { in: consentTypes },
        },
        orderBy: { created_at: 'desc' },
        distinct: ['consent_type'],
        select: {
          consent_type: true,
          granted: true,
          document: { select: { id: true, published_at: true } },
        },
      }),
    ]);
    return { docs, consents };
  }

  /** Throws LEGAL_REACCEPT_REQUIRED while something is pending. */
  async assertAccepted(userId: string): Promise<void> {
    // Terms / privacy / disclaimer are first accepted at onboarding, so a
    // missing first acceptance of those is not this guard's business (only a
    // material update is); a brand-new document type still blocks.
    const pending = (await this.pending(userId)).filter(
      (p) => !(p.reason === 'new' && LEGACY_ACCEPTED_TYPES.has(p.docType)),
    );
    if (pending.length === 0) return;
    throw new ForbiddenException({
      code: ErrorCode.LEGAL_REACCEPT_REQUIRED,
      message: 'Accept the updated legal documents to continue.',
      details: { documents: pending.map((p) => p.docType) },
    });
  }

  /**
   * POST /legal/accept — the user ticked these documents. Each id must be
   * the current version of an acceptable type; a consent row is appended
   * per document. Returns what is still pending.
   */
  async accept(
    userId: string,
    documentIds: readonly string[],
    meta: AcceptMeta,
  ): Promise<PendingLegalDocument[]> {
    const ids = [...new Set(documentIds)];
    const docs = await this.prisma.legalDocument.findMany({
      where: { id: { in: ids } },
      select: { id: true, doc_type: true, is_current: true },
    });
    const bad =
      docs.length !== ids.length ||
      docs.some((d) => !d.is_current || !isAcceptableDocType(d.doc_type));
    if (bad) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          'Only the current version of a document that can be accepted may be sent.',
        details: { field: 'documentIds' },
      });
    }
    await this.prisma.userConsent.createMany({
      data: docs.map((d) => ({
        user_id: userId,
        consent_type: d.doc_type as never,
        document_id: d.id,
        granted: true,
        ip: meta.ip,
        device_id: meta.deviceId ?? null,
      })),
    });
    return this.pending(userId);
  }
}

function present(p: PendingItem): PendingLegalDocument {
  return {
    id: p.doc.id,
    docType: p.doc.doc_type,
    locale: p.doc.locale,
    version: p.doc.version,
    title: titleOf(p.doc.doc_type, p.doc.locale),
    reason: p.reason,
    publishedAt: p.doc.published_at?.toISOString() ?? null,
  };
}
