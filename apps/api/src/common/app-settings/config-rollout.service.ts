import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type Redis from 'ioredis';
import type { Prisma } from '../../generated/prisma/client';
import { AuditLogService } from '../../modules/admin-access/audit-log.service';
import { dropAppConfigCache } from '../../modules/feature-flags/services/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { ErrorCode } from '../errors/error-code.enum';
import { APP_SETTINGS } from './app-settings.defaults';
import {
  ROLLOUT_AUDIT,
  ROLLOUTS_KEY,
  addRollout,
  auditChange,
  breachOf,
  newRollout,
  parseRollouts,
  rolloutSettings,
  type ConfigRollout,
} from './config-rollout';

type Tx = Prisma.TransactionClient;
type Json = Prisma.JsonValue;

/** A writer's change, staged in its own transaction. */
export interface StagedChange {
  adminId: string;
  action: string;
  before: Record<string, Json | null>;
  after: Record<string, Json | null>;
}

export interface WatchResult {
  promoted: string[];
  reverted: { id: string; alarm: string }[];
}

/**
 * Б3: the rollout records of setting changes (config-rollout.ts has the
 * why). Writers call [stage] inside their transaction; the worker calls
 * [watch] every minute; the admin «Вернуть» / «Применить всем сейчас»
 * buttons call [revertChange] / [promoteNow] (2FA in the controller).
 */
@Injectable()
export class ConfigRolloutService {
  private readonly log = new Logger(ConfigRolloutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** Inside the writer's transaction: records the change under watch, or
   * nothing (watch off, only skipped keys). Returns the rollout or null. */
  async stage(
    tx: Tx,
    change: StagedChange,
    now = new Date(),
  ): Promise<ConfigRollout | null> {
    // The API e2e suites save a setting and use it in the next request (one
    // process, no canary heartbeat): there every change applies at once, as
    // before. The rollout specs opt in.
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.SETTINGS_ROLLOUT_IN_TESTS !== '1'
    ) {
      return null;
    }
    const rows = await tx.appConfig.findMany({
      where: {
        key: {
          in: [
            ROLLOUTS_KEY,
            'settings.watch_minutes',
            'settings.canary_percent',
            'settings.canary_skip_prefixes',
          ],
        },
      },
      select: { key: true, value: true },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const rollout = newRollout(change, rolloutSettings(map), now);
    if (!rollout) return null;
    const list = addRollout(parseRollouts(map[ROLLOUTS_KEY]), rollout);
    await this.save(tx, list);
    return list[list.length - 1];
  }

  /** The changes under watch now (admin banner). */
  async pending(): Promise<ConfigRollout[]> {
    const row = await this.prisma.appConfig.findUnique({
      where: { key: ROLLOUTS_KEY },
    });
    return parseRollouts(row?.value);
  }

  /** The worker, every minute: revert on a fresh SLO alarm, else promote
   * once the window is over. */
  async watch(now = new Date()): Promise<WatchResult> {
    const result: WatchResult = { promoted: [], reverted: [] };
    const list = await this.pending();
    if (list.length === 0) return result;
    const earliest = new Date(
      Math.min(...list.map((r) => Date.parse(r.startedAt))),
    );
    const alarms = await this.prisma.systemIncident.findMany({
      where: {
        component: { startsWith: 'alarm:' },
        opened_at: { gte: earliest },
      },
      select: { component: true, opened_at: true, closed_at: true },
    });
    for (const r of list) {
      const alarm = breachOf(r, alarms);
      if (alarm) {
        if (await this.finish(r.id, 'revert', null, alarm.component)) {
          result.reverted.push({ id: r.id, alarm: alarm.component });
          this.log.warn(
            {
              alert: 'settings_auto_revert',
              rollout: r.id,
              keys: r.keys,
              alarm: alarm.component,
            },
            `setting change reverted: ${alarm.component} fired during its watch`,
          );
        }
      } else if (Date.parse(r.watchUntil) <= now.getTime()) {
        if (await this.finish(r.id, 'promote', null, null)) {
          result.promoted.push(r.id);
        }
      }
    }
    return result;
  }

  /** «Применить всем сейчас» (emergency, 2FA in the controller). */
  async promoteNow(adminId: string, id: string, ip?: string): Promise<void> {
    if (!(await this.finish(id, 'emergency', { adminId, ip }, null))) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'This change is no longer under watch.',
      });
    }
  }

  /** «Вернуть» on a change still under watch: the old values for everyone
   * now (2FA in the controller). */
  async cancel(adminId: string, id: string, ip?: string): Promise<void> {
    if (!(await this.finish(id, 'cancel', { adminId, ip }, null))) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'This change is no longer under watch.',
      });
    }
  }

  /**
   * «Вернуть» on a settings row of the audit log: the old values go back
   * for everyone at once (a rollback is not canaried). Refused when a key
   * was changed again since (409, nothing written).
   */
  async revertChange(
    adminId: string,
    auditId: string,
    ip?: string,
  ): Promise<{ keys: string[] }> {
    const row = await this.prisma.auditLog.findUnique({
      where: { id: auditId },
      select: { target_type: true, before: true, after: true },
    });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Audit row not found.',
      });
    }
    const change =
      row.target_type === 'app_config'
        ? auditChange(row.before, row.after)
        : null;
    const keys = change
      ? Object.keys(change.after).filter((k) => k in APP_SETTINGS)
      : [];
    if (!change || keys.length === 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'This row is not a settings change that can be reverted.',
      });
    }
    await withTxRetry(this.prisma, async (tx) => {
      const now = await tx.appConfig.findMany({
        where: { key: { in: [...keys, ROLLOUTS_KEY] } },
        select: { key: true, value: true },
      });
      const current = new Map(now.map((r) => [r.key, r.value]));
      const changed = keys.filter(
        (k) =>
          JSON.stringify(current.get(k) ?? null) !==
          JSON.stringify(change.after[k] ?? null),
      );
      if (changed.length > 0) {
        throw new ConflictException({
          code: ErrorCode.STALE_VERSION,
          message: `Changed again since: ${changed.join(', ')}. Revert the newer change first.`,
          details: { keys: changed },
        });
      }
      for (const k of keys) await this.put(tx, k, change.before[k] ?? null);
      // The keys leave any watch: their old values are back for everyone.
      const list = parseRollouts(current.get(ROLLOUTS_KEY))
        .map((r) => this.withoutKeys(r, keys))
        .filter((r): r is ConfigRollout => r !== null);
      await this.save(tx, list);
      await this.audit.record(
        {
          adminId,
          action: ROLLOUT_AUDIT.revert,
          targetType: 'app_config',
          targetId: auditId,
          before: Object.fromEntries(
            keys.map((k) => [
              k,
              (change.after[k] ?? null) as Prisma.InputJsonValue,
            ]),
          ),
          after: Object.fromEntries(
            keys.map((k) => [
              k,
              (change.before[k] ?? null) as Prisma.InputJsonValue,
            ]),
          ),
          ip: ip ?? null,
        },
        tx,
      );
    });
    await dropAppConfigCache(this.redis);
    return { keys };
  }

  // ---------------------------------------------------------------------

  /** Ends one rollout in one transaction with its audit row. False when it
   * is gone already (another worker or the admin was first). */
  private async finish(
    id: string,
    how: 'revert' | 'cancel' | 'promote' | 'emergency',
    by: { adminId: string; ip?: string } | null,
    alarm: string | null,
  ): Promise<boolean> {
    const done = await withTxRetry(this.prisma, async (tx) => {
      const row = await tx.appConfig.findUnique({
        where: { key: ROLLOUTS_KEY },
      });
      const list = parseRollouts(row?.value);
      const r = list.find((x) => x.id === id);
      if (!r) return false;
      const back = how === 'revert' || how === 'cancel';
      if (back) {
        for (const k of r.keys) await this.put(tx, k, r.before[k] ?? null);
      }
      await this.save(
        tx,
        list.filter((x) => x.id !== id),
      );
      const values = (m: Record<string, Json | null>) =>
        Object.fromEntries(
          r.keys.map((k) => [k, (m[k] ?? null) as Prisma.InputJsonValue]),
        );
      await this.audit.record(
        {
          adminId: by?.adminId ?? r.adminId,
          action: {
            revert: ROLLOUT_AUDIT.autoRevert,
            cancel: ROLLOUT_AUDIT.revert,
            promote: ROLLOUT_AUDIT.promoted,
            emergency: ROLLOUT_AUDIT.emergency,
          }[how],
          targetType: 'app_config',
          targetId: null,
          before: back ? values(r.after) : values(r.before),
          after: {
            ...(back ? values(r.before) : values(r.after)),
            _rollout: {
              id: r.id,
              action: r.action,
              startedAt: r.startedAt,
              watchUntil: r.watchUntil,
              percent: r.percent,
              ...(alarm ? { alarm } : {}),
            },
          },
          ip: by?.ip ?? null,
        },
        tx,
      );
      return true;
    });
    if (done) await dropAppConfigCache(this.redis);
    return done;
  }

  private withoutKeys(r: ConfigRollout, keys: string[]): ConfigRollout | null {
    const rest = r.keys.filter((k) => !keys.includes(k));
    if (rest.length === 0) return null;
    const pick = (m: Record<string, Json | null>) =>
      Object.fromEntries(rest.map((k) => [k, m[k] ?? null]));
    return { ...r, keys: rest, before: pick(r.before), after: pick(r.after) };
  }

  private async put(tx: Tx, key: string, value: Json | null): Promise<void> {
    if (value === null) {
      await tx.appConfig.deleteMany({ where: { key } });
      return;
    }
    const v = value as Prisma.InputJsonValue;
    await tx.appConfig.upsert({
      where: { key },
      create: { key, value: v },
      update: { value: v },
    });
  }

  private async save(tx: Tx, list: ConfigRollout[]): Promise<void> {
    if (list.length === 0) {
      await tx.appConfig.deleteMany({ where: { key: ROLLOUTS_KEY } });
      return;
    }
    const value = list as unknown as Prisma.InputJsonValue;
    await tx.appConfig.upsert({
      where: { key: ROLLOUTS_KEY },
      create: { key: ROLLOUTS_KEY, value },
      update: { value },
    });
  }
}
