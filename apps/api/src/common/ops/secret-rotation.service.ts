import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
} from '@aws-sdk/client-cloudwatch';

export type RotationState =
  | 'ok' // rotated recently, next one scheduled
  | 'never' // rotation on, first one not yet due
  | 'off' // rotation switched off for this secret
  | 'overdue'
  | 'failed'
  | 'unknown'; // the hourly check has not reported lately

export interface RotationRow {
  name: string;
  state: RotationState;
  lastRotatedAt: string | null;
  nextDueAt: string | null;
  everyDays: number;
}

/** Facts the hourly follow-up Lambda publishes per secret (CloudWatch). */
export interface RotationFacts {
  lastRotatedEpoch: number; // 0 = never rotated
  createdEpoch: number;
  rotationEnabled: boolean;
  overdue: boolean;
  failed: boolean;
}

/** The follow-up runs hourly; no report for this long = it is not running. */
export const ROTATION_STALE_MS = 3 * 3600 * 1000;
/** A rotation that is this many days late counts as overdue (matches the Lambda). */
export const ROTATION_SLACK_DAYS = 3;

/** Pure: one secret's facts → the row the admin shows. */
export function rotationRow(
  name: string,
  everyDays: number,
  facts: RotationFacts | null,
  now: Date,
): RotationRow {
  const row = (
    state: RotationState,
    last: number | null,
    next: number | null,
  ): RotationRow => ({
    name,
    state,
    everyDays,
    lastRotatedAt: last ? new Date(last * 1000).toISOString() : null,
    nextDueAt: next ? new Date(next * 1000).toISOString() : null,
  });
  if (!facts) return row('unknown', null, null);
  const last = facts.lastRotatedEpoch > 0 ? facts.lastRotatedEpoch : null;
  const base = last ?? (facts.createdEpoch > 0 ? facts.createdEpoch : null);
  const next = base ? base + everyDays * 86400 : null;
  if (!facts.rotationEnabled) return row('off', last, null);
  if (facts.failed) return row('failed', last, next);
  const lateBy = next ? now.getTime() / 1000 - next : 0;
  if (facts.overdue || lateBy > ROTATION_SLACK_DAYS * 86400) {
    return row('overdue', last, next);
  }
  return row(last ? 'ok' : 'never', last, next);
}

/**
 * Owner 2026-10-25 (docs/runbooks/secrets-rotation.md): «Здоровье системы»
 * shows when each rotated secret was last rotated and when the next
 * rotation is due. The facts are CloudWatch statistics published by the
 * rotation follow-up Lambda; the app never touches the secrets for this.
 * Without ROTATION_STATUS_SECRETS (rotation off, local dev) there is
 * nothing to show.
 */
@Injectable()
export class SecretRotationService {
  private cw?: CloudWatchClient;

  constructor(private readonly config: ConfigService) {}

  private items(): { name: string; everyDays: number }[] {
    const raw = this.config.get<string>('ROTATION_STATUS_SECRETS');
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (i): i is { name: string; everyDays: number } =>
            !!i &&
            typeof (i as { name?: unknown }).name === 'string' &&
            typeof (i as { everyDays?: unknown }).everyDays === 'number',
        )
        .map((i) => ({ name: i.name, everyDays: i.everyDays }));
    } catch {
      return [];
    }
  }

  get enabled(): boolean {
    return this.items().length > 0;
  }

  private client(): CloudWatchClient {
    return (this.cw ??= new CloudWatchClient({
      region:
        this.config.get<string>('AWS_REGION') ??
        this.config.get<string>('S3_REGION') ??
        'us-east-1',
    }));
  }

  private async latest(
    namespace: string,
    secret: string,
    metric: string,
    now: Date,
  ): Promise<number | null> {
    const res = await this.client().send(
      new GetMetricStatisticsCommand({
        Namespace: namespace,
        MetricName: metric,
        Dimensions: [{ Name: 'Secret', Value: secret }],
        StartTime: new Date(now.getTime() - ROTATION_STALE_MS),
        EndTime: now,
        Period: 3600,
        Statistics: ['Maximum'],
      }),
    );
    const pts = (res.Datapoints ?? [])
      .filter((p) => typeof p.Maximum === 'number' && p.Timestamp)
      .sort((a, b) => a.Timestamp!.getTime() - b.Timestamp!.getTime());
    return pts.length ? (pts[pts.length - 1].Maximum as number) : null;
  }

  async rows(now: Date = new Date()): Promise<RotationRow[]> {
    const namespace = this.config.get<string>('ROTATION_METRIC_NAMESPACE');
    const items = this.items();
    if (!namespace) return items.map((i) => rotationRow(i.name, i.everyDays, null, now));
    return Promise.all(
      items.map(async (i) => {
        const [last, created, enabled, overdue, failed] = await Promise.all(
          [
            'LastRotatedEpoch',
            'CreatedEpoch',
            'RotationEnabled',
            'Overdue',
            'Failed',
          ].map((m) => this.latest(namespace, i.name, m, now)),
        );
        const facts: RotationFacts | null =
          created === null
            ? null
            : {
                lastRotatedEpoch: last ?? 0,
                createdEpoch: created,
                rotationEnabled: (enabled ?? 0) > 0,
                overdue: (overdue ?? 0) > 0,
                failed: (failed ?? 0) > 0,
              };
        return rotationRow(i.name, i.everyDays, facts, now);
      }),
    );
  }
}
