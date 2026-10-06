import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type LegalDocType, type LegalDocument } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { BootstrapService } from '../feature-flags/services/bootstrap.service';
import {
  DRAFT_VERSION,
  LEGAL_DOC_TITLES,
  LEGAL_DOC_TYPE_LIST,
  LEGAL_LOCALES,
  titleOf,
} from './legal-documents.constants';
import type {
  AdminLegalDocumentDetailDto,
  AdminLegalDocumentRowDto,
  AdminLegalLocaleStateDto,
  AdminLegalVersionDto,
  LegalDocumentBriefDto,
  LegalDocumentPublicDto,
  PublishLegalDto,
  SaveLegalDraftDto,
} from './legal-documents.dto';
import { nextVersion } from './legal-documents.logic';

export const LEGAL_DOCS_AUDIT = {
  draft: 'legal.document.draft',
  discard: 'legal.document.discard_draft',
  publish: 'legal.document.publish',
  rollback: 'legal.document.rollback',
} as const;

type Row = LegalDocument & { _count?: { consents: number } };

const notFound = (what: string) =>
  new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: `${what} not found.`,
  });

const invalidState = (message: string) =>
  new ConflictException({
    code: ErrorCode.LEGAL_DOCUMENT_INVALID_STATE,
    message,
  });

/**
 * Owner 2026-10-05 (legal documents): the one place where every legal text
 * is edited. Per type and language there is at most one draft (version
 * `draft`), the current published version and the archived ones. Publishing
 * turns the draft into the next version (`2026-10-05.1`) and archives the
 * previous one; a rollback publishes an old version's text as a new one.
 * Nothing is ever deleted except a draft.
 */
@Injectable()
export class LegalDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly bootstrap: BootstrapService,
  ) {}

  // ---- public ------------------------------------------------------------

  /** GET /legal/documents — what is current, without the texts. */
  async listCurrent(): Promise<LegalDocumentBriefDto[]> {
    const rows = await this.prisma.legalDocument.findMany({
      where: { is_current: true, status: 'published' },
      select: {
        id: true,
        doc_type: true,
        locale: true,
        version: true,
        published_at: true,
      },
    });
    const order = (t: string) => LEGAL_DOC_TYPE_LIST.indexOf(t as never);
    return rows
      .sort(
        (a, b) =>
          order(a.doc_type) - order(b.doc_type) ||
          a.locale.localeCompare(b.locale),
      )
      .map((r) => brief(r));
  }

  /** GET /legal/documents/:type?locale= — current text, English as the
   * fallback. */
  async currentText(
    type: LegalDocType,
    locale: string | undefined,
  ): Promise<LegalDocumentPublicDto> {
    const rows = await this.prisma.legalDocument.findMany({
      where: { doc_type: type, is_current: true, status: 'published' },
    });
    const row =
      rows.find((r) => r.locale === locale) ??
      rows.find((r) => r.locale === 'en') ??
      rows[0];
    if (!row) throw notFound('Legal document');
    return {
      ...brief(row),
      contentMd: row.content_md ?? '',
      requiresReacceptance: row.requires_reacceptance,
    };
  }

  // ---- admin: read ---------------------------------------------------------

  async list(): Promise<AdminLegalDocumentRowDto[]> {
    const rows = await this.prisma.legalDocument.findMany({
      where: { status: { in: ['draft', 'published'] } },
      select: {
        doc_type: true,
        locale: true,
        version: true,
        status: true,
        is_current: true,
        published_at: true,
        updated_at: true,
      },
    });
    return LEGAL_DOC_TYPE_LIST.map((docType) => ({
      docType,
      titleEn: LEGAL_DOC_TITLES[docType].en,
      titleRu: LEGAL_DOC_TITLES[docType].ru,
      locales: LEGAL_LOCALES.map((locale): AdminLegalLocaleStateDto => {
        const mine = rows.filter(
          (r) => r.doc_type === docType && r.locale === locale,
        );
        const current = mine.find((r) => r.is_current);
        const draft = mine.find((r) => r.status === 'draft');
        return {
          locale,
          currentVersion: current?.version ?? null,
          publishedAt: current?.published_at?.toISOString() ?? null,
          hasDraft: Boolean(draft),
          draftUpdatedAt: draft?.updated_at.toISOString() ?? null,
          state: current
            ? draft
              ? 'published_draft'
              : 'published'
            : draft
              ? 'draft'
              : 'none',
        };
      }),
    }));
  }

  async detail(type: LegalDocType): Promise<AdminLegalDocumentDetailDto> {
    const rows = await this.prisma.legalDocument.findMany({
      where: {
        doc_type: type,
        OR: [{ status: 'draft' }, { is_current: true }],
      },
      include: { _count: { select: { consents: true } } },
    });
    const names = await this.adminNames(rows);
    return {
      docType: type,
      titleEn: LEGAL_DOC_TITLES[type].en,
      titleRu: LEGAL_DOC_TITLES[type].ru,
      locales: LEGAL_LOCALES.map((locale) => {
        const mine = rows.filter((r) => r.locale === locale);
        const current = mine.find((r) => r.is_current);
        const draft = mine.find((r) => r.status === 'draft');
        return {
          locale,
          current: current ? this.version(current, names, true) : null,
          draft: draft ? this.version(draft, names, true) : null,
        };
      }),
    };
  }

  /** Published and archived versions, newest first, without the texts. */
  async history(
    type: LegalDocType,
    locale: string,
  ): Promise<AdminLegalVersionDto[]> {
    const rows = await this.prisma.legalDocument.findMany({
      where: {
        doc_type: type,
        locale,
        status: { in: ['published', 'archived'] },
      },
      orderBy: [{ published_at: 'desc' }, { created_at: 'desc' }],
      include: { _count: { select: { consents: true } } },
    });
    const names = await this.adminNames(rows);
    return rows.map((r) => this.version(r, names, false));
  }

  async versionById(id: string): Promise<AdminLegalVersionDto> {
    const row = await this.prisma.legalDocument.findUnique({
      where: { id },
      include: { _count: { select: { consents: true } } },
    });
    if (!row) throw notFound('Legal document version');
    return this.version(row, await this.adminNames([row]), true);
  }

  // ---- admin: write --------------------------------------------------------

  /** Creates or replaces the draft of a type + language. */
  async saveDraft(
    admin: AdminActor,
    type: LegalDocType,
    locale: string,
    dto: SaveLegalDraftDto,
  ): Promise<AdminLegalVersionDto> {
    const row = await withTxRetry(this.prisma, async (tx) => {
      const existing = await tx.legalDocument.findFirst({
        where: { doc_type: type, locale, status: 'draft' },
      });
      const data = {
        content_md: dto.contentMd,
        content_url: null,
        changed_by: admin.id,
        change_note: dto.changeNote ?? null,
      };
      const saved = existing
        ? await tx.legalDocument.update({ where: { id: existing.id }, data })
        : await tx.legalDocument.create({
            data: {
              ...data,
              doc_type: type,
              locale,
              version: DRAFT_VERSION,
              status: 'draft',
              is_current: false,
              created_by: admin.id,
            },
          });
      await this.audit.record(
        {
          adminId: admin.id,
          action: LEGAL_DOCS_AUDIT.draft,
          targetType: 'legal_document',
          targetId: saved.id,
          before: existing
            ? { length: existing.content_md?.length ?? 0 }
            : undefined,
          after: {
            docType: type,
            locale,
            length: dto.contentMd.length,
            changeNote: dto.changeNote ?? null,
          },
          ip: admin.ip,
        },
        tx,
      );
      return saved;
    });
    return this.version(row, await this.adminNames([row]), true);
  }

  async discardDraft(
    admin: AdminActor,
    type: LegalDocType,
    locale: string,
  ): Promise<void> {
    await withTxRetry(this.prisma, async (tx) => {
      const draft = await tx.legalDocument.findFirst({
        where: { doc_type: type, locale, status: 'draft' },
      });
      if (!draft) throw notFound('Draft');
      await tx.legalDocument.delete({ where: { id: draft.id } });
      await this.audit.record(
        {
          adminId: admin.id,
          action: LEGAL_DOCS_AUDIT.discard,
          targetType: 'legal_document',
          targetId: draft.id,
          before: {
            docType: type,
            locale,
            length: draft.content_md?.length ?? 0,
          },
          ip: admin.ip,
        },
        tx,
      );
    });
  }

  /** Publishes the draft as the next version (super admin only). */
  async publish(
    admin: AdminActor,
    type: LegalDocType,
    locale: string,
    dto: PublishLegalDto,
  ): Promise<AdminLegalVersionDto> {
    const row = await withTxRetry(this.prisma, async (tx) => {
      const draft = await tx.legalDocument.findFirst({
        where: { doc_type: type, locale, status: 'draft' },
      });
      if (!draft || !draft.content_md?.trim()) {
        throw invalidState('There is no draft with text to publish.');
      }
      const current = await tx.legalDocument.findFirst({
        where: { doc_type: type, locale, is_current: true },
      });
      if (current && current.content_md === draft.content_md) {
        throw invalidState('The draft is the same as the current version.');
      }
      return this.promote(tx, admin, {
        type,
        locale,
        current,
        content: draft.content_md,
        draftId: draft.id,
        requires: dto.requiresReacceptance ?? true,
        note: dto.changeNote ?? draft.change_note,
        rollbackOfId: null,
        action: LEGAL_DOCS_AUDIT.publish,
      });
    });
    await this.bootstrap.invalidate();
    return this.version(row, await this.adminNames([row]), true);
  }

  /** Publishes an old version's text as a new version (super admin). */
  async rollback(
    admin: AdminActor,
    id: string,
    dto: PublishLegalDto,
  ): Promise<AdminLegalVersionDto> {
    const row = await withTxRetry(this.prisma, async (tx) => {
      const old = await tx.legalDocument.findUnique({ where: { id } });
      if (!old) throw notFound('Legal document version');
      if (old.status === 'draft' || !old.content_md) {
        throw invalidState('Only a published version can be rolled back to.');
      }
      if (old.is_current) {
        throw invalidState('This version is already current.');
      }
      const current = await tx.legalDocument.findFirst({
        where: { doc_type: old.doc_type, locale: old.locale, is_current: true },
      });
      return this.promote(tx, admin, {
        type: old.doc_type,
        locale: old.locale,
        current,
        content: old.content_md,
        draftId: null,
        requires: dto.requiresReacceptance ?? true,
        note: dto.changeNote ?? `Откат к версии ${old.version}`,
        rollbackOfId: old.id,
        action: LEGAL_DOCS_AUDIT.rollback,
      });
    });
    await this.bootstrap.invalidate();
    return this.version(row, await this.adminNames([row]), true);
  }

  // ---- internals -----------------------------------------------------------

  /** Makes [content] the current version: the draft row (or a new row for
   * a rollback) gets the next number, the previous current is archived. */
  private async promote(
    tx: Prisma.TransactionClient,
    admin: AdminActor,
    p: {
      type: LegalDocType;
      locale: string;
      current: LegalDocument | null;
      content: string;
      draftId: string | null;
      requires: boolean;
      note: string | null;
      rollbackOfId: string | null;
      action: string;
    },
  ): Promise<Row> {
    const now = new Date();
    const versions = await tx.legalDocument.findMany({
      where: { doc_type: p.type, locale: p.locale },
      select: { version: true },
    });
    const version = nextVersion(
      now,
      versions.map((v) => v.version),
    );
    if (p.current) {
      await tx.legalDocument.update({
        where: { id: p.current.id },
        data: { is_current: false, status: 'archived' },
      });
    }
    const data = {
      version,
      content_md: p.content,
      content_url: null,
      status: 'published',
      is_current: true,
      published_at: now,
      requires_reacceptance: p.requires,
      changed_by: admin.id,
      change_note: p.note,
      rollback_of_id: p.rollbackOfId,
    };
    const saved = p.draftId
      ? await tx.legalDocument.update({ where: { id: p.draftId }, data })
      : await tx.legalDocument.create({
          data: {
            ...data,
            doc_type: p.type,
            locale: p.locale,
            created_by: admin.id,
          },
        });
    await this.audit.record(
      {
        adminId: admin.id,
        action: p.action,
        targetType: 'legal_document',
        targetId: saved.id,
        before: {
          currentVersion: p.current?.version ?? null,
          previousId: p.current?.id ?? null,
        },
        after: {
          docType: p.type,
          locale: p.locale,
          currentVersion: version,
          requiresReacceptance: p.requires,
          changeNote: p.note,
          rollbackOfId: p.rollbackOfId,
        },
        ip: admin.ip,
      },
      tx,
    );
    return saved;
  }

  private async adminNames(
    rows: readonly { changed_by: string | null }[],
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(rows.map((r) => r.changed_by).filter((x): x is string => !!x)),
    ];
    if (ids.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, first_name: true, last_name: true, email: true },
    });
    return new Map(
      users.map((u) => [
        u.id,
        `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email || u.id,
      ]),
    );
  }

  private version(
    r: Row,
    names: Map<string, string>,
    withText: boolean,
  ): AdminLegalVersionDto {
    return {
      id: r.id,
      docType: r.doc_type,
      locale: r.locale,
      version: r.version,
      status: r.status,
      isCurrent: r.is_current,
      requiresReacceptance: r.requires_reacceptance,
      publishedAt: r.published_at?.toISOString() ?? null,
      updatedAt: r.updated_at.toISOString(),
      changeNote: r.change_note,
      changedBy: r.changed_by,
      changedByName: r.changed_by ? (names.get(r.changed_by) ?? null) : null,
      rollbackOfId: r.rollback_of_id,
      consents: r._count?.consents ?? 0,
      length: r.content_md?.length ?? 0,
      contentMd: withText ? r.content_md : null,
    };
  }
}

function brief(r: {
  id: string;
  doc_type: LegalDocType;
  locale: string;
  version: string;
  published_at: Date | null;
}): LegalDocumentBriefDto {
  return {
    id: r.id,
    docType: r.doc_type,
    locale: r.locale,
    version: r.version,
    title: titleOf(r.doc_type, r.locale),
    publishedAt: r.published_at?.toISOString() ?? null,
  };
}
