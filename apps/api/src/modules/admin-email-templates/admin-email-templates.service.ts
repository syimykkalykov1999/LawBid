import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { EmailTemplate } from '@prisma/client';
import { CostGuardService } from '../../common/cost-guard/cost-guard.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { EmailProvider } from '../auth/providers/email/email-provider.interface';
import {
  EMAIL_TEMPLATE_LOCALES,
  missingRequiredVars,
  renderEmailTemplate,
  templateVariables,
  type EmailTemplateKey,
  type EmailTemplateLocale,
  type TemplateSource,
} from '../auth/providers/email/email-template-render';
import { invalidateEmailTemplateCache } from '../auth/providers/email/email-template-overrides';
import { RateLimitService } from '../auth/services/rate-limit.service';
import type {
  EmailTemplateContentDto,
  EmailTemplateDetailDto,
  EmailTemplatePreviewDto,
  EmailTemplateSummaryDto,
  EmailTemplateTestResultDto,
  EmailTemplateVariableDto,
  RenderedEmailDto,
  SaveEmailTemplateDto,
  TestEmailTemplateDto,
} from './admin-email-templates.dto';
import {
  catalogEntry,
  EMAIL_TEMPLATE_CATALOG,
  sampleVars,
  type CatalogEntry,
} from './email-template-catalog';

export const ADMIN_TEMPLATE_EMAIL = Symbol('ADMIN_TEMPLATE_EMAIL');
const TESTS_PER_HOUR = 10;

/** Throws 400 VALIDATION_ERROR when an override drops a required var
 * (e.g. `{{code}}` of a sign-in email). */
export function assertRequiredVars(
  entry: CatalogEntry,
  src: TemplateSource,
): void {
  const missing = missingRequiredVars(entry.key, src);
  if (missing.length > 0) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: `The template must contain ${missing.map((v) => `{{${v}}}`).join(', ')} in the text${src.htmlBody?.trim() ? ' and HTML' : ''} body.`,
      details: { field: 'textBody', missing },
    });
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}***@${domain ?? ''}`;
}

/** Owner 2026-10-02 — editor of the built-in transactional emails. */
@Injectable()
export class AdminEmailTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    @Inject(ADMIN_TEMPLATE_EMAIL) private readonly email: EmailProvider,
    @Optional() private readonly costGuard?: CostGuardService,
  ) {}

  async list(): Promise<EmailTemplateSummaryDto[]> {
    const rows = await this.prisma.emailTemplate.findMany({
      select: { key: true, locale: true, enabled: true, updated_at: true },
    });
    return EMAIL_TEMPLATE_CATALOG.map((entry) => ({
      key: entry.key,
      title: entry.title,
      description: entry.description,
      variables: variablesOf(entry),
      locales: EMAIL_TEMPLATE_LOCALES.map((locale) => {
        const row = rows.find(
          (r) => r.key === entry.key && r.locale === locale,
        );
        return {
          locale,
          overridden: !!row,
          active: !!row?.enabled,
          updatedAt: row?.updated_at.toISOString() ?? null,
        };
      }),
    }));
  }

  async get(
    key: EmailTemplateKey,
    locale: EmailTemplateLocale,
  ): Promise<EmailTemplateDetailDto> {
    const entry = this.entry(key);
    const row = await this.row(key, locale);
    const d = entry.sample();
    return {
      key,
      locale,
      title: entry.title,
      description: entry.description,
      variables: variablesOf(entry),
      defaultRendered: {
        subject: d.subject,
        text: d.text,
        html: d.html ?? null,
      },
      override: row
        ? {
            subject: row.subject,
            textBody: row.text_body,
            htmlBody: row.html_body,
            enabled: row.enabled,
            updatedBy: row.updated_by,
            updatedAt: row.updated_at.toISOString(),
          }
        : null,
    };
  }

  async save(
    adminId: string,
    key: EmailTemplateKey,
    locale: EmailTemplateLocale,
    dto: SaveEmailTemplateDto,
  ): Promise<EmailTemplateDetailDto> {
    const entry = this.entry(key);
    assertRequiredVars(entry, dto);
    const html = dto.htmlBody?.trim() ? dto.htmlBody : null;
    await this.prisma.emailTemplate.upsert({
      where: { key_locale: { key, locale } },
      create: {
        key,
        locale,
        subject: dto.subject,
        text_body: dto.textBody,
        html_body: html,
        enabled: dto.enabled,
        updated_by: adminId,
      },
      update: {
        subject: dto.subject,
        text_body: dto.textBody,
        html_body: html,
        enabled: dto.enabled,
        updated_by: adminId,
      },
    });
    invalidateEmailTemplateCache();
    return this.get(key, locale);
  }

  /** Reset to the built-in: the override row is config, so it is removed. */
  async reset(
    key: EmailTemplateKey,
    locale: EmailTemplateLocale,
  ): Promise<void> {
    this.entry(key);
    await this.prisma.emailTemplate.deleteMany({ where: { key, locale } });
    invalidateEmailTemplateCache();
  }

  preview(
    key: EmailTemplateKey,
    dto: EmailTemplateContentDto,
  ): EmailTemplatePreviewDto {
    const entry = this.entry(key);
    const known = new Set(entry.variables.map((v) => v.name));
    const used = new Set([
      ...templateVariables(dto.subject),
      ...templateVariables(dto.textBody),
      ...templateVariables(dto.htmlBody ?? ''),
    ]);
    return {
      ...renderEmailTemplate(dto, sampleVars(entry)),
      unknownVariables: [...used].filter((v) => !known.has(v)),
    };
  }

  async sendTest(
    adminId: string,
    key: EmailTemplateKey,
    locale: EmailTemplateLocale,
    dto: TestEmailTemplateDto,
  ): Promise<EmailTemplateTestResultDto> {
    const entry = this.entry(key);
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { email: true },
    });
    if (!admin?.email) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Your admin account has no email address.',
      });
    }
    const budget = await this.rateLimit.consumeFixedWindow(
      ['admin-email-template-test', adminId],
      TESTS_PER_HOUR,
      3600,
    );
    if (!budget.allowed) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many test emails. Try again later.',
          details: { retryAfterSeconds: budget.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const rendered = await this.renderForTest(entry, locale, dto);
    await this.costGuard?.consume('email');
    // No `template` field: the content is already final.
    await this.email.sendEmail({
      to: admin.email,
      subject: `[Test] ${rendered.subject}`,
      text: rendered.text,
      ...(rendered.html ? { html: rendered.html } : {}),
    });
    return { sentTo: maskEmail(admin.email) };
  }

  private async renderForTest(
    entry: CatalogEntry,
    locale: EmailTemplateLocale,
    dto: TestEmailTemplateDto,
  ): Promise<RenderedEmailDto> {
    if (dto.subject && dto.textBody) {
      return renderEmailTemplate(
        {
          subject: dto.subject,
          textBody: dto.textBody,
          htmlBody: dto.htmlBody,
        },
        sampleVars(entry),
      );
    }
    const row = await this.row(entry.key, locale);
    if (row) {
      return renderEmailTemplate(
        {
          subject: row.subject,
          textBody: row.text_body,
          htmlBody: row.html_body,
        },
        sampleVars(entry),
      );
    }
    const d = entry.sample();
    return { subject: d.subject, text: d.text, html: d.html ?? null };
  }

  private entry(key: string): CatalogEntry {
    const e = catalogEntry(key);
    if (!e) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Unknown email template.',
      });
    }
    return e;
  }

  private row(key: string, locale: string): Promise<EmailTemplate | null> {
    return this.prisma.emailTemplate.findUnique({
      where: { key_locale: { key, locale } },
    });
  }
}

function variablesOf(entry: CatalogEntry): EmailTemplateVariableDto[] {
  return entry.variables.map((v) => ({
    ...v,
    required: entry.required.includes(v.name),
  }));
}
