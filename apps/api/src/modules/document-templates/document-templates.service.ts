import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type DocumentTemplate,
  type File,
  type PracticeArea,
} from '@prisma/client';
import type Redis from 'ioredis';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { US_STATES } from '../../common/reference-data/us-states';
import { EXTRA_REGIONS } from '../../common/reference-data/countries';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { EntitlementsService } from '../plans/entitlements.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import type { FileDto, PresignedFileDto } from '../files/dto/files.dto';
import { FilesService } from '../files/files.service';
import type {
  AdminDocumentTemplateDto,
  AdminTemplateUploadDto,
  AdminTemplatesQueryDto,
  CreateDocumentTemplateDto,
  DocumentTemplateDto,
  TemplateCopyTarget,
  TemplateDownloadDto,
  TemplatesQueryDto,
  UpdateDocumentTemplateDto,
} from './document-templates.dto';

export const DOCUMENT_TEMPLATES_FLAG = 'document_templates';
const PAGE = 30;
// Owner 2026-10-05: every country's states/provinces.
const STATES = new Set([...US_STATES, ...EXTRA_REGIONS].map((s) => s.code));

export const TEMPLATE_AUDIT = {
  create: 'admin.document_template.create',
  update: 'admin.document_template.update',
  publish: 'admin.document_template.publish',
  unpublish: 'admin.document_template.unpublish',
  remove: 'admin.document_template.delete',
} as const;

type Row = DocumentTemplate & {
  file: File;
  practice_area: PracticeArea | null;
};
type Page<T> = { items: T[]; nextCursor: string | null };

/**
 * Owner 2026-10-05 — the document templates library. The admin uploads a
 * PDF / Word file (the normal presign → confirm → antivirus pipeline,
 * owned by the admin's user id), describes it (practice area, state or
 * every state, language, everyone / lawyers only) and publishes it. In
 * the app anyone signed in finds templates by search and filters,
 * downloads one (a short signed link; counted once per user a day) or —
 * one tap — copies it into their own chat / case attachment, which the
 * existing chat and case endpoints then send or attach. Behind the
 * `document_templates` flag; drafts, deleted and lawyers-only templates
 * (for clients) answer 404.
 */
@Injectable()
export class DocumentTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly flags: FeatureFlagsService,
    private readonly audit: AuditLogService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly entitlements: EntitlementsService,
  ) {}

  // --- app -----------------------------------------------------------------------

  async list(
    user: RequestUser,
    q: TemplatesQueryDto,
  ): Promise<Page<DocumentTemplateDto>> {
    await this.assertEnabled();
    const where: Prisma.DocumentTemplateWhereInput = {
      AND: [
        { is_published: true, deleted_at: null },
        isLawyer(user) ? {} : { audience: 'everyone' },
        ...filters(q),
      ],
    };
    const page = await this.page(where, q);
    const locked = !(await this.included(user));
    return { ...page, items: page.items.map((t) => publicDto(t, locked)) };
  }

  async get(user: RequestUser, id: string): Promise<DocumentTemplateDto> {
    await this.assertEnabled();
    const t = await this.visible(user, id);
    return publicDto(t, !(await this.included(user)));
  }

  /** A short signed link; one count per user per template per day. */
  async download(user: RequestUser, id: string): Promise<TemplateDownloadDto> {
    await this.assertEnabled();
    const t = await this.visible(user, id);
    await this.assertIncluded(user);
    const url = await this.files.documentTemplateUrl(t.file_id, t.file_name);
    if (!url) throw notFound();
    await this.count(user.sub, t.id);
    return {
      url,
      fileName: t.file_name,
      mime: t.file.mime,
      sizeBytes: Number(t.file.size_bytes),
    };
  }

  /** One tap "attach to a chat / case": the user's own clean copy. */
  async copy(
    user: RequestUser,
    id: string,
    target: TemplateCopyTarget,
  ): Promise<FileDto> {
    await this.assertEnabled();
    const t = await this.visible(user, id);
    await this.assertIncluded(user);
    const file = await this.files.copyForUser(t.file_id, user.sub, target);
    await this.count(user.sub, t.id);
    return file;
  }

  // --- admin ---------------------------------------------------------------------

  async adminList(
    q: AdminTemplatesQueryDto,
  ): Promise<Page<AdminDocumentTemplateDto>> {
    const where: Prisma.DocumentTemplateWhereInput = {
      AND: [
        { deleted_at: null },
        q.published === undefined ? {} : { is_published: q.published },
        ...filters(q),
      ],
    };
    const page = await this.page(where, { ...q, sort: q.sort ?? 'new' });
    return { ...page, items: page.items.map(adminDto) };
  }

  async adminGet(id: string): Promise<AdminDocumentTemplateDto> {
    return adminDto(await this.row(id));
  }

  presignUpload(
    admin: AdminActor,
    dto: AdminTemplateUploadDto,
  ): Promise<PresignedFileDto> {
    return this.files.presign(admin.id, {
      purpose: 'document_template',
      ...dto,
    });
  }

  confirmUpload(admin: AdminActor, fileId: string): Promise<FileDto> {
    return this.files.confirm(admin.id, fileId);
  }

  async create(
    admin: AdminActor,
    dto: CreateDocumentTemplateDto,
  ): Promise<AdminDocumentTemplateDto> {
    const file = await this.cleanUnusedFile(admin, dto.fileId);
    await this.checkRefs(dto.practiceAreaId, dto.state);
    const t = await withTxRetry(this.prisma, async (tx) => {
      const row = await tx.documentTemplate.create({
        data: {
          file_id: file.id,
          file_name: dto.fileName ?? defaultName(dto.title, file.mime),
          title: dto.title,
          description: dto.description ?? '',
          practice_area_id: dto.practiceAreaId ?? null,
          state: dto.state ?? null,
          language: dto.language ?? 'en',
          audience: dto.audience ?? 'everyone',
          is_published: dto.published ?? false,
          created_by: admin.id,
        },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: TEMPLATE_AUDIT.create,
          targetType: 'document_template',
          targetId: row.id,
          after: snapshot(row),
          ip: admin.ip,
        },
        tx,
      );
      return row;
    });
    return this.adminGet(t.id);
  }

  async update(
    admin: AdminActor,
    id: string,
    dto: UpdateDocumentTemplateDto,
  ): Promise<AdminDocumentTemplateDto> {
    const before = await this.row(id);
    const file =
      dto.fileId && dto.fileId !== before.file_id
        ? await this.cleanUnusedFile(admin, dto.fileId)
        : null;
    await this.checkRefs(dto.practiceAreaId, dto.state);
    const data: Prisma.DocumentTemplateUncheckedUpdateInput = {};
    if (file) {
      data.file_id = file.id;
      if (dto.fileName === undefined) {
        data.file_name = withExt(before.file_name, file.mime);
      }
    }
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.fileName !== undefined) data.file_name = dto.fileName;
    if (dto.practiceAreaId !== undefined) {
      data.practice_area_id = dto.practiceAreaId;
    }
    if (dto.state !== undefined) data.state = dto.state;
    if (dto.language !== undefined) data.language = dto.language;
    if (dto.audience !== undefined) data.audience = dto.audience;
    if (dto.published !== undefined) data.is_published = dto.published;
    await withTxRetry(this.prisma, async (tx) => {
      const row = await tx.documentTemplate.update({ where: { id }, data });
      await this.audit.record(
        {
          adminId: admin.id,
          action: TEMPLATE_AUDIT.update,
          targetType: 'document_template',
          targetId: id,
          before: snapshot(before),
          after: snapshot(row),
          ip: admin.ip,
        },
        tx,
      );
    });
    return this.adminGet(id);
  }

  async setPublished(
    admin: AdminActor,
    id: string,
    published: boolean,
  ): Promise<AdminDocumentTemplateDto> {
    const before = await this.row(id);
    if (before.is_published === published) {
      throw new ConflictException({
        code: ErrorCode.CONTENT_INVALID_STATE,
        message: published ? 'Already published.' : 'Already a draft.',
      });
    }
    await withTxRetry(this.prisma, async (tx) => {
      await tx.documentTemplate.update({
        where: { id },
        data: { is_published: published },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: published ? TEMPLATE_AUDIT.publish : TEMPLATE_AUDIT.unpublish,
          targetType: 'document_template',
          targetId: id,
          before: { published: before.is_published },
          after: { published },
          ip: admin.ip,
        },
        tx,
      );
    });
    return this.adminGet(id);
  }

  /** Soft delete: the app stops showing it; copies users made stay. */
  async remove(admin: AdminActor, id: string): Promise<void> {
    const before = await this.row(id);
    await withTxRetry(this.prisma, async (tx) => {
      await tx.documentTemplate.update({
        where: { id },
        data: { deleted_at: new Date(), is_published: false },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: TEMPLATE_AUDIT.remove,
          targetType: 'document_template',
          targetId: id,
          before: snapshot(before),
          ip: admin.ip,
        },
        tx,
      );
    });
  }

  // --- helpers -------------------------------------------------------------------

  private async assertEnabled(): Promise<void> {
    if (!(await this.flags.isEnabled(DOCUMENT_TEMPLATES_FLAG, true))) {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'Document templates are not available.',
      });
    }
  }

  /** Owner 2026-10-05 (plan builder): the plan's "document templates"
   * term. Browsing stays open (the app shows a lock and the plans);
   * downloading and attaching need it. */
  private async included(user: RequestUser): Promise<boolean> {
    return this.entitlements.has(user.sub, 'document_templates');
  }

  private async assertIncluded(user: RequestUser): Promise<void> {
    if (!(await this.included(user))) {
      throw new ForbiddenException({
        code: ErrorCode.ENTITLEMENT_REQUIRED,
        message: 'Your plan does not include document templates.',
      });
    }
  }

  private async visible(user: RequestUser, id: string): Promise<Row> {
    const t = await this.prisma.documentTemplate.findFirst({
      where: { id, is_published: true, deleted_at: null },
      include: { file: true, practice_area: true },
    });
    if (!t || (t.audience === 'lawyers' && !isLawyer(user))) {
      throw notFound();
    }
    return t;
  }

  private async row(id: string): Promise<Row> {
    const t = await this.prisma.documentTemplate.findFirst({
      where: { id, deleted_at: null },
      include: { file: true, practice_area: true },
    });
    if (!t) throw notFound();
    return t;
  }

  private async page(
    where: Prisma.DocumentTemplateWhereInput,
    q: TemplatesQueryDto,
  ): Promise<Page<Row>> {
    const offset = decodeOffset(q.cursor);
    const orderBy: Prisma.DocumentTemplateOrderByWithRelationInput[] =
      q.sort === 'new'
        ? [{ created_at: 'desc' }, { id: 'desc' }]
        : [{ download_count: 'desc' }, { created_at: 'desc' }, { id: 'desc' }];
    const rows = await this.prisma.documentTemplate.findMany({
      where,
      orderBy,
      skip: offset,
      take: PAGE + 1,
      include: { file: true, practice_area: true },
    });
    return {
      items: rows.slice(0, PAGE),
      nextCursor: rows.length > PAGE ? encodeOffset(offset + PAGE) : null,
    };
  }

  private async cleanUnusedFile(
    admin: AdminActor,
    fileId: string,
  ): Promise<File> {
    const file = await this.files.assertAttachable(admin.id, fileId, [
      'document_template',
    ]);
    const used = await this.prisma.documentTemplate.findUnique({
      where: { file_id: fileId },
      select: { id: true },
    });
    if (used) {
      throw new ConflictException({
        code: ErrorCode.FILE_NOT_ATTACHABLE,
        message: 'This file is already a template.',
      });
    }
    return file;
  }

  private async checkRefs(
    practiceAreaId: string | null | undefined,
    state: string | null | undefined,
  ): Promise<void> {
    if (state && !STATES.has(state)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Unknown state.',
        details: { state },
      });
    }
    if (practiceAreaId) {
      const pa = await this.prisma.practiceArea.findUnique({
        where: { id: practiceAreaId },
        select: { id: true },
      });
      if (!pa) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Unknown practice area.',
          details: { practiceAreaId },
        });
      }
    }
  }

  private async count(userId: string, templateId: string): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    const first = await this.redis.set(
      `templates:dl:${templateId}:${userId}:${day}`,
      '1',
      'EX',
      26 * 3600,
      'NX',
    );
    if (first !== 'OK') return;
    await this.prisma.documentTemplate.update({
      where: { id: templateId },
      data: { download_count: { increment: 1 } },
    });
  }
}

/** Attorneys and the assistants working in an attorney's account. */
function isLawyer(user: RequestUser): boolean {
  return user.role === 'attorney' || user.assistant !== undefined;
}

function filters(q: TemplatesQueryDto): Prisma.DocumentTemplateWhereInput[] {
  const and: Prisma.DocumentTemplateWhereInput[] = [];
  if (q.q) {
    and.push({
      OR: [
        { title: { contains: q.q, mode: 'insensitive' } },
        { description: { contains: q.q, mode: 'insensitive' } },
      ],
    });
  }
  if (q.practiceAreaId) {
    and.push({
      OR: [
        { practice_area_id: q.practiceAreaId },
        { practice_area: { parent_id: q.practiceAreaId } },
      ],
    });
  }
  if (q.state) and.push({ OR: [{ state: q.state }, { state: null }] });
  if (q.language) and.push({ language: q.language });
  return and;
}

function publicDto(t: Row, locked = false): DocumentTemplateDto {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    fileName: t.file_name,
    mime: t.file.mime,
    sizeBytes: Number(t.file.size_bytes),
    practiceAreaId: t.practice_area_id,
    practiceAreaKey: t.practice_area?.i18n_key ?? null,
    practiceAreaName: t.practice_area?.name_en ?? null,
    state: t.state,
    language: t.language,
    audience: t.audience,
    downloadCount: Math.max(0, t.download_count),
    updatedAt: t.updated_at.toISOString(),
    locked,
  };
}

function adminDto(t: Row): AdminDocumentTemplateDto {
  return {
    ...publicDto(t),
    fileId: t.file_id,
    published: t.is_published,
    createdAt: t.created_at.toISOString(),
  };
}

function snapshot(t: DocumentTemplate): Prisma.InputJsonObject {
  return {
    title: t.title,
    fileId: t.file_id,
    fileName: t.file_name,
    practiceAreaId: t.practice_area_id,
    state: t.state,
    language: t.language,
    audience: t.audience,
    published: t.is_published,
  };
}

const EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
};

function defaultName(title: string, mime: string): string {
  const base =
    title
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 150) || 'template';
  return `${base}.${EXT[mime] ?? 'pdf'}`;
}

function withExt(name: string, mime: string): string {
  const base = name.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  return `${base}.${EXT[mime] ?? 'pdf'}`;
}

function encodeOffset(n: number): string {
  return Buffer.from(`o:${n}`).toString('base64url');
}

function decodeOffset(cursor?: string): number {
  if (!cursor) return 0;
  const m = /^o:(\d{1,6})$/.exec(
    Buffer.from(cursor, 'base64url').toString('utf8'),
  );
  if (!m) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Invalid cursor.',
    });
  }
  return Number(m[1]);
}

function notFound() {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Template not found.',
  });
}
