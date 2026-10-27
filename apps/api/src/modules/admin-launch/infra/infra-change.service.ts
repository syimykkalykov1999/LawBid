import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type InfraChangeRequest } from '@prisma/client';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { COST_REGISTRY } from '../../../common/ops/cost-registry';
import {
  INFRA_SWITCHES,
  forbiddenDestroys,
  switchFor,
  type InfraTarget,
  type PlanResource,
} from '../../../common/ops/infra-switches';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditLogService } from '../../admin-access/audit-log.service';
import {
  ACTIVE_STATUSES,
  REFUSAL_TEXT,
  changesFor,
  costDelta,
  createRefusal,
  dueTimeEvent,
  inQuietWindow,
  infraSuggestions,
  transition,
  type CreateRefusal,
  type InfraEvent,
  type InfraStatus,
  type InfraSuggestion,
  type SuggestionSignals,
} from './infra-change.logic';
import { InfraGithubClient, type WorkflowCaller } from './infra-github.client';

export class InfraRequestError extends Error {
  constructor(
    readonly code:
      CreateRefusal | 'not_found' | 'wrong_status' | 'quiet_hours' | 'bad_plan',
    message: string,
  ) {
    super(message);
  }
}

export interface InfraRequestView {
  id: string;
  itemId: string;
  itemName: string;
  fromState: string | null;
  toState: string;
  changes: Record<string, unknown>;
  status: InfraStatus;
  costDeltaUsd: number[];
  dryRun: boolean;
  rollbackOf: string | null;
  plan: {
    add: number;
    change: number;
    destroy: number;
    resources: PlanResource[];
  } | null;
  runUrl: string | null;
  recorded: string | null;
  error: string | null;
  impact: string;
  createdAt: string;
  plannedAt: string | null;
  /** When an unconfirmed plan is thrown away. */
  expiresAt: string | null;
  finishedAt: string | null;
}

const PLAN_TTL_MS = 30 * 60_000;

function asStatus(s: string): InfraStatus {
  return s as InfraStatus;
}

/**
 * Owner 2026-10-26: infra change requests (docs/runbooks/infra-from-admin.md).
 * Admin side: create / confirm (2FA in the controller) / cancel / rollback.
 * Workflow side (OIDC-verified in the controller): take the job, report the
 * plan, poll the decision, report apply. Every step is one guarded status
 * change (`UPDATE … WHERE status = <expected>`) plus an audit row for the
 * owner's actions; time limits are applied lazily on every read.
 */
@Injectable()
export class InfraChangeService {
  private readonly log = new Logger(InfraChangeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly audit: AuditLogService,
    private readonly github: InfraGithubClient,
  ) {}

  // --- reads -----------------------------------------------------------------

  view(r: InfraChangeRequest): InfraRequestView {
    const entry = COST_REGISTRY.find((e) => e.id === r.item_id);
    const plan = r.plan_summary as InfraRequestView['plan'];
    return {
      id: r.id,
      itemId: r.item_id,
      itemName: entry?.name ?? r.item_id,
      fromState: r.from_state,
      toState: r.to_state,
      changes: (r.changes ?? {}) as Record<string, unknown>,
      status: asStatus(r.status),
      costDeltaUsd: (r.cost_delta_usd as number[]) ?? [0, 0],
      dryRun: r.dry_run,
      rollbackOf: r.rollback_of,
      plan: plan ?? null,
      runUrl: r.run_url,
      recorded: r.recorded,
      error: r.error,
      impact: switchFor(r.item_id)?.impact ?? '',
      createdAt: r.created_at.toISOString(),
      plannedAt: r.planned_at?.toISOString() ?? null,
      expiresAt:
        r.status === 'planned' && r.planned_at
          ? new Date(r.planned_at.getTime() + PLAN_TTL_MS).toISOString()
          : null,
      finishedAt: r.finished_at?.toISOString() ?? null,
    };
  }

  /** Applies the due time limits to the active requests. */
  async sweep(now: Date = new Date()): Promise<void> {
    const active = await this.prisma.infraChangeRequest.findMany({
      where: { status: { in: [...ACTIVE_STATUSES] } },
    });
    for (const r of active) {
      const ev = dueTimeEvent(
        {
          status: asStatus(r.status),
          createdAt: r.created_at,
          plannedAt: r.planned_at,
          updatedAt: r.updated_at,
        },
        now,
      );
      if (!ev) continue;
      await this.move(r, ev, {
        error:
          ev === 'expire'
            ? 'План не подтверждён за 30 минут и выброшен.'
            : 'Нет ответа от GitHub. Откройте журнал запуска.',
        finished_at: now,
      });
    }
  }

  async recent(limit = 20): Promise<InfraRequestView[]> {
    await this.sweep();
    const rows = await this.prisma.infraChangeRequest.findMany({
      orderBy: { created_at: 'desc' },
      take: limit,
    });
    return rows.map((r) => this.view(r));
  }

  /**
   * The position of every switchable row: the last finished request that
   * changed it (null = never changed from the admin: the Terraform default
   * / terraform.tfvars decides, the page shows the registry default).
   */
  async liveStates(): Promise<Map<string, InfraTarget>> {
    const rows = await this.prisma.infraChangeRequest.findMany({
      where: { status: 'done' },
      orderBy: { finished_at: 'desc' },
      distinct: ['item_id'],
      select: { item_id: true, to_state: true },
    });
    const out = new Map<string, InfraTarget>();
    for (const r of rows) {
      if (r.to_state === 'on' || r.to_state === 'off') {
        out.set(r.item_id, r.to_state);
      }
    }
    return out;
  }

  async suggestions(s: SuggestionSignals): Promise<InfraSuggestion[]> {
    const live = await this.liveStates();
    return infraSuggestions(s, (id) => {
      const known = live.get(id);
      if (known) return known;
      const d = COST_REGISTRY.find((e) => e.id === id)?.defaultState;
      return d === 'on' || d === 'off' ? d : null;
    });
  }

  async guards(): Promise<{
    dryRun: boolean;
    dailyCap: number;
    quietHours: string;
    configured: boolean;
    inQuietWindow: boolean;
  }> {
    const [dryRun, dailyCap, quietRaw, configured] = await Promise.all([
      this.settings.boolean('infra.dry_run'),
      this.settings.number('infra.daily_cap'),
      this.settings.raw('infra.quiet_hours'),
      this.github.configured(),
    ]);
    const quietHours = typeof quietRaw === 'string' ? quietRaw : '';
    return {
      dryRun,
      dailyCap,
      quietHours,
      configured,
      inQuietWindow: inQuietWindow(quietHours, new Date()),
    };
  }

  // --- admin actions -----------------------------------------------------------

  async create(
    adminId: string,
    ip: string | null | undefined,
    itemId: string,
    to: string,
    rollbackOf: string | null = null,
  ): Promise<InfraRequestView> {
    await this.sweep();
    const entry = COST_REGISTRY.find((e) => e.id === itemId);
    const sw = switchFor(itemId);
    const live = await this.liveStates();
    const def = entry?.defaultState;
    const current: InfraTarget | null =
      live.get(itemId) ?? (def === 'on' || def === 'off' ? def : null);
    const since = new Date(Date.now() - 24 * 3600_000);
    const [activeCount, last24h, g] = await Promise.all([
      this.prisma.infraChangeRequest.count({
        where: { status: { in: [...ACTIVE_STATUSES] } },
      }),
      this.prisma.infraChangeRequest.count({
        where: { created_at: { gte: since }, status: { not: 'cancelled' } },
      }),
      this.guards(),
    ]);
    const refusal = createRefusal({
      entry,
      sw,
      to,
      // Only a position the admin itself set is "known" for same-state.
      current: live.get(itemId) ?? null,
      activeCount,
      last24h,
      dailyCap: g.dailyCap,
      configured: g.configured,
    });
    if (refusal) throw new InfraRequestError(refusal, REFUSAL_TEXT[refusal]);
    const target = to as InfraTarget;
    const delta = costDelta(entry!, sw!, current, target);
    let row: InfraChangeRequest;
    try {
      row = await this.prisma.infraChangeRequest.create({
        data: {
          item_id: itemId,
          from_state: current,
          to_state: target,
          changes: changesFor(sw!, target),
          requested_by: adminId,
          cost_delta_usd: delta,
          dry_run: g.dryRun,
          rollback_of: rollbackOf,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new InfraRequestError('busy', REFUSAL_TEXT.busy);
      }
      throw e;
    }
    await this.audit.record({
      adminId,
      action: rollbackOf ? 'ops.infra_rollback' : 'ops.infra_request',
      targetType: 'infra_change_request',
      targetId: row.id,
      before: { item: itemId, state: current },
      after: {
        item: itemId,
        state: target,
        costDeltaUsd: delta,
        dryRun: g.dryRun,
      },
      ip: ip ?? undefined,
    });
    try {
      await this.github.dispatch(row.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`infra dispatch failed for ${row.id}: ${msg}`);
      row = await this.move(row, 'dispatch_failed', {
        error: `GitHub не запустил процесс: ${msg}`,
        finished_at: new Date(),
      });
    }
    return this.view(row);
  }

  async confirm(
    adminId: string,
    ip: string | null | undefined,
    id: string,
  ): Promise<InfraRequestView> {
    await this.sweep();
    const r = await this.find(id);
    if (r.status !== 'planned') {
      throw new InfraRequestError(
        'wrong_status',
        r.status === 'expired'
          ? 'План устарел (прошло больше 30 минут). Нажмите переключатель ещё раз.'
          : 'Этот запрос сейчас нельзя подтвердить.',
      );
    }
    const quiet = await this.settings.raw('infra.quiet_hours');
    if (!inQuietWindow(typeof quiet === 'string' ? quiet : '', new Date())) {
      throw new InfraRequestError(
        'quiet_hours',
        `Применять можно только в тихие часы: ${String(quiet)} (Чикаго).`,
      );
    }
    const row = await this.move(r, 'confirm', {
      confirmed_by: adminId,
      confirmed_at: new Date(),
    });
    await this.audit.record({
      adminId,
      action: 'ops.infra_confirm',
      targetType: 'infra_change_request',
      targetId: id,
      before: { status: 'planned' },
      after: {
        status: 'confirmed',
        item: r.item_id,
        state: r.to_state,
        plan: r.plan_summary
          ? {
              add: (r.plan_summary as { add?: number }).add ?? 0,
              change: (r.plan_summary as { change?: number }).change ?? 0,
              destroy: (r.plan_summary as { destroy?: number }).destroy ?? 0,
            }
          : null,
      },
      ip: ip ?? undefined,
    });
    return this.view(row);
  }

  async cancel(
    adminId: string,
    ip: string | null | undefined,
    id: string,
  ): Promise<InfraRequestView> {
    const r = await this.find(id);
    const row = await this.move(r, 'cancel', { finished_at: new Date() });
    await this.audit.record({
      adminId,
      action: 'ops.infra_cancel',
      targetType: 'infra_change_request',
      targetId: id,
      before: { status: r.status },
      after: { status: 'cancelled' },
      ip: ip ?? undefined,
    });
    return this.view(row);
  }

  /** «Откатить» = a new request back to the state before [id]. */
  async rollback(
    adminId: string,
    ip: string | null | undefined,
    id: string,
  ): Promise<InfraRequestView> {
    const r = await this.find(id);
    if (r.status !== 'done') {
      throw new InfraRequestError(
        'wrong_status',
        'Откатить можно только применённое изменение.',
      );
    }
    const back: InfraTarget = r.to_state === 'on' ? 'off' : 'on';
    return this.create(adminId, ip, r.item_id, back, r.id);
  }

  // --- workflow side (caller already verified) --------------------------------

  /** The workflow takes the job: what to write. requested → planning. */
  async jobStart(
    id: string,
    caller: WorkflowCaller,
  ): Promise<{
    id: string;
    itemId: string;
    changes: Record<string, unknown>;
    dryRun: boolean;
    status: InfraStatus;
  }> {
    let r = await this.find(id);
    if (r.status === 'requested') {
      r = await this.move(r, 'job_started', {
        run_id: caller.runId,
        run_url: caller.runUrl,
      });
    } else if (r.status !== 'planning' || r.run_id !== caller.runId) {
      throw new InfraRequestError(
        'wrong_status',
        `request is ${r.status}; nothing to do`,
      );
    }
    return {
      id: r.id,
      itemId: r.item_id,
      changes: r.changes as Record<string, unknown>,
      dryRun: r.dry_run,
      status: asStatus(r.status),
    };
  }

  /** The plan is ready. Refuses (and fails the request) on a forbidden destroy. */
  async planReady(
    id: string,
    caller: WorkflowCaller,
    plan: {
      add: number;
      change: number;
      destroy: number;
      resources: PlanResource[];
      fileBefore: Record<string, unknown>;
    },
  ): Promise<InfraRequestView> {
    const r = await this.ownJob(id, caller, ['planning']);
    const bad = forbiddenDestroys(plan.resources);
    if (bad.length > 0) {
      await this.move(r, 'plan_failed', {
        error: `План удаляет данные, это запрещено: ${bad.slice(0, 5).join(', ')}`,
        plan_summary: this.summary(plan),
        finished_at: new Date(),
      });
      throw new InfraRequestError('bad_plan', 'plan destroys protected data');
    }
    const now = new Date();
    const row = await this.move(
      r,
      r.dry_run ? 'plan_ready_dry_run' : 'plan_ready',
      {
        plan_summary: this.summary(plan),
        file_before: plan.fileBefore as Prisma.InputJsonValue,
        planned_at: now,
        ...(r.dry_run ? { finished_at: now } : {}),
      },
    );
    return this.view(row);
  }

  /** What the waiting workflow should do now. */
  async decision(
    id: string,
    caller: WorkflowCaller,
  ): Promise<{ decision: 'wait' | 'apply' | 'stop'; status: InfraStatus }> {
    await this.sweep();
    const r = await this.find(id);
    if (r.run_id !== caller.runId) {
      throw new InfraRequestError('wrong_status', 'another run');
    }
    const status = asStatus(r.status);
    if (status === 'planned') return { decision: 'wait', status };
    if (status === 'confirmed') return { decision: 'apply', status };
    return { decision: 'stop', status };
  }

  /** applying / done / failed / plan_failed from the workflow. */
  async report(
    id: string,
    caller: WorkflowCaller,
    body: {
      status: 'applying' | 'done' | 'failed' | 'plan_failed';
      error?: string;
      recorded?: string;
    },
  ): Promise<InfraRequestView> {
    const now = new Date();
    const clip = (s?: string) => (s ? s.slice(0, 500) : null);
    if (body.status === 'plan_failed') {
      const r = await this.ownJob(id, caller, ['requested', 'planning']);
      return this.view(
        await this.move(r, 'plan_failed', {
          error: clip(body.error) ?? 'План не получился. Откройте журнал.',
          finished_at: now,
        }),
      );
    }
    if (body.status === 'applying') {
      const r = await this.ownJob(id, caller, ['confirmed']);
      return this.view(await this.move(r, 'apply_started', {}));
    }
    const r = await this.ownJob(id, caller, ['applying', 'confirmed']);
    if (body.status === 'failed') {
      return this.view(
        await this.move(r, 'apply_failed', {
          error: clip(body.error) ?? 'Применение не удалось. Откройте журнал.',
          finished_at: now,
        }),
      );
    }
    const row = await this.move(r, 'apply_done', {
      recorded: clip(body.recorded),
      finished_at: now,
    });
    if (row.rollback_of) {
      const orig = await this.prisma.infraChangeRequest.findUnique({
        where: { id: row.rollback_of },
      });
      if (orig && orig.status === 'done') {
        await this.move(orig, 'rolled_back', {});
      }
    }
    return this.view(row);
  }

  // --- helpers -------------------------------------------------------------------

  private summary(p: {
    add: number;
    change: number;
    destroy: number;
    resources: PlanResource[];
  }): Prisma.InputJsonValue {
    return {
      add: p.add,
      change: p.change,
      destroy: p.destroy,
      resources: p.resources.slice(0, 60).map((x) => ({
        address: x.address.slice(0, 200),
        action: x.action.slice(0, 40),
      })),
    };
  }

  private async find(id: string): Promise<InfraChangeRequest> {
    const r = /^[0-9a-f-]{36}$/i.test(id)
      ? await this.prisma.infraChangeRequest.findUnique({ where: { id } })
      : null;
    if (!r) throw new InfraRequestError('not_found', 'No such request.');
    return r;
  }

  private async ownJob(
    id: string,
    caller: WorkflowCaller,
    statuses: InfraStatus[],
  ): Promise<InfraChangeRequest> {
    const r = await this.find(id);
    if (r.run_id && r.run_id !== caller.runId) {
      throw new InfraRequestError('wrong_status', 'another run');
    }
    if (!statuses.includes(asStatus(r.status))) {
      throw new InfraRequestError(
        'wrong_status',
        `request is ${r.status}, expected ${statuses.join('|')}`,
      );
    }
    return r;
  }

  /**
   * One status change, only if nobody moved the row meanwhile (compare-and-
   * set on the status). Throws InfraRequestError when the event is not
   * allowed or lost the race.
   */
  private async move(
    r: InfraChangeRequest,
    event: InfraEvent,
    data: Prisma.InfraChangeRequestUpdateManyMutationInput,
  ): Promise<InfraChangeRequest> {
    let to: InfraStatus;
    try {
      to = transition(asStatus(r.status), event);
    } catch (e) {
      throw new InfraRequestError(
        'wrong_status',
        e instanceof Error ? e.message : 'bad transition',
      );
    }
    const res = await this.prisma.infraChangeRequest.updateMany({
      where: { id: r.id, status: r.status },
      data: { ...data, status: to },
    });
    if (res.count !== 1) {
      throw new InfraRequestError(
        'wrong_status',
        'The request changed meanwhile; refresh.',
      );
    }
    return this.prisma.infraChangeRequest.findUniqueOrThrow({
      where: { id: r.id },
    });
  }
}

/** Ids of the rows the admin can flip (for the registry page). */
export const INFRA_SWITCH_IDS: ReadonlySet<string> = new Set(
  INFRA_SWITCHES.map((s) => s.id),
);
