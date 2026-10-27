import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AdminConfigService } from '../admin-config/admin-config.service';
import { configSchema } from '../admin-config/config-schema';
import { InfraGithubClient } from '../admin-launch/admin-launch.public';
import {
  CHECKLIST_IDS,
  PUBLIC_SEO_FIELDS,
  SEO_DRY_RUN_COMMAND,
  SEO_SWITCH_KEYS,
  SEO_WORKFLOW_FILE,
  checklistKey,
  type PublicSeoField,
} from './promotion.catalog';
import type {
  PromotionDryRunResultDto,
  PromotionOverviewDto,
  PromotionSettingDto,
  PublicSeoSettingsDto,
} from './promotion.dto';
import { SeoManifestService } from './seo-manifest.service';

/** One dry run a minute is plenty (the workflow queues runs anyway). */
const DRY_RUN_COOLDOWN_MS = 60_000;

export const PROMOTION_AUDIT = { dryRun: 'promotion.seo_dry_run' } as const;

@Injectable()
export class PromotionService {
  private readonly log = new Logger(PromotionService.name);
  private lastDryRun = 0;

  constructor(
    private readonly settings: AppSettingsService,
    private readonly config: AdminConfigService,
    private readonly manifest: SeoManifestService,
    private readonly github: InfraGithubClient,
    private readonly audit: AuditLogService,
  ) {}

  /** Keys this page may write: the SEO switches that exist and the checklist. */
  allowedKeys(): Set<string> {
    const schema = configSchema();
    return new Set([
      ...SEO_SWITCH_KEYS.filter((k) => k in schema),
      ...CHECKLIST_IDS.map(checklistKey),
    ]);
  }

  private async setting(key: string): Promise<PromotionSettingDto> {
    const schema = configSchema()[key];
    const stored = await this.settings.raw(key);
    const type =
      schema.type === 'boolean' || schema.type === 'string'
        ? schema.type
        : 'integer';
    return {
      key,
      type,
      value:
        stored === undefined || stored === null ? schema.defaultValue : stored,
      stored: stored !== undefined && stored !== null,
      defaultValue: schema.defaultValue,
    };
  }

  async overview(): Promise<PromotionOverviewDto> {
    const schema = configSchema();
    const [switches, checklist, status, canStart] = await Promise.all([
      Promise.all(
        SEO_SWITCH_KEYS.filter((k) => k in schema).map((k) => this.setting(k)),
      ),
      Promise.all(
        CHECKLIST_IDS.map(async (id) => ({
          id,
          key: checklistKey(id),
          done: (await this.settings.raw(checklistKey(id))) === true,
        })),
      ),
      this.manifest.status(),
      this.github.configured(),
    ]);
    return {
      switches,
      checklist,
      status,
      dryRun: { canStart, command: SEO_DRY_RUN_COMMAND },
    };
  }

  /** Writes one switch or checklist tick through the validated, audited
   * app_config path (before/after audit row, cache dropped). */
  async update(
    admin: AdminActor,
    key: string,
    value: unknown,
  ): Promise<PromotionSettingDto> {
    if (!this.allowedKeys().has(key)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'This key is not edited on the Promotion page.',
        details: { field: 'key' },
      });
    }
    await this.config.updateConfig(admin, key, value);
    return this.setting(key);
  }

  /** Starts `seo-deploy.yml` with dry_run=true through the infra GitHub App
   * when it is configured; otherwise only hands back the command. Nothing is
   * published by a dry run. */
  async dryRun(
    admin: AdminActor,
    now: number = Date.now(),
  ): Promise<PromotionDryRunResultDto> {
    const base = {
      command: SEO_DRY_RUN_COMMAND,
      started: false,
      runsUrl: null,
    };
    if (!(await this.github.configured())) {
      return {
        ...base,
        message:
          'GitHub-приложение для запуска не подключено (Ключи и сервисы). Выполните команду вручную или нажмите Run workflow на странице GitHub Actions.',
      };
    }
    if (now - this.lastDryRun < DRY_RUN_COOLDOWN_MS) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'A dry run was started a minute ago.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.lastDryRun = now;
    try {
      const { repo } = await this.github.dispatchWorkflow(SEO_WORKFLOW_FILE, {
        dry_run: 'true',
      });
      const runsUrl = `https://github.com/${repo}/actions/workflows/${SEO_WORKFLOW_FILE}`;
      await this.audit.record({
        adminId: admin.id,
        action: PROMOTION_AUDIT.dryRun,
        targetType: 'workflow',
        targetId: null,
        after: { workflow: SEO_WORKFLOW_FILE, dryRun: true },
        ip: admin.ip ?? undefined,
      });
      return {
        ...base,
        started: true,
        runsUrl,
        message: 'Пробный запуск начался. Итог смотрите в GitHub Actions.',
      };
    } catch (e) {
      this.lastDryRun = 0;
      this.log.warn(
        `seo dry run failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return {
        ...base,
        message:
          'GitHub не запустил пробную сборку. Выполните команду вручную.',
      };
    }
  }

  /**
   * What the generator reads (GET /public/seo-settings): the stored value
   * of each switch, or null when the admin never decided. Public-safe: six
   * booleans/integers, no personal data. Reads the cached app_config map
   * (no query of its own).
   */
  async publicSettings(): Promise<PublicSeoSettingsDto> {
    const out: Record<string, boolean | number | null> = {};
    for (const [field, key] of Object.entries(PUBLIC_SEO_FIELDS) as [
      PublicSeoField,
      string,
    ][]) {
      const v = await this.settings.raw(key);
      out[field] =
        typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))
          ? v
          : null;
    }
    return out as unknown as PublicSeoSettingsDto;
  }
}
