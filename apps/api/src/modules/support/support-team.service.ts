import { Injectable } from '@nestjs/common';
import type { SupportMacro } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import { canAnswer } from './support-desk.service';
import type {
  AdminSupportTicketDetailDto,
  CreateSupportMacroDto,
  SupportAgentDto,
  SupportCategory,
  SupportMacroDto,
  SupportStaffStatsDto,
  SupportStaffStatsQueryDto,
  UpdateSupportAgentDto,
  UpdateSupportMacroDto,
} from './support.dto';
import { AdminSupportService } from './admin-support.service';
import { nameOf, ticketNotFound } from './support.rules';

const MAX_MACROS = 500;
const DEFAULT_STATS_DAYS = 30;
const STATS_MAX_ROWS = 20_000;

/**
 * Owner 2026-10-05 — support 24/7, the team side: ready answers, shifts,
 * per-employee stats and "next ticket" for the workspace.
 */
@Injectable()
export class SupportTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly tickets: AdminSupportService,
  ) {}

  // --- ready answers ---------------------------------------------------------

  async macros(activeOnly: boolean): Promise<SupportMacroDto[]> {
    const rows = await this.prisma.supportMacro.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: [{ active: 'desc' }, { uses: 'desc' }, { title: 'asc' }],
      take: MAX_MACROS,
    });
    return rows.map(presentMacro);
  }

  async createMacro(
    adminId: string,
    dto: CreateSupportMacroDto,
  ): Promise<SupportMacroDto> {
    const row = await withTxRetry(this.prisma, async (tx) => {
      const m = await tx.supportMacro.create({
        data: {
          title: dto.title,
          body: dto.body,
          category: dto.category ?? null,
          active: dto.active ?? true,
          created_by: adminId,
        },
      });
      await this.audit.record(
        {
          adminId,
          action: 'support.macro.create',
          targetType: 'support_macro',
          targetId: m.id,
          after: { title: m.title },
        },
        tx,
      );
      return m;
    });
    return presentMacro(row);
  }

  async updateMacro(
    adminId: string,
    id: string,
    dto: UpdateSupportMacroDto,
  ): Promise<SupportMacroDto> {
    const row = await withTxRetry(this.prisma, async (tx) => {
      const before = await tx.supportMacro.findUnique({ where: { id } });
      if (!before) throw ticketNotFound();
      const m = await tx.supportMacro.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.body !== undefined ? { body: dto.body } : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
      });
      await this.audit.record(
        {
          adminId,
          action: 'support.macro.update',
          targetType: 'support_macro',
          targetId: id,
          before: { title: before.title, active: before.active },
          after: { title: m.title, active: m.active },
        },
        tx,
      );
      return m;
    });
    return presentMacro(row);
  }

  async deleteMacro(adminId: string, id: string): Promise<void> {
    await withTxRetry(this.prisma, async (tx) => {
      const before = await tx.supportMacro.findUnique({ where: { id } });
      if (!before) throw ticketNotFound();
      await tx.supportMacro.delete({ where: { id } });
      await this.audit.record(
        {
          adminId,
          action: 'support.macro.delete',
          targetType: 'support_macro',
          targetId: id,
          before: { title: before.title },
        },
        tx,
      );
    });
  }

  // --- shifts ----------------------------------------------------------------

  /** Everyone who may answer tickets, with their shift and load. */
  async agents(): Promise<SupportAgentDto[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin', status: 'active', deleted_at: null },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        admin_profile: { select: { admin_role: true, permissions: true } },
      },
    });
    const team = admins.filter((a) => canAnswer(a.admin_profile));
    const ids = team.map((a) => a.id);
    const [rows, load] = await Promise.all([
      this.prisma.supportAgent.findMany({ where: { admin_id: { in: ids } } }),
      this.prisma.supportTicket.groupBy({
        by: ['assignee_id'],
        where: {
          assignee_id: { in: ids },
          status: { in: ['open', 'waiting_user'] },
        },
        _count: { _all: true },
      }),
    ]);
    const state = new Map(rows.map((r) => [r.admin_id, r]));
    const open = new Map(load.map((l) => [l.assignee_id, l._count._all]));
    return team
      .map((a) => ({
        adminId: a.id,
        name: nameOf(a),
        onShift: state.get(a.id)?.on_shift ?? false,
        maxOpen: state.get(a.id)?.max_open ?? 25,
        openTickets: open.get(a.id) ?? 0,
      }))
      .sort(
        (x, y) =>
          Number(y.onShift) - Number(x.onShift) || x.name.localeCompare(y.name),
      );
  }

  async setAgent(
    actorId: string,
    adminId: string,
    dto: UpdateSupportAgentDto,
  ): Promise<SupportAgentDto> {
    const before = await this.agents();
    if (!before.some((a) => a.adminId === adminId)) throw ticketNotFound();
    await withTxRetry(this.prisma, async (tx) => {
      await tx.supportAgent.upsert({
        where: { admin_id: adminId },
        create: {
          admin_id: adminId,
          on_shift: dto.onShift ?? false,
          ...(dto.maxOpen !== undefined ? { max_open: dto.maxOpen } : {}),
        },
        update: {
          ...(dto.onShift !== undefined ? { on_shift: dto.onShift } : {}),
          ...(dto.maxOpen !== undefined ? { max_open: dto.maxOpen } : {}),
        },
      });
      await this.audit.record(
        {
          adminId: actorId,
          action: 'support.agent.update',
          targetType: 'admin',
          targetId: adminId,
          after: {
            onShift: dto.onShift ?? null,
            maxOpen: dto.maxOpen ?? null,
          },
        },
        tx,
      );
    });
    const me = (await this.agents()).find((a) => a.adminId === adminId);
    if (!me) throw ticketNotFound();
    return me;
  }

  // --- stats -----------------------------------------------------------------

  async staffStats(
    q: SupportStaffStatsQueryDto,
  ): Promise<SupportStaffStatsDto[]> {
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from
      ? new Date(q.from)
      : new Date(to.getTime() - DEFAULT_STATS_DAYS * 86_400_000);
    const [agents, replies, firsts, resolved, breaches] = await Promise.all([
      this.agents(),
      this.prisma.supportMessage.groupBy({
        by: ['author_admin_id'],
        where: {
          author_admin_id: { not: null },
          internal: false,
          created_at: { gte: from, lt: to },
        },
        _count: { _all: true },
      }),
      this.prisma.supportTicket.findMany({
        where: {
          first_response_by: { not: null },
          first_response_at: { gte: from, lt: to },
        },
        select: {
          first_response_by: true,
          first_response_at: true,
          created_at: true,
        },
        take: STATS_MAX_ROWS,
      }),
      this.prisma.supportTicket.groupBy({
        by: ['resolved_by'],
        where: {
          resolved_by: { not: null },
          resolved_at: { gte: from, lt: to },
        },
        _count: { _all: true },
      }),
      this.prisma.supportTicket.findMany({
        where: {
          assignee_id: { not: null },
          sla_breached_at: { gte: from, lt: to },
        },
        select: { assignee_id: true, assigned_at: true, sla_breached_at: true },
        take: STATS_MAX_ROWS,
      }),
    ]);
    const replyN = new Map(
      replies.map((r) => [r.author_admin_id, r._count._all]),
    );
    const resolvedN = new Map(
      resolved.map((r) => [r.resolved_by, r._count._all]),
    );
    const breachN = breachesHeld(breaches);
    const waits = new Map<string, number[]>();
    for (const f of firsts) {
      if (!f.first_response_by || !f.first_response_at) continue;
      const list = waits.get(f.first_response_by) ?? [];
      list.push(
        (f.first_response_at.getTime() - f.created_at.getTime()) / 60_000,
      );
      waits.set(f.first_response_by, list);
    }
    // Admins who answered but no longer have the right still show up.
    const known = new Set(agents.map((a) => a.adminId));
    const extra = [
      ...new Set(
        [...replyN.keys(), ...resolvedN.keys()].filter(
          (id): id is string => !!id && !known.has(id),
        ),
      ),
    ];
    const extraPeople = extra.length
      ? await this.prisma.user.findMany({
          where: { id: { in: extra } },
          select: { id: true, first_name: true, last_name: true },
        })
      : [];
    const people = [
      ...agents.map((a) => ({
        id: a.adminId,
        name: a.name,
        onShift: a.onShift,
        open: a.openTickets,
      })),
      ...extraPeople.map((p) => ({
        id: p.id,
        name: nameOf(p),
        onShift: false,
        open: 0,
      })),
    ];
    return people
      .map((a) => ({
        adminId: a.id,
        name: a.name,
        replies: replyN.get(a.id) ?? 0,
        firstResponses: waits.get(a.id)?.length ?? 0,
        medianFirstResponseMinutes: median(waits.get(a.id) ?? []),
        resolved: resolvedN.get(a.id) ?? 0,
        slaBreaches: breachN.get(a.id) ?? 0,
        openNow: a.open,
        onShift: a.onShift,
      }))
      .sort(
        (x, y) =>
          y.resolved - x.resolved ||
          y.replies - x.replies ||
          x.name.localeCompare(y.name),
      );
  }

  // --- workspace -------------------------------------------------------------

  /** «Следующий»: my most urgent open ticket, else the most overdue
   * unassigned one (taken by me). null when the queue is empty. */
  async next(adminId: string): Promise<AdminSupportTicketDetailDto | null> {
    const order = [
      { sla_due_at: { sort: 'asc' as const, nulls: 'last' as const } },
      { last_message_at: 'asc' as const },
    ];
    const mine = await this.prisma.supportTicket.findFirst({
      where: { status: 'open', assignee_id: adminId },
      orderBy: order,
      select: { id: true },
    });
    if (mine) return this.tickets.get(mine.id);
    for (let attempt = 0; attempt < 3; attempt++) {
      const free = await this.prisma.supportTicket.findFirst({
        where: { status: 'open', assignee_id: null },
        orderBy: order,
        select: { id: true },
      });
      if (!free) return null;
      // Two agents pressing «Следующий» together never get the same one.
      // A concurrent claim of the same row can abort with 40001 on
      // CockroachDB: retry it instead of answering 500.
      const took = await withTxRetry(this.prisma, (tx) =>
        tx.supportTicket.updateMany({
          where: { id: free.id, assignee_id: null },
          data: { assignee_id: adminId, assigned_at: new Date() },
        }),
      );
      if (took.count === 1) return this.tickets.get(free.id);
    }
    return null;
  }
}

function presentMacro(m: SupportMacro): SupportMacroDto {
  return {
    id: m.id,
    title: m.title,
    body: m.body,
    category: (m.category as SupportCategory | null) ?? null,
    active: m.active,
    uses: m.uses,
    updatedAt: m.updated_at.toISOString(),
  };
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
}

/** Late answers per agent, counting only the ones that went late while the
 * agent held the ticket (taking an already-late ticket is not their miss). */
export function breachesHeld(
  rows: {
    assignee_id: string | null;
    assigned_at: Date | null;
    sla_breached_at: Date | null;
  }[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.assignee_id || !r.sla_breached_at) continue;
    if (r.assigned_at && r.assigned_at > r.sla_breached_at) continue;
    out.set(r.assignee_id, (out.get(r.assignee_id) ?? 0) + 1);
  }
  return out;
}
