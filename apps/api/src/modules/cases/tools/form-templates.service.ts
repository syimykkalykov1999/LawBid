import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import { AuditLogService } from '../../admin-access/audit-log.service';
import type { AdminActor } from '../../admin-auth/admin-auth.decorators';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';
import { FilesService } from '../../files/files.service';
import { CaseWorkspaceService } from '../workspace/case-workspace.service';
import { CaseToolsSupport } from './case-tools.support';
import { renderDocumentPdf } from './document.pdf';
import type {
  AdminFormTemplateDto,
  BuildDocumentDto,
  BuiltDocumentDto,
  CaseFormTemplatesDto,
  CreateFormTemplateDto,
  FormFieldDto,
  FormTemplateDto,
  UpdateFormTemplateDto,
} from './form-templates.dto';
import {
  renderBody,
  templateErrors,
  valueErrors,
  type TemplateField,
} from './form-template.logic';

type Row = Prisma.FormTemplateGetPayload<object>;

const invalid = (
  message: string,
  details?: Record<string, unknown>,
): BadRequestException =>
  new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    ...(details ? { details } : {}),
  });

const notFound = (): NotFoundException =>
  new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Template not found.',
  });

const asMap = (v: Prisma.JsonValue): Record<string, string> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, string>)
    : {};

const asFields = (v: Prisma.JsonValue): FormFieldDto[] =>
  Array.isArray(v) ? (v as unknown as FormFieldDto[]) : [];

/** Today as the attorney's form prefill: a calendar date. */
const todayText = (now: Date): string => now.toISOString().slice(0, 10);

/**
 * Owner 2026-10-20: documents from templates. The admin keeps the
 * templates (a body with {{key}} places per language, and the fields the
 * attorney is asked); the attorney picks one in a case, fills the form and
 * gets a PDF in the case's files. No AI: the text is the admin's, the
 * values are the attorney's.
 */
@Injectable()
export class FormTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ws: CaseWorkspaceService,
    private readonly files: FilesService,
    private readonly support: CaseToolsSupport,
    private readonly audit: AuditLogService,
  ) {}

  // ---- attorney ------------------------------------------------------

  async listForCase(
    user: RequestUser,
    caseId: string,
  ): Promise<CaseFormTemplatesDto> {
    const s = await this.ws.side(user, caseId);
    const [rows, names, kase] = await Promise.all([
      this.prisma.formTemplate.findMany({
        where: { is_published: true, deleted_at: null },
        orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
      }),
      this.support.namesOf([s.attorneyId, s.clientId]),
      this.prisma.case.findUniqueOrThrow({
        where: { id: caseId },
        select: { title: true },
      }),
    ]);
    return {
      prefill: {
        today: todayText(new Date()),
        attorney_name: names.get(s.attorneyId) ?? '',
        client_name: names.get(s.clientId) ?? '',
        case_title: kase.title,
      },
      templates: rows.map((r) => this.dto(r)),
    };
  }

  async build(
    user: RequestUser,
    caseId: string,
    dto: BuildDocumentDto,
  ): Promise<BuiltDocumentDto> {
    const s = await this.ws.side(user, caseId, 'write');
    if (s.role !== 'attorney') {
      throw invalid('Only the attorney builds documents from templates.');
    }
    const t = await this.prisma.formTemplate.findFirst({
      where: { id: dto.templateId, is_published: true, deleted_at: null },
    });
    if (!t) throw notFound();
    const body = asMap(t.body)[dto.language];
    if (!body) {
      throw invalid('The template has no text in this language.', {
        field: 'language',
      });
    }
    const fields = asFields(t.fields) as TemplateField[];
    const values: Record<string, string> = {};
    for (const f of fields) {
      const v = dto.values[f.key];
      values[f.key] = typeof v === 'string' ? v.trim() : '';
    }
    const bad = valueErrors(fields, values);
    if (bad.length) {
      throw invalid('Some answers are missing or wrong.', { fields: bad });
    }
    const title = asMap(t.title)[dto.language] ?? asMap(t.title).en ?? t.slug;
    const pdf = await renderDocumentPdf({
      title,
      text: renderBody(body, values),
    });
    const file = await this.files.storeGenerated(
      s.attorneyId,
      'case_attachment',
      pdf,
      'application/pdf',
    );
    await withTxRetry(this.prisma, (tx) =>
      this.support.linkFile(tx, caseId, file.id, s.attorneyId, title),
    );
    const [u] = await this.files.casePhotoUrls([file.id]);
    return { fileId: file.id, title, url: u?.url ?? null };
  }

  // ---- admin ---------------------------------------------------------

  async adminList(): Promise<AdminFormTemplateDto[]> {
    const rows = await this.prisma.formTemplate.findMany({
      where: { deleted_at: null },
      orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
    });
    return rows.map((r) => this.adminDto(r));
  }

  async adminGet(id: string): Promise<AdminFormTemplateDto> {
    const r = await this.prisma.formTemplate.findFirst({
      where: { id, deleted_at: null },
    });
    if (!r) throw notFound();
    return this.adminDto(r);
  }

  async create(
    admin: AdminActor,
    dto: CreateFormTemplateDto,
  ): Promise<AdminFormTemplateDto> {
    const errors = templateErrors(dto);
    if (errors.length) throw invalid(errors[0], { errors });
    if (
      await this.prisma.formTemplate.findUnique({ where: { slug: dto.slug } })
    ) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'A template with this slug already exists.',
        details: { field: 'slug' },
      });
    }
    const row = await withTxRetry(this.prisma, async (tx) => {
      const r = await tx.formTemplate.create({
        data: {
          slug: dto.slug,
          title: dto.title,
          description: dto.description ?? {},
          body: dto.body,
          fields: dto.fields as unknown as Prisma.InputJsonArray,
          practice_area_id: dto.practiceAreaId ?? null,
          position: dto.position ?? 0,
          is_published: dto.published ?? false,
          created_by: admin.id,
        },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: 'admin.form_template.create',
          targetType: 'form_template',
          targetId: r.id,
          after: { slug: r.slug, published: r.is_published },
          ip: admin.ip,
        },
        tx,
      );
      return r;
    });
    return this.adminDto(row);
  }

  async update(
    admin: AdminActor,
    id: string,
    dto: UpdateFormTemplateDto,
  ): Promise<AdminFormTemplateDto> {
    const before = await this.prisma.formTemplate.findFirst({
      where: { id, deleted_at: null },
    });
    if (!before) throw notFound();
    const merged = {
      title: dto.title ?? before.title,
      body: dto.body ?? before.body,
      fields: dto.fields ?? before.fields,
    };
    const errors = templateErrors(merged);
    if (errors.length) throw invalid(errors[0], { errors });
    const row = await withTxRetry(this.prisma, async (tx) => {
      const r = await tx.formTemplate.update({
        where: { id },
        data: {
          ...(dto.title ? { title: dto.title } : {}),
          ...(dto.description ? { description: dto.description } : {}),
          ...(dto.body ? { body: dto.body } : {}),
          ...(dto.fields
            ? { fields: dto.fields as unknown as Prisma.InputJsonArray }
            : {}),
          ...(dto.practiceAreaId !== undefined
            ? { practice_area_id: dto.practiceAreaId }
            : {}),
          ...(dto.position !== undefined ? { position: dto.position } : {}),
          ...(dto.published !== undefined
            ? { is_published: dto.published }
            : {}),
        },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: 'admin.form_template.update',
          targetType: 'form_template',
          targetId: id,
          before: { published: before.is_published },
          after: { published: r.is_published },
          ip: admin.ip,
        },
        tx,
      );
      return r;
    });
    return this.adminDto(row);
  }

  async remove(admin: AdminActor, id: string): Promise<void> {
    const before = await this.prisma.formTemplate.findFirst({
      where: { id, deleted_at: null },
    });
    if (!before) throw notFound();
    await withTxRetry(this.prisma, async (tx) => {
      await tx.formTemplate.update({
        where: { id },
        data: { deleted_at: new Date(), is_published: false },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: 'admin.form_template.delete',
          targetType: 'form_template',
          targetId: id,
          before: { slug: before.slug },
          ip: admin.ip,
        },
        tx,
      );
    });
  }

  // ---- presenting ----------------------------------------------------

  private dto(r: Row): FormTemplateDto {
    return {
      id: r.id,
      slug: r.slug,
      title: asMap(r.title),
      description: asMap(r.description),
      languages: Object.keys(asMap(r.body)),
      fields: asFields(r.fields),
    };
  }

  private adminDto(r: Row): AdminFormTemplateDto {
    return {
      id: r.id,
      slug: r.slug,
      title: asMap(r.title),
      description: asMap(r.description),
      body: asMap(r.body),
      fields: asFields(r.fields),
      practiceAreaId: r.practice_area_id,
      position: r.position,
      published: r.is_published,
      updatedAt: r.updated_at.toISOString(),
    };
  }
}
