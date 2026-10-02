import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { APP_CONFIG_CACHE_KEY } from '../feature-flags/services/app-config.service';
import { BootstrapService } from '../feature-flags/services/bootstrap.service';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import type {
  ConfigEntryDto,
  CreateLegalDocumentDto,
  FeatureFlagAdminDto,
  LanguageAdminDto,
  LegalDocumentAdminDto,
  UpdateFlagDto,
  UpdateLanguageDto,
} from './admin-config.dto';
import { configSchema, validateConfigValue } from './config-schema';

export const CONFIG_AUDIT = {
  flag: 'config.flag',
  config: 'config.app_config',
  language: 'config.language',
  legalCreate: 'legal.create',
  legalPublish: 'legal.publish',
} as const;

/** docs/06 §2.3 item 7: flags that bill a third party and the env keys
 * that prove the provider is configured. */
/**
 * Features that bill a third-party service: they can be switched on only
 * once the service's keys are set — in the admin (Integrations) or the
 * server env (owner 2026-10-01: Bunny Stream replaces Mux for video).
 */
import { SecretsService } from '../../common/secrets/secrets.service';
export const PAID_FLAGS: Record<
  string,
  { integration?: string; keys: string[] }
> = {
  stripe_identity: { integration: 'stripe', keys: ['STRIPE_SECRET_KEY'] },
  persona_verification: {
    integration: 'persona',
    keys: ['PERSONA_API_KEY'],
  },
  profile_promotion: {
    integration: 'stripe',
    keys: ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID'],
  },
  video_posts: {
    integration: 'bunny_stream',
    keys: [
      'BUNNY_LIBRARY_ID',
      'BUNNY_CDN_HOSTNAME',
      'BUNNY_API_KEY',
      'BUNNY_TOKEN_AUTH_KEY',
      'BUNNY_WEBHOOK_TOKEN',
    ],
  },
  auto_bar_check: { integration: 'bar_lookup', keys: ['BAR_LOOKUP_API_KEY'] },
};

/**
 * Audit 2026-10-02: flags whose feature is not built yet — switching one on
 * would do nothing (or, for device_attestation, lock every user out), so
 * the admin can't enable them until the code ships.
 */
export const UNBUILT_FLAGS: ReadonlySet<string> = new Set([
  'device_attestation',
  'stripe_identity',
  'persona_verification',
  'auto_bar_check',
  'profile_promotion',
]);

/**
 * docs/06 §2.3 items 7–10: feature flags (with the paid-service guard),
 * the schema-validated `app_config` editor, languages on/off and legal
 * document versions. Every write drops the relevant Redis cache
 * (`config:feature_flags`, `config:app_config`, bootstrap) so the change
 * reaches the app without a release, and writes an audit row.
 */
@Injectable()
export class AdminConfigService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    private readonly flags: FeatureFlagsService,
    private readonly bootstrap: BootstrapService,
    private readonly audit: AuditLogService,
    @Optional() private readonly secrets?: SecretsService,
  ) {}

  // ---- flags ----------------------------------------------------------

  async listFlags(): Promise<FeatureFlagAdminDto[]> {
    const rows = await this.prisma.featureFlag.findMany({
      orderBy: { key: 'asc' },
    });
    return Promise.all(rows.map((r) => this.presentFlag(r)));
  }

  async updateFlag(
    admin: AdminActor,
    key: string,
    dto: UpdateFlagDto,
  ): Promise<FeatureFlagAdminDto> {
    const before = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!before) throw notFound('Feature flag');
    const enabling = dto.enabled === true && !before.enabled;
    if (enabling && UNBUILT_FLAGS.has(key)) {
      throw new ConflictException({
        code: ErrorCode.FLAG_PROVIDER_KEYS_MISSING,
        message: 'This feature is not built yet and cannot be switched on.',
        details: { missingKeys: [], notBuilt: true },
      });
    }
    const missing = await this.missingKeys(key);
    if (enabling && missing.length > 0) {
      throw new ConflictException({
        code: ErrorCode.FLAG_PROVIDER_KEYS_MISSING,
        message:
          'This feature bills a third-party service; its keys are not configured on the server.',
        details: { missingKeys: missing },
      });
    }
    const after = await withTxRetry(this.prisma, async (tx) => {
      const updated = await tx.featureFlag.update({
        where: { key },
        data: {
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...(dto.rolloutPercent !== undefined
            ? { rollout_percent: dto.rolloutPercent }
            : {}),
          updated_by: admin.id,
        },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: CONFIG_AUDIT.flag,
          targetType: 'feature_flag',
          targetId: null,
          before: {
            key,
            enabled: before.enabled,
            rolloutPercent: before.rollout_percent,
          },
          after: {
            key,
            enabled: updated.enabled,
            rolloutPercent: updated.rollout_percent,
          },
          ip: admin.ip,
        },
        tx,
      );
      return updated;
    });
    await this.flags.invalidate();
    return await this.presentFlag(after);
  }

  /** Empty once the keys are set in the admin (Integrations) or env. */
  async missingKeys(flag: string): Promise<string[]> {
    const paid = PAID_FLAGS[flag];
    if (!paid) return [];
    if (paid.integration && (await this.secrets?.has(paid.integration))) {
      return [];
    }
    return paid.keys.filter((k) => !this.config.get<string>(k));
  }

  private async presentFlag(r: {
    key: string;
    enabled: boolean;
    rollout_percent: number;
    description: string | null;
    updated_by: string | null;
    updated_at: Date;
  }): Promise<FeatureFlagAdminDto> {
    const required = PAID_FLAGS[r.key]?.keys ?? [];
    return {
      key: r.key,
      enabled: r.enabled,
      rolloutPercent: r.rollout_percent,
      description: r.description,
      paid: required.length > 0,
      requiredKeys: required,
      missingKeys: await this.missingKeys(r.key),
      updatedBy: r.updated_by,
      updatedAt: r.updated_at.toISOString(),
    };
  }

  // ---- app_config -------------------------------------------------------

  async listConfig(): Promise<ConfigEntryDto[]> {
    const schema = configSchema();
    const rows = await this.prisma.appConfig.findMany({
      where: { key: { in: Object.keys(schema) } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return Object.entries(schema)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, s]) => {
        const row = byKey.get(key);
        return {
          key,
          type: s.type,
          value: row ? row.value : s.defaultValue,
          defaultValue: s.defaultValue,
          description: s.description,
          min: s.min ?? null,
          max: s.max ?? null,
          stored: Boolean(row),
          updatedAt: row?.updated_at.toISOString() ?? null,
        };
      });
  }

  async updateConfig(
    admin: AdminActor,
    key: string,
    value: unknown,
  ): Promise<ConfigEntryDto> {
    const schema = configSchema()[key];
    if (!schema) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Unknown app_config key.',
        details: { field: 'key' },
      });
    }
    const error = validateConfigValue(schema, value);
    if (error) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Invalid value for ${key}: ${error}.`,
        details: { field: 'value', type: schema.type },
      });
    }
    const json = value as Prisma.InputJsonValue;
    const row = await withTxRetry(this.prisma, async (tx) => {
      const before = await tx.appConfig.findUnique({ where: { key } });
      const updated = await tx.appConfig.upsert({
        where: { key },
        create: { key, value: json },
        update: { value: json },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: CONFIG_AUDIT.config,
          targetType: 'app_config',
          targetId: null,
          before: {
            key,
            value: (before?.value ?? null) as Prisma.InputJsonValue,
          },
          after: { key, value: json },
          ip: admin.ip,
        },
        tx,
      );
      return updated;
    });
    await this.redis.del(APP_CONFIG_CACHE_KEY);
    return {
      key,
      type: schema.type,
      value: row.value,
      defaultValue: schema.defaultValue,
      description: schema.description,
      min: schema.min ?? null,
      max: schema.max ?? null,
      stored: true,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  // ---- languages --------------------------------------------------------

  async listLanguages(): Promise<LanguageAdminDto[]> {
    const rows = await this.prisma.i18nLanguage.findMany({
      orderBy: [{ sort: 'asc' }, { code: 'asc' }],
      include: {
        bundle_version: true,
        _count: { select: { translations: true } },
      },
    });
    return rows.map((r) => ({
      code: r.code,
      nameNative: r.name_native,
      isActive: r.is_active,
      isRtl: r.is_rtl,
      sort: r.sort,
      translations: r._count.translations,
      bundleVersion: r.bundle_version?.version ?? 0,
    }));
  }

  async updateLanguage(
    admin: AdminActor,
    code: string,
    dto: UpdateLanguageDto,
  ): Promise<LanguageAdminDto> {
    const before = await this.prisma.i18nLanguage.findUnique({
      where: { code },
    });
    if (!before) throw notFound('Language');
    if (code === 'en' && dto.isActive === false) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'English is the fallback language and stays active.',
      });
    }
    await withTxRetry(this.prisma, async (tx) => {
      await tx.i18nLanguage.update({
        where: { code },
        data: {
          ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
          ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
        },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: CONFIG_AUDIT.language,
          targetType: 'i18n_language',
          targetId: null,
          before: { code, isActive: before.is_active, sort: before.sort },
          after: {
            code,
            isActive: dto.isActive ?? before.is_active,
            sort: dto.sort ?? before.sort,
          },
          ip: admin.ip,
        },
        tx,
      );
    });
    await this.bootstrap.invalidate();
    return (await this.listLanguages()).find((l) => l.code === code)!;
  }

  // ---- legal documents ----------------------------------------------------

  async listLegalDocuments(): Promise<LegalDocumentAdminDto[]> {
    const rows = await this.prisma.legalDocument.findMany({
      orderBy: [{ doc_type: 'asc' }, { locale: 'asc' }, { created_at: 'desc' }],
      include: { _count: { select: { consents: true } } },
    });
    return rows.map((r) => presentLegal(r, false));
  }

  async getLegalDocument(id: string): Promise<LegalDocumentAdminDto> {
    const row = await this.prisma.legalDocument.findUnique({
      where: { id },
      include: { _count: { select: { consents: true } } },
    });
    if (!row) throw notFound('Legal document');
    return presentLegal(row, true);
  }

  /** A new version starts as a draft (not current, not published). */
  async createLegalDocument(
    admin: AdminActor,
    dto: CreateLegalDocumentDto,
  ): Promise<LegalDocumentAdminDto> {
    if (!dto.contentMd && !dto.contentUrl) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Provide contentMd or contentUrl.',
        details: { field: 'contentMd' },
      });
    }
    const existing = await this.prisma.legalDocument.findUnique({
      where: {
        doc_type_version_locale: {
          doc_type: dto.docType,
          version: dto.version,
          locale: dto.locale,
        },
      },
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.LEGAL_DOCUMENT_INVALID_STATE,
        message:
          'This version already exists for the document type and locale.',
      });
    }
    const row = await withTxRetry(this.prisma, async (tx) => {
      const created = await tx.legalDocument.create({
        data: {
          doc_type: dto.docType,
          locale: dto.locale,
          version: dto.version,
          content_md: dto.contentMd ?? null,
          content_url: dto.contentUrl ?? null,
          is_current: false,
        },
        include: { _count: { select: { consents: true } } },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: CONFIG_AUDIT.legalCreate,
          targetType: 'legal_document',
          targetId: created.id,
          after: {
            docType: dto.docType,
            locale: dto.locale,
            version: dto.version,
          },
          ip: admin.ip,
        },
        tx,
      );
      return created;
    });
    return presentLegal(row, true);
  }

  /**
   * §2.3 item 10 "публикация новой версии (при смене обязательной версии
   * пользователи при следующем входе подтверждают заново)": the version
   * becomes current for its type + locale; OnboardingService compares the
   * user's accepted document version with the current one, so the app's
   * guard sends them back to the consents step.
   */
  async publishLegalDocument(
    admin: AdminActor,
    id: string,
  ): Promise<LegalDocumentAdminDto> {
    const row = await withTxRetry(this.prisma, async (tx) => {
      const doc = await tx.legalDocument.findUnique({ where: { id } });
      if (!doc) throw notFound('Legal document');
      if (doc.is_current) {
        throw new ConflictException({
          code: ErrorCode.LEGAL_DOCUMENT_INVALID_STATE,
          message: 'This version is already current.',
        });
      }
      const previous = await tx.legalDocument.findFirst({
        where: { doc_type: doc.doc_type, locale: doc.locale, is_current: true },
        select: { id: true, version: true },
      });
      await tx.legalDocument.updateMany({
        where: { doc_type: doc.doc_type, locale: doc.locale, is_current: true },
        data: { is_current: false },
      });
      const published = await tx.legalDocument.update({
        where: { id },
        data: {
          is_current: true,
          published_at: doc.published_at ?? new Date(),
        },
        include: { _count: { select: { consents: true } } },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: CONFIG_AUDIT.legalPublish,
          targetType: 'legal_document',
          targetId: id,
          before: {
            currentVersion: previous?.version ?? null,
            previousId: previous?.id ?? null,
          },
          after: {
            docType: doc.doc_type,
            locale: doc.locale,
            currentVersion: doc.version,
          },
          ip: admin.ip,
        },
        tx,
      );
      return published;
    });
    await this.bootstrap.invalidate();
    return presentLegal(row, true);
  }
}

function presentLegal(
  r: {
    id: string;
    doc_type: string;
    locale: string;
    version: string;
    is_current: boolean;
    published_at: Date | null;
    content_url: string | null;
    content_md: string | null;
    created_at: Date;
    _count: { consents: number };
  },
  full: boolean,
): LegalDocumentAdminDto {
  return {
    id: r.id,
    docType: r.doc_type,
    locale: r.locale,
    version: r.version,
    isCurrent: r.is_current,
    publishedAt: r.published_at?.toISOString() ?? null,
    contentUrl: r.content_url,
    contentMd: full
      ? r.content_md
      : r.content_md
        ? `${r.content_md.slice(0, 160)}${r.content_md.length > 160 ? '…' : ''}`
        : null,
    consents: r._count.consents,
    createdAt: r.created_at.toISOString(),
  };
}

const notFound = (what: string) =>
  new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: `${what} not found.`,
  });
