import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { OpsStateService } from '../../common/ops/ops-state.service';
import { pressures } from '../../common/economy/economy.rules';
import {
  computeRowStatus,
  type RowStatus,
  type StatusSignals,
  type UsageLevelLike,
} from '../../common/ops/cost-registry.status';
import { USAGE_SNAPSHOT_REDIS_KEY } from '../../common/ops/usage/usage-hard-stop.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { AppSettingsWriter } from '../../common/app-settings/app-settings.writer';
import { COST_PROVIDERS } from '../../common/cost-guard/cost-guard.constants';
import {
  COST_REGISTRY,
  LADDER_USERS,
  STATE_LABEL,
  dayOneTotals,
  stepsFor,
  totalAtUsers,
  type CostEntry,
  type CostState,
} from '../../common/ops/cost-registry';
import {
  SSM_MODE_BY_STATE,
  SSM_STATE_BY_MODE,
  attributeSpend,
  stateFromStored,
  stateHint,
} from '../../common/ops/cost-registry.logic';
import { SpendService } from '../../common/ops/spend/spend.service';
import { SsmParamGateway } from '../../common/ops/ssm-param.gateway';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  INFRA_SWITCH_IDS,
  InfraChangeService,
} from './infra/infra-change.service';

interface UsageSnap {
  at?: string;
  cloudflare?: { level?: string };
  bunny?: { bandwidthLevel?: string; storageLevel?: string };
}

export class RegistryModeError extends Error {
  constructor(
    readonly code: 'unknown_item' | 'not_editable' | 'bad_state' | 'not_on_aws',
    message: string,
  ) {
    super(message);
  }
}

export interface RegistryRow {
  id: string;
  name: string;
  purpose: string;
  kind: CostEntry['kind'];
  controlType: CostEntry['control']['type'];
  /** The setting key / Terraform variables / why it is fixed. */
  controlKey: string;
  editable: boolean;
  /** Выкл / Вкл creates a cloud change request (plan → 2FA → apply). */
  infraSwitch: boolean;
  lockedReason: string | null;
  states: CostState[];
  defaultState: CostState;
  state: CostState | null;
  stateKnown: boolean;
  stateNote: string | null;
  stateHints: Partial<Record<CostState, string>>;
  ceilingLabel: string | null;
  ceilingKey: string | null;
  ceilingWhere: string | null;
  priceText: string;
  priceModel: string;
  priceSourceUrl: string;
  priceCheckedAt: string;
  priceVerified: boolean;
  usdLaunch: number[];
  usdK100: number[];
  usdM1: number[];
  ifOnUsd: number[] | null;
  needed: CostEntry['needed'];
  neededNote: string;
  alarm: string | null;
  note: string | null;
  ceService: string | null;
  status: RowStatus;
  monthUsd: number | null;
  projectedUsd: number | null;
  monthSource: 'real' | 'split' | 'none';
  steps: Record<string, string[]>;
}

export interface RegistryReport {
  generatedAt: string;
  spendRefreshedAt: string | null;
  rows: RegistryRow[];
  /** AWS services on this month's bill that no registry row claims. */
  unclaimed: { service: string; usd: number }[];
  ladder: {
    dayOne: { aws: number[]; vendors: number[]; all: number[] };
    scenarios: { users: number; usd: number[] }[];
    monthToDateUsd: number | null;
    projectedUsd: number | null;
  };
}

const EDITABLE: CostEntry['control']['type'][] = ['app-setting', 'ssm-mode'];

@Injectable()
export class CostRegistryService {
  constructor(
    private readonly spend: SpendService,
    private readonly settings: AppSettingsService,
    private readonly ssm: SsmParamGateway,
    private readonly writer: AppSettingsWriter,
    private readonly audit: AuditLogService,
    private readonly ops: OpsStateService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly infra?: InfraChangeService,
  ) {}

  /** search.engine (for the «пора включить OpenSearch» suggestion). */
  async searchEngine(): Promise<string | null> {
    try {
      return await this.settings.string('search.engine');
    } catch {
      return null;
    }
  }

  private controlKey(e: CostEntry): string {
    const c = e.control;
    if (c.type === 'app-setting') return c.key;
    if (c.type === 'ssm-mode') return `SSM: ${c.target}-autoscale/mode`;
    if (c.type === 'tfvars') return c.vars.join(', ');
    return c.reason;
  }

  /** Why the owner cannot flip this one from here, or null when they can. */
  private lockedReason(e: CostEntry): string | null {
    const c = e.control;
    // Owner 2026-10-26: whitelisted Terraform rows are switched from here
    // through a change request (plan → 2FA → apply).
    if (c.type === 'tfvars' && INFRA_SWITCH_IDS.has(e.id)) return null;
    if (c.type === 'tfvars') {
      return 'Меняется строкой в terraform.tfvars; шаги ниже.';
    }
    if (c.type === 'fixed') return c.reason;
    if (c.type === 'ssm-mode' && !this.ssm.modeParam(c.target)) {
      return 'Автомасштаб не создан в AWS (на этом стенде его нет).';
    }
    if (e.states.length < 2) {
      return 'У этого пункта нет другого положения.';
    }
    return null;
  }

  private async liveState(
    e: CostEntry,
    infraLive?: Map<string, 'off' | 'on'>,
  ): Promise<{ state: CostState | null; known: boolean; note: string | null }> {
    const c = e.control;
    if (c.type === 'tfvars' && infraLive?.has(e.id)) {
      return { state: infraLive.get(e.id)!, known: true, note: null };
    }
    if (c.type === 'app-setting') {
      const stored = await this.settings.raw(c.key);
      const fallback = (APP_SETTINGS as Record<string, unknown>)[c.key];
      const r = stateFromStored(e, stored, fallback);
      return { state: r.state, known: r.known, note: r.note };
    }
    if (c.type === 'ssm-mode') {
      try {
        const mode = await this.ssm.getMode(c.target);
        if (mode === null) {
          return {
            state: null,
            known: false,
            note: 'Переключатель в AWS не найден.',
          };
        }
        return { state: SSM_STATE_BY_MODE[mode], known: true, note: null };
      } catch {
        return {
          state: null,
          known: false,
          note: 'AWS не ответил на чтение переключателя.',
        };
      }
    }
    // tfvars / fixed: the code default is what the registry knows.
    return { state: e.defaultState, known: false, note: null };
  }

  /**
   * The few cheap readings behind the status dots: the worker heartbeat, the
   * economy state, the cached AWS budget reading, the newest capacity reading
   * and the usage snapshot (all already in Redis). A source that fails says
   * «unknown», never an error.
   */
  async signals(now: Date): Promise<StatusSignals> {
    const safe = async <T>(f: () => Promise<T>): Promise<T | null> => {
      try {
        return await f();
      } catch {
        return null;
      }
    };
    const [hb, paused, econ, cost, cap, usageRaw] = await Promise.all([
      safe(() => this.ops.workerHeartbeat()),
      safe(() => this.ops.isHeavyPaused()),
      safe(() => this.ops.isEconomyLimited()),
      safe(() => this.ops.cost()),
      safe(() => this.ops.capacity()),
      safe(() => this.redis.get(USAGE_SNAPSHOT_REDIS_KEY)),
    ]);
    let usage: UsageSnap | null = null;
    try {
      usage = usageRaw ? (JSON.parse(usageRaw) as UsageSnap) : null;
    } catch {
      usage = null;
    }
    const lvl = (...v: (string | undefined)[]): UsageLevelLike | null => {
      if (!usage) return null;
      if (v.includes('crit')) return 'crit';
      if (v.includes('warn')) return 'warn';
      return 'ok';
    };
    return {
      workerAlive: hb ? now.getTime() - Date.parse(hb.at) < 180_000 : false,
      heavyPaused: paused ?? false,
      economyLimited: econ ?? false,
      budgetRatio:
        cost && cost.limitUsd > 0 ? cost.actualUsd / cost.limitUsd : null,
      pressures: cap
        ? pressures({
            dbCpuPercent: cap.dbCpuPercent,
            dbConnections: cap.dbConnections,
            dbMaxConnections: cap.dbMaxConnections,
            redisMemoryPercent: cap.redisMemoryPercent,
          }).map((p) => p.kind)
        : [],
      bunny: lvl(usage?.bunny?.bandwidthLevel, usage?.bunny?.storageLevel),
      cloudflare: lvl(usage?.cloudflare?.level),
      usageAgeHours: usage?.at
        ? (now.getTime() - Date.parse(usage.at)) / 3_600_000
        : null,
    };
  }

  async report(now: Date = new Date()): Promise<RegistryReport> {
    const [spendReport, raw] = await Promise.all([
      this.spend.report(now),
      this.spend.raw(),
    ]);
    const awsVendor = spendReport.vendors.find((v) => v.id === 'aws');
    const awsLines = raw?.aws?.data?.byService ?? null;
    const awsRatio =
      awsVendor?.forecastUsd != null && (awsVendor.monthToDateUsd ?? 0) > 0
        ? awsVendor.forecastUsd / awsVendor.monthToDateUsd!
        : null;
    const attr = attributeSpend(
      COST_REGISTRY,
      awsLines,
      awsRatio,
      spendReport.vendors.map((v) => ({
        id: v.id,
        monthToDateUsd: v.monthToDateUsd,
        forecastUsd: v.forecastUsd,
        lines: v.lines.map((l) => ({ label: l.label, usd: l.usd })),
      })),
      now,
    );
    let infraLive: Map<string, 'off' | 'on'> | undefined;
    try {
      infraLive = await this.infra?.liveStates();
    } catch {
      infraLive = undefined;
    }
    const live = await Promise.all(
      COST_REGISTRY.map((e) => this.liveState(e, infraLive)),
    );
    const signals = await this.signals(now);
    const rows: RegistryRow[] = COST_REGISTRY.map((e, i) => {
      const a = attr.byId[e.id];
      const locked = this.lockedReason(e);
      const steps: Record<string, string[]> = {};
      for (const st of e.states) steps[st] = stepsFor(e, st);
      const hints: Partial<Record<CostState, string>> = {};
      for (const st of e.states) {
        const h = stateHint(e.control, st);
        if (h) hints[st] = h;
      }
      return {
        id: e.id,
        name: e.name,
        purpose: e.purpose,
        kind: e.kind,
        controlType: e.control.type,
        controlKey: this.controlKey(e),
        editable:
          locked === null &&
          (EDITABLE.includes(e.control.type) || INFRA_SWITCH_IDS.has(e.id)),
        infraSwitch: INFRA_SWITCH_IDS.has(e.id),
        lockedReason: locked,
        states: e.states,
        defaultState: e.defaultState,
        state: live[i].state,
        stateKnown: live[i].known,
        stateNote: live[i].note,
        stateHints: hints,
        ceilingLabel: e.ceiling?.label ?? null,
        ceilingKey: e.ceiling?.key ?? null,
        ceilingWhere: e.ceiling?.where ?? null,
        priceText: e.price.text,
        priceModel: e.price.model,
        priceSourceUrl: e.price.sourceUrl,
        priceCheckedAt: e.price.checkedAt,
        priceVerified: e.price.verified,
        usdLaunch: [...e.usd.launch],
        usdK100: [...e.usd.k100],
        usdM1: [...e.usd.m1],
        ifOnUsd: e.ifOnUsd ? [...e.ifOnUsd] : null,
        needed: e.needed,
        neededNote: e.neededNote,
        alarm: e.alarm,
        note: e.note ?? null,
        ceService: e.ceService ?? null,
        status: computeRowStatus({
          entry: e,
          state: live[i].state,
          stateKnown: live[i].known,
          stateNote: live[i].note,
          signals,
          now,
        }),
        monthUsd: a.monthUsd,
        projectedUsd: a.projectedUsd,
        monthSource: a.source,
        steps,
      };
    });
    return {
      generatedAt: now.toISOString(),
      spendRefreshedAt: spendReport.refreshedAt,
      rows,
      unclaimed: attr.unclaimed,
      ladder: {
        dayOne: {
          aws: [...dayOneTotals().aws],
          vendors: [...dayOneTotals().vendors],
          all: [...dayOneTotals().all],
        },
        scenarios: LADDER_USERS.map((users) => ({
          users,
          usd: [...totalAtUsers(users)],
        })),
        monthToDateUsd: spendReport.total.monthToDateUsd,
        projectedUsd: spendReport.total.forecastUsd,
      },
    };
  }

  /**
   * Puts one editable item in [state]. app-setting: writes (or deletes, for
   * the 'default' sentinel) the app_config row and the audit row in one
   * transaction; ssm-mode: writes the SSM parameter, then the audit row.
   */
  async setMode(
    adminId: string,
    ip: string | null | undefined,
    id: string,
    state: CostState,
  ): Promise<{ id: string; state: CostState }> {
    const e = COST_REGISTRY.find((x) => x.id === id);
    if (!e) throw new RegistryModeError('unknown_item', `Unknown item ${id}`);
    if (!EDITABLE.includes(e.control.type)) {
      throw new RegistryModeError(
        'not_editable',
        INFRA_SWITCH_IDS.has(id)
          ? 'This cloud item is switched with a change request (POST /admin/infra/requests).'
          : 'This item is changed with terraform.tfvars, not from the admin.',
      );
    }
    if (!e.states.includes(state)) {
      throw new RegistryModeError(
        'bad_state',
        `State ${state} is not available for this item.`,
      );
    }
    const before = await this.liveState(e);
    const c = e.control;

    if (c.type === 'app-setting') {
      const capKey = new RegExp(
        `^budget\\.(${COST_PROVIDERS.join('|')})\\.monthly_max$`,
      );
      if (!(c.key in APP_SETTINGS) && !capKey.test(c.key)) {
        throw new RegistryModeError('not_editable', `No setting ${c.key}.`);
      }
      const value = c.map[state];
      // The writer / remover record the audit row in the same transaction
      // as the change and drop the config cache.
      if (value === 'default') {
        await this.writer.remove(adminId, 'ops.cost_registry_mode', [c.key]);
      } else {
        await this.writer.write(adminId, 'ops.cost_registry_mode', {
          [c.key]: value,
        });
      }
      return { id, state };
    }

    // ssm-mode
    if (c.type !== 'ssm-mode') {
      throw new RegistryModeError('not_editable', 'Not a switch.');
    }
    if (!this.ssm.modeParam(c.target)) {
      throw new RegistryModeError(
        'not_on_aws',
        'The autoscaler is not on AWS.',
      );
    }
    await this.ssm.setMode(c.target, SSM_MODE_BY_STATE[state]);
    await this.audit.record({
      adminId,
      action: 'ops.cost_registry_mode',
      targetType: 'system',
      targetId: null,
      before: {
        id,
        state: before.state,
        mode: before.state ? STATE_LABEL[before.state] : null,
      },
      after: { id, state, mode: SSM_MODE_BY_STATE[state] },
      ip: ip ?? undefined,
    });
    return { id, state };
  }
}
