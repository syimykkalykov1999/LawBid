import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type AdminRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from './admin-auth.decorators';
import { AdminAuthService } from './admin-auth.service';
import {
  canAccess,
  parsePermissions,
  readManageAdmins,
  readNoPii,
  readPartner,
} from './admin-permissions';

/**
 * Owner 2026-10-22 (system audit #2, item 11): maker-checker — the
 * "four-eyes" / dual-control rule banks use for outgoing payments, and the
 * same idea as Stripe's team roles where moving money can be kept away from
 * a single person (https://docs.stripe.com/get-started/account/teams/roles).
 *
 * A bulk payout or a refund of `billing.dual_approval_min_cents` or more
 * (default $500) is not run by the admin who asks: it is stored in
 * `admin_approvals` and runs only after ANOTHER admin, who could run that
 * action themself, approves it with a fresh 2FA step-up. It runs exactly
 * once: the pending → approved switch is one conditional UPDATE. Every
 * step is an audit_log row.
 *
 * The approvals list lives here (admin-auth, a global module) and the
 * money modules register how their kind runs (`register`), so neither
 * side imports the other.
 */
export type ApprovalKind =
  | 'payroll_bulk_payout'
  | 'billing_refund'
  // Owner 2026-10-22 («лечи всё»): also a payroll bonus and a partner
  // payout marked paid, from the same limit.
  | 'payroll_bonus'
  | 'partner_payout'
  | 'partner_commission_paid'
  // Shard-ready step 10: the «Разделить базу» button.
  | 'shard_split';

export interface ApprovalKindSpec {
  kind: ApprovalKind;
  /** Russian label for the panel. */
  label: string;
  /** The route the approver must be able to call themself (RBAC). */
  route: { path: string; method: 'POST'; roles: readonly AdminRole[] };
  /** Runs the action as the requester; the answer is stored as `result`. */
  execute(requester: AdminActor, payload: unknown): Promise<unknown>;
}

export const APPROVAL_TTL_HOURS = 72;
export const DUAL_APPROVAL_SETTING = 'billing.dual_approval_min_cents';

export const APPROVAL_AUDIT = {
  requested: 'admin.approval_requested',
  approved: 'admin.approval_approved',
  rejected: 'admin.approval_rejected',
  executed: 'admin.approval_executed',
  failed: 'admin.approval_failed',
} as const;

export interface AdminApprovalView {
  id: string;
  kind: string;
  label: string;
  summary: string;
  amountCents: number;
  status: string;
  payload: unknown;
  requestedBy: { id: string; email: string | null };
  approvedBy: { id: string; email: string | null } | null;
  rejectedBy: { id: string; email: string | null } | null;
  decisionNote: string | null;
  error: string | null;
  createdAt: string;
  decidedAt: string | null;
  executedAt: string | null;
  expiresAt: string;
  /** The viewer may approve / reject it now. */
  canDecide: boolean;
  /** The viewer asked for it (may withdraw it with «Отклонить»). */
  mine: boolean;
}

const WHO = { select: { id: true, email: true } } as const;
const INCLUDE = { requester: WHO, approver: WHO, rejecter: WHO } as const;
type Row = Prisma.AdminApprovalGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class AdminApprovalsService {
  private readonly specs = new Map<string, ApprovalKindSpec>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly auth: AdminAuthService,
    private readonly settings: AppSettingsService,
  ) {}

  /** A money module tells how its kind runs (from its onModuleInit). */
  register(spec: ApprovalKindSpec): void {
    this.specs.set(spec.kind, spec);
  }

  /** The current limit, cents (never negative). */
  async limitCents(): Promise<number> {
    return Math.max(0, await this.settings.number(DUAL_APPROVAL_SETTING));
  }

  /**
   * Called by the action's own endpoint before it runs. Below the limit it
   * returns and the action runs now. At or above it the action is stored
   * for a second admin and this throws 409 ADMIN_APPROVAL_PENDING (with
   * the request id) — the action does NOT run. Asking twice for the same
   * thing gives the same pending request.
   */
  async gate(
    actor: AdminActor,
    input: {
      kind: ApprovalKind;
      payload: object;
      amountCents: number;
      summary: string;
    },
  ): Promise<void> {
    const limit = await this.limitCents();
    if (input.amountCents < limit) return;
    const payload = JSON.parse(JSON.stringify(input.payload)) as object;
    const hash = payloadHash(input.kind, payload);
    const existing = await this.prisma.adminApproval.findFirst({
      where: {
        kind: input.kind,
        payload_hash: hash,
        requested_by: actor.id,
        status: 'pending',
        created_at: { gt: expiryCutoff() },
      },
      select: { id: true },
    });
    let id = existing?.id;
    if (!id) {
      const row = await this.prisma.adminApproval.create({
        data: {
          kind: input.kind,
          payload: payload,
          payload_hash: hash,
          amount_cents: Math.min(
            Math.max(0, Math.round(input.amountCents)),
            2_147_483_647,
          ),
          summary: input.summary.slice(0, 300),
          requested_by: actor.id,
        },
        select: { id: true },
      });
      id = row.id;
      await this.audit.record({
        adminId: actor.id,
        action: APPROVAL_AUDIT.requested,
        targetType: 'admin_approval',
        targetId: id,
        after: {
          kind: input.kind,
          amountCents: input.amountCents,
          limitCents: limit,
          summary: input.summary.slice(0, 300),
        },
        ip: actor.ip,
      });
    }
    throw new ConflictException({
      code: ErrorCode.ADMIN_APPROVAL_PENDING,
      message:
        'Sent for approval: another admin must approve it before it runs.',
      details: { approvalId: id, limitCents: limit },
    });
  }

  async list(
    actor: AdminActor,
    status: 'pending' | 'done' = 'pending',
  ): Promise<AdminApprovalView[]> {
    const rows = await this.prisma.adminApproval.findMany({
      where:
        status === 'pending'
          ? { status: 'pending', created_at: { gt: expiryCutoff() } }
          : { status: { not: 'pending' } },
      include: INCLUDE,
      orderBy: { created_at: 'desc' },
      take: status === 'pending' ? 200 : 100,
    });
    return rows
      .filter((r) => r.requested_by === actor.id || this.mayDecide(actor, r))
      .map((r) => this.view(actor, r));
  }

  /** Requests this admin could approve now (the nav badge). */
  async pendingCount(actor: AdminActor): Promise<number> {
    const rows = await this.prisma.adminApproval.findMany({
      where: {
        status: 'pending',
        created_at: { gt: expiryCutoff() },
        requested_by: { not: actor.id },
      },
      select: { kind: true, requested_by: true },
      take: 500,
    });
    return rows.filter((r) => this.mayDecide(actor, r)).length;
  }

  /**
   * The second admin approves: fresh step-up, never the requester, only
   * someone who could run the action themself. Pending → approved happens
   * in one conditional UPDATE, so a double click or two approvers run the
   * action once. Then it runs as the requester; a failure is stored.
   */
  async approve(actor: AdminActor, id: string): Promise<AdminApprovalView> {
    const row = await this.load(id);
    if (row.requested_by === actor.id) {
      throw new ForbiddenException({
        code: ErrorCode.ADMIN_APPROVAL_SELF,
        message: 'Another admin must approve your own request.',
      });
    }
    const spec = this.specs.get(row.kind);
    if (!spec || !this.mayDecide(actor, row)) throw notFound();
    await this.auth.assertStepUp(actor.sessionId);
    if (row.status === 'pending' && row.created_at <= expiryCutoff()) {
      await this.prisma.adminApproval.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'expired', decided_at: new Date() },
      });
      throw notPending();
    }
    const requester = await this.requesterActor(row.requested_by, actor.ip);
    const { count } = await this.prisma.adminApproval.updateMany({
      where: {
        id,
        status: 'pending',
        requested_by: { not: actor.id },
      },
      data: {
        status: 'approved',
        approved_by: actor.id,
        decided_at: new Date(),
      },
    });
    if (count === 0) throw notPending();
    await this.audit.record({
      adminId: actor.id,
      action: APPROVAL_AUDIT.approved,
      targetType: 'admin_approval',
      targetId: id,
      after: {
        kind: row.kind,
        amountCents: row.amount_cents,
        requestedBy: row.requested_by,
      },
      ip: actor.ip,
    });
    if (!requester) {
      await this.fail(actor, row, 'The admin who asked is no longer active.');
    } else {
      try {
        const result = await spec.execute(requester, row.payload);
        await this.prisma.adminApproval.update({
          where: { id },
          data: {
            result: toJson(result),
            executed_at: new Date(),
          },
        });
        await this.audit.record({
          adminId: actor.id,
          action: APPROVAL_AUDIT.executed,
          targetType: 'admin_approval',
          targetId: id,
          after: { kind: row.kind, requestedBy: row.requested_by },
          ip: actor.ip,
        });
      } catch (e) {
        await this.fail(actor, row, errorMessage(e));
      }
    }
    return this.view(actor, await this.load(id));
  }

  /** Another admin turns it down, or the requester withdraws it. */
  async reject(
    actor: AdminActor,
    id: string,
    note?: string,
  ): Promise<AdminApprovalView> {
    const row = await this.load(id);
    const own = row.requested_by === actor.id;
    if (!own && !this.mayDecide(actor, row)) throw notFound();
    const { count } = await this.prisma.adminApproval.updateMany({
      where: { id, status: 'pending' },
      data: {
        status: 'rejected',
        rejected_by: actor.id,
        decision_note: note?.trim().slice(0, 500) || null,
        decided_at: new Date(),
      },
    });
    if (count === 0) throw notPending();
    await this.audit.record({
      adminId: actor.id,
      action: APPROVAL_AUDIT.rejected,
      targetType: 'admin_approval',
      targetId: id,
      after: {
        kind: row.kind,
        amountCents: row.amount_cents,
        requestedBy: row.requested_by,
        withdrawn: own,
        note: note?.trim().slice(0, 500) || null,
      },
      ip: actor.ip,
    });
    return this.view(actor, await this.load(id));
  }

  // ---------------------------------------------------------------------

  /** Could [actor] run this kind themself (role + area rights)? */
  private mayDecide(
    actor: AdminActor,
    row: { kind: string; requested_by: string },
  ): boolean {
    if (row.requested_by === actor.id) return false;
    const spec = this.specs.get(row.kind);
    if (!spec) return false;
    if (!spec.route.roles.includes(actor.adminRole)) return false;
    return canAccess(
      actor.adminRole,
      actor.permissions ?? {},
      spec.route.path,
      spec.route.method,
      actor.manageAdmins ?? false,
      actor.partner ?? null,
      actor.noPii ?? false,
    );
  }

  private async requesterActor(
    userId: string,
    ip: string | null,
  ): Promise<AdminActor | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        status: true,
        deleted_at: true,
        admin_profile: { select: { admin_role: true, permissions: true } },
      },
    });
    const p = user?.admin_profile;
    if (
      !user ||
      !p ||
      user.role !== 'admin' ||
      user.status !== 'active' ||
      user.deleted_at
    ) {
      return null;
    }
    const isSuper = p.admin_role === 'super_admin';
    const partner = isSuper ? null : readPartner(p.permissions);
    return {
      id: userId,
      adminRole: p.admin_role,
      sessionId: `approval:${userId}`,
      justification: null,
      permissions: parsePermissions(p.permissions),
      manageAdmins: !isSuper && !partner && readManageAdmins(p.permissions),
      partner,
      noPii: !isSuper && readNoPii(p.permissions),
      countries: null,
      assignedCountries: [],
      ip,
    };
  }

  private async fail(
    actor: AdminActor,
    row: Row,
    message: string,
  ): Promise<void> {
    await this.prisma.adminApproval.update({
      where: { id: row.id },
      data: {
        status: 'failed',
        error: message.slice(0, 500),
        executed_at: new Date(),
      },
    });
    await this.audit.record({
      adminId: actor.id,
      action: APPROVAL_AUDIT.failed,
      targetType: 'admin_approval',
      targetId: row.id,
      after: { kind: row.kind, error: message.slice(0, 500) },
      ip: actor.ip,
    });
  }

  private async load(id: string): Promise<Row> {
    const row = await this.prisma.adminApproval.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!row) throw notFound();
    return row;
  }

  private view(actor: AdminActor, r: Row): AdminApprovalView {
    const expired = r.status === 'pending' && r.created_at <= expiryCutoff();
    return {
      id: r.id,
      kind: r.kind,
      label: this.specs.get(r.kind)?.label ?? r.kind,
      summary: r.summary,
      amountCents: r.amount_cents,
      status: expired ? 'expired' : r.status,
      payload: r.payload,
      requestedBy: r.requester,
      approvedBy: r.approver,
      rejectedBy: r.rejecter,
      decisionNote: r.decision_note,
      error: r.error,
      createdAt: r.created_at.toISOString(),
      decidedAt: r.decided_at?.toISOString() ?? null,
      executedAt: r.executed_at?.toISOString() ?? null,
      expiresAt: new Date(
        r.created_at.getTime() + APPROVAL_TTL_HOURS * 3600_000,
      ).toISOString(),
      canDecide: !expired && r.status === 'pending' && this.mayDecide(actor, r),
      mine: r.requested_by === actor.id,
    };
  }
}

/** Stable JSON (sorted keys) → SHA-256, so the same ask is one request. */
export function payloadHash(kind: string, payload: unknown): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v as Record<string, unknown>)
              .sort()
              .map((k) => [k, stable((v as Record<string, unknown>)[k])]),
          )
        : v;
  return createHash('sha256')
    .update(`${kind}:${JSON.stringify(stable(payload))}`)
    .digest('hex');
}

const expiryCutoff = () => new Date(Date.now() - APPROVAL_TTL_HOURS * 3600_000);

const toJson = (v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  v === undefined || v === null
    ? Prisma.JsonNull
    : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'getResponse' in e) {
    const r = (e as { getResponse: () => unknown }).getResponse();
    if (r && typeof r === 'object' && 'message' in r) {
      const code = (r as { code?: string }).code;
      return `${code ? `${code}: ` : ''}${String(r.message)}`;
    }
  }
  return e instanceof Error ? e.message : 'The action failed.';
}

const notFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Not found.' });

const notPending = () =>
  new ConflictException({
    code: ErrorCode.ADMIN_APPROVAL_NOT_PENDING,
    message: 'This request was already decided or has expired.',
  });
