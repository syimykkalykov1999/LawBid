import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecretsService } from '../../../common/secrets/secrets.service';
import type { WorkflowCaller } from '../infra/infra-github.client';
import {
  backupTargets,
  MEDIA_BACKUP_STATE_KEY,
  parseState,
  planRun,
  withResult,
  type MediaBackupPlan,
  type MediaBackupResult,
  type MediaBackupState,
} from '../../../common/ops/media-backup.logic';

export interface MediaBackupJob {
  plan: MediaBackupPlan;
  /** Only when plan.run: what the workflow needs (masked there at once). */
  source?: {
    accountId: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  target?: { roleArn: string; bucket: string };
}

/** 26.11 (D10): the API side of .github/workflows/media-backup.yml. */
@Injectable()
export class MediaBackupService {
  private readonly log = new Logger(MediaBackupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
    private readonly config: ConfigService,
  ) {}

  async state(): Promise<MediaBackupState> {
    const row = await this.prisma.appConfig.findUnique({
      where: { key: MEDIA_BACKUP_STATE_KEY },
    });
    return parseState(row?.value);
  }

  /** What this run should do; the keys only when it runs. */
  async job(askedDryRun: boolean): Promise<MediaBackupJob> {
    const f = (await this.secrets.get('r2_backup'))?.fields ?? {};
    const keys = Boolean(
      f.accountId && f.bucket && f.accessKeyId && f.secretAccessKey,
    );
    const target = backupTargets(
      this.config.get<string>('OPS_AWS_ACCOUNT_ID') ?? '',
      this.config.get<string>('OPS_STACK_NAME') || 'lawbid-prod',
    );
    const plan = planRun({
      keys: keys && target !== null,
      askedDryRun,
      state: await this.state(),
    });
    if (!plan.run || !target) return { plan };
    return {
      plan,
      source: {
        accountId: f.accountId,
        bucket: f.bucket,
        accessKeyId: f.accessKeyId,
        secretAccessKey: f.secretAccessKey,
      },
      target,
    };
  }

  async report(
    caller: WorkflowCaller,
    r: Omit<MediaBackupResult, 'at' | 'runUrl'>,
    now: Date = new Date(),
  ): Promise<MediaBackupState> {
    const next = withResult(await this.state(), {
      ...r,
      error: r.error ? r.error.slice(0, 300) : null,
      at: now.toISOString(),
      runUrl: caller.runUrl,
    });
    const value = next as unknown as Prisma.InputJsonValue;
    await this.prisma.appConfig.upsert({
      where: { key: MEDIA_BACKUP_STATE_KEY },
      create: { key: MEDIA_BACKUP_STATE_KEY, value },
      update: { value },
    });
    this.log.log(
      `media backup ${r.dryRun ? 'dry run' : 'copy'} ${r.ok ? 'ok' : 'failed'}`,
    );
    return next;
  }
}
