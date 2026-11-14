import { Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  Prisma,
  type InfraChangeRequest,
} from '../../../generated/prisma/client';
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
import { ShardMoveService } from '../../../sharding/move/shard-move.service';
import { AuditLogService } from '../../admin-access/audit-log.service';
import {
  ACTIVE_STATUSES,
  REFUSAL_TEXT,
  changesFor,
  PLAN_RESOURCE_LIMIT,
  costDelta,
  createRefusal,
  dueTimeEvent,
  failureSettled,
  inQuietWindow,
  infraSuggestions,
  serverRemovedBy,
  transition,
  type CreateRefusal,
  type InfraEvent,
  type InfraStatus,
  type InfraSuggestion,
  type SuggestionSignals,
} from './infra-change.logic';
import { SYSTEM_ACTOR_ID, autoApplyBlockers } from './infra-auto.logic';
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
  /** Row 86: failed, but the cloud already holds its target (failureSettled):
   * the row shows the item, not this failure; the request keeps its error. */
  settled: boolean;
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
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  /** Owner 2026-11-12: only an empty extra server may be removed. False
   * when emptiness cannot be read (a server that cannot be read is kept). */
  private async serverEmpty(key: string): Promise<boolean> {
    const moves = this.moduleRef?.get(ShardMoveService, { strict: false });
    if (!moves) return false;
    const empty: string[] = await moves.emptyServers().catch(() => []);
    return empty.includes(key);
  }

  // --- reads -----------------------------------------------------------------

  view(
    r: InfraChangeRequest,
    live?: ReadonlyMap<string, InfraTarget>,
  ): InfraRequestView {
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
      settled: failureSettled(
        { status: r.status, toState: r.to_state, plan: plan ?? null },
        entry?.awsTypes,
        live?.get(r.item_id),
      ),
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
      // 12.11: `id` breaks ties, so the same rows always come in one order
      // (the overview's ETag hashes this list).
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    // Row 86: a failure whose target the item already holds is «settled».
    const live = rows.some((r) => r.status === 'failed')
      ? await this.liveStates()
      : undefined;
    return rows.map((r) => this.view(r, live));
  }

  /**
   * The position of every switchable row: the last finished request that
   * changed it (null = never changed from the admin: the Terraform default
   * / terraform.tfvars decides, the page shows the registry default).
   */
  async liveStates(): Promise<Map<string, InfraTarget>> {
    const out = new Map<string, InfraTarget>();
    for (const [id, s] of await this.settled()) out.set(id, s.to);
    return out;
  }

  /**
   * Rows 8 / 9 (13.11): the items whose settled position (the same rule as
   * liveStates) was set by an automatic switch-on. «Авто» may switch these
   * off again by itself. Counting only «done» here missed the search domain
   * (all its automatic «Вкл» failed on Redis after it was created), so the
   * automation never treated it as its own and never switched it off.
   */
  async autoOwned(): Promise<Set<string>> {
    const out = new Set<string>();
    for (const [id, s] of await this.settled()) {
      if (s.to === 'on' && s.by === SYSTEM_ACTOR_ID) out.add(id);
    }
    return out;
  }

  /** The last finished request per item that proves the item's position. */
  private async settled(): Promise<
    Map<string, { to: InfraTarget; by: string }>
  > {
    // Row 9 (13.11): a failed request whose own plan touched nothing of the
    // item (failureSettled) proves the cloud already holds its target. The
    // search domain was created by an apply that then failed on Redis, so
    // no request for it is «done»; without this «Авто» thought it was off
    // and could never switch it off.
    const rows = await this.prisma.infraChangeRequest.findMany({
      where: { status: { in: ['done', 'failed'] }, finished_at: { not: null } },
      orderBy: { finished_at: 'desc' },
      take: 1000,
      select: {
        item_id: true,
        to_state: true,
        status: true,
        plan_summary: true,
        requested_by: true,
      },
    });
    const out = new Map<string, { to: InfraTarget; by: string }>();
    for (const r of rows) {
      if (out.has(r.item_id)) continue;
      if (r.to_state !== 'on' && r.to_state !== 'off') continue;
      const known =
        r.status === 'done' ||
        failureSettled(
          {
            status: r.status,
            toState: r.to_state,
            plan: (r.plan_summary as InfraRequestView['plan']) ?? null,
          },
          COST_REGISTRY.find((e) => e.id === r.item_id)?.awsTypes,
          undefined,
        );
      if (known) out.set(r.item_id, { to: r.to_state, by: r.requested_by });
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
    opts: { auto?: boolean } = {},
  ): Promise<InfraRequestView> {
    await this.sweep();
    // Automation audit 2026-11-08: an automatic request (infra-auto.service)
    // is made by the system, not an admin, and is real (owner: «Авто» must
    // act; infra.dry_run guards the admin buttons only).
    const auto = opts.auto === true && adminId === SYSTEM_ACTOR_ID;
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
    const removed = serverRemovedBy(itemId, to);
    if (removed && !(await this.serverEmpty(removed))) {
      throw new InfraRequestError(
        'server_has_data',
        REFUSAL_TEXT.server_has_data,
      );
    }
    const target = to as InfraTarget;
    const delta = costDelta(entry!, sw!, current, target);
    let row: InfraChangeRequest;
    try {
      row = await this.prisma.infraChangeRequest.create({
        data: {
          item_id: itemId,
          from_state: current,
          to_state: target,
          changes: changesFor(sw!, target, auto),
          requested_by: adminId,
          cost_delta_usd: delta,
          dry_run: auto ? false : g.dryRun,
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
    if (auto) {
      // The system has no admin row for the audit log (admin_id is a user);
      // the request row itself (requested_by = the zero id) is the action
      // log, shown on «Масштаб», and the on-call admins get a message.
      this.log.warn(
        `infra auto: ${itemId} ${current ?? '?'} -> ${target} (request ${row.id})`,
      );
    } else {
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
    }
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
    const changes = r.changes as Record<string, unknown>;
    const bad = forbiddenDestroys(plan.resources, changes);
    // Owner 2026-11-12: a plan that removes an extra server goes on only
    // while that server is still empty (checked again here, at plan time).
    const removed = serverRemovedBy(r.item_id, r.to_state);
    if (removed && !(await this.serverEmpty(removed))) {
      bad.push(`${removed}: на сервере есть данные`);
    }
    if (bad.length > 0) {
      await this.move(r, 'plan_failed', {
        error: `План удаляет данные, это запрещено: ${bad.slice(0, 5).join(', ')}`,
        plan_summary: this.summary(plan),
        finished_at: new Date(),
      });
      throw new InfraRequestError('bad_plan', 'plan destroys protected data');
    }
    const now = new Date();
    let row = await this.move(
      r,
      r.dry_run ? 'plan_ready_dry_run' : 'plan_ready',
      {
        plan_summary: this.summary(plan),
        file_before: plan.fileBefore as Prisma.InputJsonValue,
        planned_at: now,
        ...(r.dry_run ? { finished_at: now } : {}),
      },
    );
    // Automation audit 2026-11-08: nobody pressed anything, so nobody has to
    // confirm: a safe plan of an automatic request is applied at once (the
    // waiting workflow sees «apply» on its next poll). A plan that removes or
    // adds more than the item needs (D1-34: any address outside the item's
    // AUTO_SCOPE, any delete of serving infrastructure) stays «planned» for
    // the owner's 2FA.
    if (
      !r.dry_run &&
      r.requested_by === SYSTEM_ACTOR_ID &&
      (r.to_state === 'on' || r.to_state === 'off')
    ) {
      const blockers = autoApplyBlockers(r.to_state, plan.resources, r.item_id);
      if (blockers.length === 0) {
        row = await this.move(row, 'confirm', {
          confirmed_by: SYSTEM_ACTOR_ID,
          confirmed_at: now,
        });
      } else {
        this.log.warn(
          `infra auto ${r.id} (${r.item_id} -> ${r.to_state}) waits for the owner: ${blockers.slice(0, 5).join('; ')}`,
        );
      }
    }
    return this.view(row);
  }

  /** What the waiting workflow should do now. */
  async decision(
    id: string,
    caller: WorkflowCaller,
  ): Promise<{
    decision: 'wait' | 'apply' | 'stop';
    status: InfraStatus;
    auto: boolean;
  }> {
    await this.sweep();
    const r = await this.find(id);
    if (r.run_id !== caller.runId) {
      throw new InfraRequestError('wrong_status', 'another run');
    }
    const status = asStatus(r.status);
    const auto = r.confirmed_by === SYSTEM_ACTOR_ID;
    if (status === 'planned') return { decision: 'wait', status, auto };
    if (status === 'confirmed') return { decision: 'apply', status, auto };
    return { decision: 'stop', status, auto };
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
      resources: p.resources.slice(0, PLAN_RESOURCE_LIMIT).map((x) => ({
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
