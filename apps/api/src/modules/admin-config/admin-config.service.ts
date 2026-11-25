import {
  casePaymentsUnlockedForTests,
  LOCKED_OFF_FLAGS,
} from '../../common/feature-flags/locked-flags';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../../generated/prisma/client';
import type Redis from 'ioredis';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { dropAppConfigCache } from '../feature-flags/services/app-config.service';
import { BootstrapService } from '../feature-flags/services/bootstrap.service';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import type {
  ConfigEntryDto,
  FeatureFlagAdminDto,
  LanguageAdminDto,
  UpdateFlagDto,
  UpdateLanguageDto,
} from './admin-config.dto';
import { configSchema, validateConfigValue } from './config-schema';
import { REPORT_TIME_ZONE_KEY } from '../../common/utils/report-day';
import { isValidTimeZone } from '../../common/utils/zoned-time';

export const CONFIG_AUDIT = {
  flag: 'config.flag',
  /** Row 150 (R2 review): a live partial rollout got another bucketing
   * hash, so a different set of people now has the flag. */
  flagRebucketed: 'config.flag_rebucketed',
  config: 'config.app_config',
  language: 'config.language',
} as const;

/** docs/06 §2.3 item 7: flags that bill a third party and the env keys
 * that prove the provider is configured. */
/**
 * Features that bill a third-party service: they can be switched on only
 * once the service's keys are set — in the admin (Integrations) or the
 * server env (owner 2026-10-01: Bunny Stream replaces Mux for video).
 */
import { SecretsService } from '../../common/secrets/secrets.service';

/** Owner 2026-11-12 (row 60): «Автоматическое решение по адвокатам» —
 * settings only the owner (super admin) may change, always with a fresh
 * 2FA code. Any other admin gets 403 FORBIDDEN. */
export const OWNER_ONLY_CONFIG_KEYS: ReadonlySet<string> = new Set([
  'verification.auto_decision.enabled',
  'verification.auto_decision.face_reject_below',
  'verification.auto_decision.audit_pct',
  'verification.auto_decision.audit_pct_min',
  'verification.auto_decision.persona_document_enabled',
  'verification.auto_decision.ai_request_info_enabled',
  // Owner 14.11 (row 179, B8): the 2FA window itself.
  'admin.step_up_ttl_seconds',
  // Owner 15.11: how many database servers «Авто» may reach.
  'db.max_servers',
  // Owner 15.11: how many search engine nodes «Авто» may reach.
  'search.max_nodes',
  // Verify batch 11 (C1): the automatic refund caps are money controls —
  // an admin with «Настройки: управление» could raise them to $100 000.
  'billing.dispute_refund_max_cents',
  'billing.dispute_refund_daily_cap_cents',
  'billing.duplicate_autorefund_daily_cap_cents',
  'stripe_ops.efw_auto_refund_max_cents',
  // Round 4 admin check (25.11, С1): the panel's «Настройки» page is the
  // owner's alone; the admin hardening switches are too (an employee with
  // «Настройки: управление» could open the panel to every IP).
  'admin.ip_allowlist_enabled',
  'admin.ip_allowlist',
  'admin.country_allowlist',
  'admin.max_concurrent_sessions',
]);

/** Verify batch 11 (C1): the staff package switches (masking, export
 * block, watermark, session binding, workspaces, rates…) are the owner's
 * (his «Сотрудники» settings are super admin only); through the generic
 * editor an employee could switch off the very guards on themselves. */
export const OWNER_ONLY_CONFIG_PREFIXES: readonly string[] = [
  'staff.',
  // Round 4 (25.11, С1): bot checks, App Check, password and sign-in
  // guards — switched off by an employee, they open the app to attackers.
  'security.',
];

/** Round 4 admin check (25.11, В5): switches that move real money. The
 * panel's «Функции» page is the owner's alone; the API now says the same:
 * only the super admin, always with a fresh 2FA code (like the refund caps
 * above), whatever «Настройки» an employee was granted. */
export const OWNER_ONLY_FLAGS: ReadonlySet<string> = new Set([
  'dispute_auto_refund',
  'payroll_stripe_payouts',
  'economy_guard',
]);

export function isOwnerOnlyConfigKey(key: string): boolean {
  return (
    OWNER_ONLY_CONFIG_KEYS.has(key) ||
    OWNER_ONLY_CONFIG_PREFIXES.some((p) => key.startsWith(p))
  );
}
export const PAID_FLAGS: Record<
  string,
  { integration?: string; keys: string[] }
> = {
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
  chat_translate: {
    integration: 'google_translate',
    keys: ['GOOGLE_TRANSLATE_API_KEY'],
  },
  payroll_stripe_payouts: {
    integration: 'stripe',
    keys: ['STRIPE_SECRET_KEY'],
  },
  // Owner 2026-10-05: client → attorney payments (Stripe Connect).
  payments_in_app: { integration: 'stripe', keys: ['STRIPE_SECRET_KEY'] },
  // Owner 2026-10-05: video calls go through our TURN (bandwidth billed).
  video_calls: {
    integration: 'turn',
    keys: ['TURN_URLS', 'TURN_SECRET'],
  },
};

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
    // Owner 2026-11-12 (row 60): the fresh 2FA code of owner-only keys.
    @Optional() private readonly adminAuth?: AdminAuthService,
  ) {}

  /** Owner 2026-11-12 (row 60): OWNER_ONLY_CONFIG_KEYS change only by the
   * owner (super admin) and only with a fresh 2FA code. Fails closed: no
   * 2FA service = no change. */
  private async assertOwnerOnly(admin: AdminActor, key: string): Promise<void> {
    if (!isOwnerOnlyConfigKey(key)) return;
    await this.assertOwnerStepUp(admin);
  }

  /** Only the super admin, with a fresh 2FA code (403 otherwise). */
  private async assertOwnerStepUp(admin: AdminActor): Promise<void> {
    if (admin.adminRole !== 'super_admin') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the owner can change this setting.',
      });
    }
    if (!this.adminAuth) {
      throw new ForbiddenException({
        code: ErrorCode.ADMIN_STEP_UP_REQUIRED,
        message: 'A fresh 2FA code is required.',
      });
    }
    await this.adminAuth.assertStepUp(admin.sessionId);
  }

  // ---- flags ----------------------------------------------------------

  async listFlags(): Promise<FeatureFlagAdminDto[]> {
    const rows = await this.prisma.featureFlag.findMany({
      orderBy: { key: 'asc' },
    });
    // Owner 2026-10-16: a locked-off switch is not offered at all.
    const shown = casePaymentsUnlockedForTests()
      ? rows
      : rows.filter((r) => !LOCKED_OFF_FLAGS.includes(r.key));
    return Promise.all(shown.map((r) => this.presentFlag(r)));
  }

  async updateFlag(
    admin: AdminActor,
    key: string,
    dto: UpdateFlagDto,
  ): Promise<FeatureFlagAdminDto> {
    const before = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!before) throw notFound('Feature flag');
    const changes =
      (dto.enabled !== undefined && dto.enabled !== before.enabled) ||
      (dto.rolloutPercent !== undefined &&
        dto.rolloutPercent !== before.rollout_percent);
    if (OWNER_ONLY_FLAGS.has(key) && changes) {
      await this.assertOwnerStepUp(admin);
    }
    const enabling = dto.enabled === true && !before.enabled;
    if (
      dto.enabled === true &&
      LOCKED_OFF_FLAGS.includes(key) &&
      !casePaymentsUnlockedForTests()
    ) {
      throw new ConflictException({
        code: ErrorCode.FLAG_PROVIDER_KEYS_MISSING,
        message:
          'LawBid does not process payments between clients and attorneys; this switch stays off.',
        details: { missingKeys: [], locked: true },
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
      // Verify batch 11 (C8): the audit «before» is the row this save
      // replaces, read in the transaction (two saves at once each logged
      // the value read before either of them).
      const cur = await tx.featureFlag.findUnique({ where: { key } });
      const prior = cur ?? before;
      // Owner 14.11 (row 179): refuse a save from a tab that saw an older row.
      if (dto.expectedUpdatedAt !== undefined) {
        assertNotStale(
          cur?.updated_at ?? null,
          dto.expectedUpdatedAt,
          cur
            ? {
                key,
                enabled: cur.enabled,
                rolloutPercent: cur.rollout_percent,
                updatedAt: cur.updated_at.toISOString(),
              }
            : undefined,
        );
      }
      const updated = await tx.featureFlag.update({
        where: { key },
        data: {
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...(dto.rolloutPercent !== undefined
            ? { rollout_percent: dto.rolloutPercent }
            : {}),
          ...(dto.hashVersion !== undefined
            ? { hash_version: dto.hashVersion }
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
            enabled: prior.enabled,
            rolloutPercent: prior.rollout_percent,
            hashVersion: prior.hash_version,
          },
          after: {
            key,
            enabled: updated.enabled,
            rolloutPercent: updated.rollout_percent,
            hashVersion: updated.hash_version,
          },
          ip: admin.ip,
        },
        tx,
      );
      // Row 150 (R2 review): changing the hash of a flag that is on for part
      // of the users re-picks who has it; that gets its own audit line, so a
      // shift in a measurement can be traced to it.
      const partial = (r: { enabled: boolean; rollout_percent: number }) =>
        r.enabled && r.rollout_percent > 0 && r.rollout_percent < 100;
      if (
        updated.hash_version !== prior.hash_version &&
        (partial(prior) || partial(updated))
      ) {
        await this.audit.record(
          {
            adminId: admin.id,
            action: CONFIG_AUDIT.flagRebucketed,
            targetType: 'feature_flag',
            targetId: null,
            before: {
              key,
              hashVersion: prior.hash_version,
              rolloutPercent: prior.rollout_percent,
            },
            after: {
              key,
              hashVersion: updated.hash_version,
              rolloutPercent: updated.rollout_percent,
            },
            ip: admin.ip,
          },
          tx,
        );
      }
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
    hash_version?: number;
    description: string | null;
    updated_by: string | null;
    updated_at: Date;
  }): Promise<FeatureFlagAdminDto> {
    const required = PAID_FLAGS[r.key]?.keys ?? [];
    return {
      key: r.key,
      enabled: r.enabled,
      rolloutPercent: r.rollout_percent,
      // A row from before the column (row 150) is version 1.
      hashVersion: r.hash_version === 2 ? 2 : 1,
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

  /** Owner 2026-10-24: R2 cannot be switched on without its keys. */
  private async assertR2Ready(key: string, value: unknown): Promise<void> {
    if (key !== 'media.public_store' || value !== 'r2') return;
    const f = (await this.secrets?.get('cloudflare_r2'))?.fields ?? {};
    const missing = [
      'accountId',
      'accessKeyId',
      'secretAccessKey',
      'bucket',
      'publicBaseUrl',
    ].filter((n) => !(f[n] ?? '').trim());
    if (missing.length === 0) return;
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: `Cloudflare R2 is not configured: add ${missing.join(', ')} in Integrations → Cloudflare R2 first.`,
      details: { field: 'value', missing },
    });
  }

  /** Owner 2026-10-24: the search engine cannot be switched on without its address. */
  private async assertSearchEngineReady(
    key: string,
    value: unknown,
  ): Promise<void> {
    if (key === 'search.engine_kind' && value === 'serverless') {
      const sf = (await this.secrets?.get('opensearch'))?.fields ?? {};
      const surl = (
        sf.serverless_url ??
        this.config.get<string>('OPENSEARCH_SERVERLESS_URL') ??
        ''
      ).trim();
      if (surl) return;
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          'OpenSearch Serverless is not configured: set growth.opensearch_serverless_enabled in Terraform (it sets OPENSEARCH_SERVERLESS_URL) first.',
        details: { field: 'value', missing: ['OPENSEARCH_SERVERLESS_URL'] },
      });
    }
    if (key !== 'search.engine' || value === 'postgres') return;
    const f = (await this.secrets?.get('opensearch'))?.fields ?? {};
    // Feature reality audit 2026-11-08: with the serverless kind chosen the
    // engine lives at the serverless address, so that one must exist.
    const kind = (
      await this.prisma.appConfig.findUnique({
        where: { key: 'search.engine_kind' },
      })
    )?.value;
    if (kind === 'serverless') {
      const surl = (
        f.serverless_url ??
        this.config.get<string>('OPENSEARCH_SERVERLESS_URL') ??
        ''
      ).trim();
      if (surl) return;
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          'The search engine kind is serverless but OpenSearch Serverless is not configured (OPENSEARCH_SERVERLESS_URL).',
        details: { field: 'value', missing: ['OPENSEARCH_SERVERLESS_URL'] },
      });
    }
    const url = (
      f.url ??
      this.config.get<string>('OPENSEARCH_URL') ??
      ''
    ).trim();
    if (url) return;
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message:
        'The search engine is not configured: add its address (OPENSEARCH_URL) in Integrations → Search engine first.',
      details: { field: 'value', missing: ['OPENSEARCH_URL'] },
    });
  }

  /** Owner 2026-10-22: livekit cannot be switched on without its keys. */
  /** Feature reality audit 2026-11-08: the AI text check («shadow» /
   * «enforce») without its key silently allowed every text while the admin
   * showed it on. Refused until the key is saved, like the search engine. */
  private async assertTextDetectorReady(
    key: string,
    value: unknown,
  ): Promise<void> {
    if (key !== 'moderation.detect.mode' || value === 'off') return;
    if (await this.secrets?.has('openai_moderation')) return;
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message:
        'The AI text check has no key: save the OpenAI moderation key in Integrations first.',
      details: { field: 'value', missing: ['openai_moderation'] },
    });
  }

  private async assertLivekitReady(key: string, value: unknown): Promise<void> {
    const needs = key === 'calls.video_provider' && value === 'livekit';
    if (!needs) return;
    const f = (await this.secrets?.get('livekit'))?.fields ?? {};
    const has = (name: string, env: string) =>
      Boolean((f[name] ?? this.config.get<string>(env) ?? '').trim());
    const missing = [
      has('url', 'LIVEKIT_URL') ? null : 'LIVEKIT_URL',
      has('apiKey', 'LIVEKIT_API_KEY') ? null : 'LIVEKIT_API_KEY',
      has('apiSecret', 'LIVEKIT_API_SECRET') ? null : 'LIVEKIT_API_SECRET',
    ].filter((x): x is string => x !== null);
    if (missing.length === 0) return;
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: `LiveKit is not configured: add ${missing.join(', ')} in Integrations → LiveKit first.`,
      details: { field: 'value', missing },
    });
  }

  /** Owner 2026-10-26: `calls.transport` = cloudflare (forced) needs at
   * least one Cloudflare call key (TURN or SFU); auto and own never do. */
  private async assertCloudflareTransportReady(
    key: string,
    value: unknown,
  ): Promise<void> {
    if (key !== 'calls.transport' || value !== 'cloudflare') return;
    const turn = (await this.secrets?.get('cloudflare_turn'))?.fields ?? {};
    const sfu = (await this.secrets?.get('cloudflare_sfu'))?.fields ?? {};
    const has = (f: Record<string, string>, name: string, env: string) =>
      Boolean((f[name] ?? this.config.get<string>(env) ?? '').trim());
    const turnSet =
      has(turn, 'keyId', 'CLOUDFLARE_TURN_KEY_ID') &&
      has(turn, 'apiToken', 'CLOUDFLARE_TURN_API_TOKEN');
    const sfuSet =
      has(sfu, 'appId', 'CLOUDFLARE_SFU_APP_ID') &&
      has(sfu, 'appToken', 'CLOUDFLARE_SFU_APP_TOKEN');
    if (turnSet || sfuSet) return;
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message:
        'Cloudflare is not configured: add Integrations → Cloudflare TURN (and Cloudflare SFU for groups) first, or keep auto.',
      details: { field: 'value' },
    });
  }

  /** Owner 2026-10-24: cloudflare cannot be switched on without its keys. */
  private async assertCloudflareSfuReady(
    key: string,
    value: unknown,
  ): Promise<void> {
    if (key !== 'calls.video_provider' || value !== 'cloudflare') return;
    const f = (await this.secrets?.get('cloudflare_sfu'))?.fields ?? {};
    const has = (name: string, env: string) =>
      Boolean((f[name] ?? this.config.get<string>(env) ?? '').trim());
    const missing = [
      has('appId', 'CLOUDFLARE_SFU_APP_ID') ? null : 'CLOUDFLARE_SFU_APP_ID',
      has('appToken', 'CLOUDFLARE_SFU_APP_TOKEN')
        ? null
        : 'CLOUDFLARE_SFU_APP_TOKEN',
    ].filter((x): x is string => x !== null);
    if (missing.length === 0) return;
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: `Cloudflare SFU is not configured: add ${missing.join(', ')} in Integrations → Cloudflare SFU first.`,
      details: { field: 'value', missing },
    });
  }

  async updateConfig(
    admin: AdminActor,
    key: string,
    value: unknown,
    // Owner 14.11 (row 179): what the editor saw; undefined = no check.
    expectedUpdatedAt?: string | null,
  ): Promise<ConfigEntryDto> {
    await this.assertOwnerOnly(admin, key);
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
    await this.assertLivekitReady(key, value);
    await this.assertCloudflareSfuReady(key, value);
    await this.assertCloudflareTransportReady(key, value);
    await this.assertR2Ready(key, value);
    await this.assertSearchEngineReady(key, value);
    await this.assertTextDetectorReady(key, value);
    if (key === REPORT_TIME_ZONE_KEY && !isValidTimeZone(value)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Unknown time zone: ${String(value)}.`,
        details: { field: 'value' },
      });
    }
    const json = value as Prisma.InputJsonValue;
    const row = await withTxRetry(this.prisma, async (tx) => {
      const before = await tx.appConfig.findUnique({ where: { key } });
      if (expectedUpdatedAt !== undefined) {
        assertNotStale(before?.updated_at ?? null, expectedUpdatedAt, {
          key,
          value: before ? before.value : schema.defaultValue,
          stored: Boolean(before),
          updatedAt: before?.updated_at.toISOString() ?? null,
        });
      }
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
    await dropAppConfigCache(this.redis);
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
}

/**
 * Owner 14.11 (row 179, detective R3A-6): optimistic concurrency by the row's
 * updated_at (RFC 9110 §13.1.1 If-Match; common/concurrency/optimistic-lock.ts
 * uses a version column, these two tables have only updated_at). Inside the
 * serializable transaction, so two saves cannot both pass. Owner 15.11: the
 * 409 carries the fresh row (`current`), so the admin shows it at once and
 * the owner can save again (GitHub / Linear «changed elsewhere» refusal).
 */
export function assertNotStale(
  current: Date | null,
  expected: string | null,
  fresh?: Record<string, unknown>,
): void {
  const now = current ? current.toISOString() : null;
  const seen = expected === null ? null : new Date(expected).toISOString();
  if (now === seen) return;
  throw new ConflictException({
    code: ErrorCode.STALE_VERSION,
    message: 'This setting was changed by someone else. Reload and try again.',
    details: { currentUpdatedAt: now, ...(fresh ? { current: fresh } : {}) },
  });
}

const notFound = (what: string) =>
  new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: `${what} not found.`,
  });
