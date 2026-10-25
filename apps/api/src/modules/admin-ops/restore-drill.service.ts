import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BackupClient,
  ListRestoreJobsCommand,
  type RestoreJobsListMember,
} from '@aws-sdk/client-backup';
import { AwsOpsService } from '../../common/ops/aws-ops.service';

export type DrillState = 'ok' | 'failed' | 'running' | 'never' | 'unknown';

export interface RestoreDrillResult {
  state: DrillState;
  /** When the last finished restore test started. */
  at: string | null;
  /** Minutes from start to a usable database (RTO evidence). */
  durationMinutes: number | null;
  message: string | null;
  /** Creation time of the restored backup (RPO evidence). */
  backupAt: string | null;
  /** Whole days since the last COMPLETED restore (any kind). */
  lastOkDaysAgo: number | null;
  /** A job from the plan is in progress right now. */
  running: boolean;
}

const LOOKBACK_DAYS = 120;
const CACHE_MS = 10 * 60 * 1000;
/** The plan runs monthly; this much slack before the board turns yellow. */
export const DRILL_STALE_DAYS = 40;

/**
 * WP-G (2026-10-25): the board reads the result of the monthly AWS Backup
 * RESTORE TESTING plan (Terraform: modules/backup, `aws_backup_restore_
 * testing_plan`) straight from AWS Backup: `ListRestoreJobs`, resource type
 * RDS, last 120 days. No second copy of the result is stored, nothing to
 * post, nothing to forget: the managed feature restores the newest vault
 * backup into a temporary database, deletes it after the validation window
 * and records status and duration itself. A manual drill
 * (`scripts/ops/restore-drill.sh`) shows up here too: it is a restore job.
 */
@Injectable()
export class RestoreDrillService {
  private client?: BackupClient;
  private cache?: { at: number; value: RestoreDrillResult };

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly aws?: AwsOpsService,
  ) {}

  private region(): string {
    return (
      this.config.get<string>('AWS_REGION') ??
      this.config.get<string>('S3_REGION') ??
      'us-east-1'
    );
  }

  /** Only on AWS (the ECS task role has `backup:ListRestoreJobs`). */
  get available(): boolean {
    return this.aws?.available ?? false;
  }

  async last(now: Date = new Date()): Promise<RestoreDrillResult> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) {
      return this.cache.value;
    }
    const value = await this.read(now);
    this.cache = { at: Date.now(), value };
    return value;
  }

  private async read(now: Date): Promise<RestoreDrillResult> {
    if (!this.available) return summarize([], now, false);
    this.client ??= new BackupClient({ region: this.region() });
    const out = await this.client.send(
      new ListRestoreJobsCommand({
        ByResourceType: 'RDS',
        ByCreatedAfter: new Date(now.getTime() - LOOKBACK_DAYS * 86400_000),
        MaxResults: 100,
      }),
    );
    return summarize(out.RestoreJobs ?? [], now, true);
  }
}

/** Pure: turns AWS Backup restore jobs into the board's one-line answer. */
export function summarize(
  jobs: RestoreJobsListMember[],
  now: Date,
  connected: boolean,
): RestoreDrillResult {
  const empty: RestoreDrillResult = {
    state: connected ? 'never' : 'unknown',
    at: null,
    durationMinutes: null,
    message: null,
    backupAt: null,
    lastOkDaysAgo: null,
    running: false,
  };
  if (!connected) return empty;
  const byNewest = [...jobs]
    .filter((j) => j.CreationDate)
    .sort((a, b) => b.CreationDate!.getTime() - a.CreationDate!.getTime());
  const running = byNewest.some(
    (j) =>
      (j.Status === 'PENDING' || j.Status === 'RUNNING') &&
      now.getTime() - j.CreationDate!.getTime() < 12 * 3600_000,
  );
  const finished = byNewest.filter(
    (j) =>
      j.Status === 'COMPLETED' ||
      j.Status === 'FAILED' ||
      j.Status === 'ABORTED' ||
      j.Status === 'EXPIRED',
  );
  const latest = finished[0];
  if (!latest)
    return { ...empty, running, state: running ? 'running' : 'never' };
  const lastOk = finished.find((j) => j.Status === 'COMPLETED');
  const done = latest.CompletionDate ?? latest.CreationDate!;
  const ok = latest.Status === 'COMPLETED';
  return {
    state: ok ? 'ok' : 'failed',
    at: latest.CreationDate!.toISOString(),
    durationMinutes: ok
      ? Math.max(
          1,
          Math.round((done.getTime() - latest.CreationDate!.getTime()) / 60000),
        )
      : null,
    message: ok ? null : (latest.StatusMessage ?? latest.Status ?? null),
    backupAt: latest.RecoveryPointCreationDate?.toISOString() ?? null,
    lastOkDaysAgo: lastOk
      ? Math.floor((now.getTime() - lastOk.CreationDate!.getTime()) / 86400_000)
      : null,
    running,
  };
}
