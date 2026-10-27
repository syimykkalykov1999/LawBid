import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import type {
  StaffAppealDetailDto,
  StaffAppealItemDto,
  StaffAppealListDto,
  StaffAppealListQueryDto,
  StaffAppealReceiptDto,
  StaffCreateAppealDto,
  StaffDecideAppealDto,
  StaffDecideResultDto,
  StaffFlagDecisionResultDto,
  StaffFlagListDto,
  StaffFlagListQueryDto,
  StaffMyAppealDto,
  StaffRetaliationFlagDto,
  StaffRevealResultDto,
  StaffSignalListDto,
} from './staff-appeals.dto';
import {
  anonymousLabel,
  authorStatus,
  decodeCursor,
  displayName,
  encodeCursor,
  maskAuthor,
  multiAppeals,
  revealAllowed,
  SIGNAL,
  SIGNAL_KIND,
  since,
  startOfUtcDay,
} from './staff-appeals.logic';
import {
  FOLLOW_UP,
  STAFF_ADMIN_ACTIONS,
  type StaffAdminActionsPort,
} from './staff-admin-actions.port';
import { emitSignal } from './staff-signals';

const EXCERPT = 280;
const FILE_PER_DAY = 3;
const ACTION = {
  file: 'admin.appeals.file',
  seen: 'admin.appeals.seen',
  decide: 'admin.appeals.decide',
  reveal: 'admin.appeals.reveal',
  reverse: 'admin.appeals.retaliation_reverse',
  uphold: 'admin.appeals.retaliation_uphold',
} as const;

const notFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Not found.' });

type UserRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};
const USER_SELECT = {
  id: true,
  first_name: true,
  last_name: true,
  email: true,
} as const;

/**
 * Staff package T6 (plan B3): complaints against a workspace head.
 *  - Worker side: any non-head admin of a workspace that has a head files
 *    one (`file`) and reads the status of their own (`mine`).
 *  - Owner side (super admin only; everyone else, the head and the trusted
 *    deputy included, gets 404): inbox, one appeal, decide, reveal the name
 *    of an anonymous author (step-up, own audit row, daily cap), the
 *    retaliation flags and the owner-inbox signals.
 * Everything is behind `staff.appeals_enabled` (off: 404 everywhere). An
 * anonymous appeal stores the author's id (for the retaliation guard) but
 * is shown only as «автор обжалования №N»; no audit row of the filing names
 * the author. Nothing deletes an appeal (legal record).
 */
@Injectable()
export class StaffAppealsService {
  private readonly logger = new Logger(StaffAppealsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffSettingsService,
    private readonly audit: AuditLogService,
    @Inject(STAFF_ADMIN_ACTIONS)
    private readonly actions: StaffAdminActionsPort,
  ) {}

  // ---- guards -------------------------------------------------------------

  /** Switch off → the feature does not exist. */
  private async assertEnabled(): Promise<void> {
    if (!(await this.staff.isOn('staff.appeals_enabled'))) throw notFound();
  }

  /** Owner only: the head, the deputy and all others get 404. */
  private async owner(admin: AdminActor): Promise<void> {
    if (admin.adminRole !== 'super_admin') throw notFound();
    await this.assertEnabled();
  }

  // ---- worker side ----------------------------------------------------------

  async file(
    admin: AdminActor,
    dto: StaffCreateAppealDto,
    now = new Date(),
  ): Promise<StaffAppealReceiptDto> {
    await this.assertEnabled();
    if (admin.adminRole === 'super_admin' || admin.workspaceHead) {
      throw notFound();
    }
    const head = await this.prisma.adminProfile.findFirst({
      where: {
        workspace: admin.workspace ?? 'mass',
        is_workspace_head: true,
        user_id: { not: admin.id },
      },
      select: { user_id: true },
    });
    if (!head) throw notFound();
    const today = await this.prisma.adminAppeal.count({
      where: { author_id: admin.id, created_at: { gte: since(now, 1) } },
    });
    if (today >= FILE_PER_DAY) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many complaints today.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const anonymous = dto.anonymous === true;
    const row = await this.prisma.adminAppeal.create({
      data: {
        author_id: admin.id,
        anonymous,
        head_admin_id: head.user_id,
        kind: dto.kind ?? 'other',
        text: dto.text.trim(),
      },
    });
    // The filing is audited only when the author is not anonymous: an
    // audit row would name them to everyone who reads the log.
    if (!anonymous) {
      await this.audit.record({
        adminId: admin.id,
        action: ACTION.file,
        targetType: 'admin_appeal',
        targetId: row.id,
        ip: admin.ip,
      });
    }
    await this.signalIfMany(head.user_id, now);
    return {
      id: row.id,
      number: row.author_alias,
      status: authorStatus(row.status),
      createdAt: row.created_at.toISOString(),
    };
  }

  /** ≥ N complaints from different people in the window → owner signal. */
  private async signalIfMany(headId: string, now: Date): Promise<void> {
    const { numbers: n } = await this.staff.get();
    const days = n['staff.head.complaints_window_days'];
    const authors = await this.prisma.adminAppeal.findMany({
      where: { head_admin_id: headId, created_at: { gte: since(now, days) } },
      distinct: ['author_id'],
      select: { author_id: true },
    });
    if (multiAppeals(authors.length, n['staff.head.complaints_min'])) {
      await emitSignal(this.prisma, {
        code: SIGNAL.multiAppeals,
        subjectId: headId,
        ref: `head:${headId}`,
        dedupeDays: 30,
        details: { authors: authors.length, days },
        now,
      });
    }
  }

  async mine(admin: AdminActor): Promise<StaffMyAppealDto[]> {
    await this.assertEnabled();
    if (admin.adminRole === 'super_admin' || admin.workspaceHead) {
      throw notFound();
    }
    const rows = await this.prisma.adminAppeal.findMany({
      where: { author_id: admin.id },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: {
        id: true,
        author_alias: true,
        kind: true,
        anonymous: true,
        status: true,
        ack_at: true,
        created_at: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      number: r.author_alias,
      kind: r.kind,
      anonymous: r.anonymous,
      status: authorStatus(r.status),
      ackAt: r.ack_at?.toISOString() ?? null,
      createdAt: r.created_at.toISOString(),
    }));
  }

  // ---- owner side: inbox -------------------------------------------------

  /** The inbox: 3 queries (appeals, people, red marks), however many rows. */
  async list(
    admin: AdminActor,
    q: StaffAppealListQueryDto,
  ): Promise<StaffAppealListDto> {
    await this.owner(admin);
    const limit = q.limit ?? 50;
    const cursor = decodeCursor(q.cursor);
    const where: Prisma.AdminAppealWhereInput = {
      ...(q.state === 'open' ? { status: { in: ['new', 'seen'] } } : {}),
      ...(q.state === 'decided' ? { status: 'resolved' } : {}),
      ...(cursor
        ? {
            OR: [
              { created_at: { lt: cursor.at } },
              { created_at: cursor.at, id: { lt: cursor.id } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.adminAppeal.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const ids = new Set<string>();
    for (const r of page) {
      ids.add(r.head_admin_id);
      if (!r.anonymous) ids.add(r.author_id);
    }
    const [users, flags] = await Promise.all([
      ids.size
        ? this.prisma.user.findMany({
            where: { id: { in: [...ids] } },
            select: USER_SELECT,
          })
        : Promise.resolve([] as UserRow[]),
      page.length
        ? this.prisma.staffRetaliationFlag.findMany({
            where: {
              appeal_id: { in: page.map((r) => r.id) },
              state: 'open',
            },
            select: { appeal_id: true },
          })
        : Promise.resolve([] as { appeal_id: string }[]),
    ]);
    const red = new Set(flags.map((f) => f.appeal_id));
    const items = page.map((r) => this.item(r, users, red.has(r.id)));
    const last = page[page.length - 1];
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ at: last.created_at, id: last.id })
          : null,
    };
  }

  private item(
    r: {
      id: string;
      author_id: string;
      author_alias: number;
      anonymous: boolean;
      head_admin_id: string;
      kind: string;
      text: string;
      status: string;
      owner_decision: string;
      created_at: Date;
      decided_at: Date | null;
    },
    users: UserRow[],
    redFlag: boolean,
  ): StaffAppealItemDto {
    const byId = new Map(users.map((u) => [u.id, displayName(u)]));
    return {
      id: r.id,
      number: r.author_alias,
      kind: r.kind,
      excerpt: r.text.slice(0, EXCERPT),
      head: {
        adminId: r.head_admin_id,
        name: byId.get(r.head_admin_id) ?? 'без имени',
      },
      author: maskAuthor(r, (id) => byId.get(id)),
      status: r.status,
      ownerDecision: r.owner_decision,
      redFlag,
      createdAt: r.created_at.toISOString(),
      decidedAt: r.decided_at?.toISOString() ?? null,
    };
  }

  async get(admin: AdminActor, id: string): Promise<StaffAppealDetailDto> {
    await this.owner(admin);
    const r = await this.prisma.adminAppeal.findUnique({ where: { id } });
    if (!r) throw notFound();
    const now = new Date();
    let status = r.status;
    if (r.status === 'new') {
      // First look of the owner: the author sees «рассматривается».
      const moved = await this.prisma.adminAppeal.updateMany({
        where: { id, status: 'new' },
        data: { status: 'seen', ack_at: now },
      });
      if (moved.count > 0) {
        status = 'seen';
        await this.audit.record({
          adminId: admin.id,
          action: ACTION.seen,
          targetType: 'admin_appeal',
          targetId: id,
          ip: admin.ip,
        });
      }
    }
    const ids = [r.head_admin_id, ...(r.anonymous ? [] : [r.author_id])];
    const [users, flags] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: USER_SELECT,
      }),
      this.prisma.staffRetaliationFlag.findMany({
        where: { appeal_id: id },
        orderBy: { created_at: 'desc' },
        take: 20,
      }),
    ]);
    const reveals = Array.isArray(r.reveal_log) ? r.reveal_log.length : 0;
    const open = flags.some((f) => f.state === 'open');
    return {
      ...this.item({ ...r, status }, users, open),
      text: r.text,
      ownerNote: r.owner_note,
      revealCount: reveals,
      flags: flags.map((f) =>
        this.flag(
          f,
          { author_alias: r.author_alias, anonymous: r.anonymous },
          r.author_id,
          users,
          new Date(),
        ),
      ),
    };
  }

  // ---- owner side: decide / reveal ----------------------------------------

  async decide(
    admin: AdminActor,
    id: string,
    dto: StaffDecideAppealDto,
    now = new Date(),
  ): Promise<StaffDecideResultDto> {
    await this.owner(admin);
    const r = await this.prisma.adminAppeal.findUnique({
      where: { id },
      select: { id: true, status: true, head_admin_id: true, author_id: true },
    });
    if (!r) throw notFound();
    if (r.status === 'resolved') {
      throw new HttpException(
        { code: ErrorCode.VALIDATION_ERROR, message: 'Already decided.' },
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.adminAppeal.update({
        where: { id },
        data: {
          status: 'resolved',
          owner_decision: dto.decision,
          owner_note: dto.note?.trim() || null,
          decided_at: now,
          ack_at: now,
        },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: ACTION.decide,
          targetType: 'admin_appeal',
          targetId: id,
          after: { decision: dto.decision },
          ip: admin.ip,
        },
        tx,
      );
    });
    let followUp: StaffDecideResultDto['followUp'] = null;
    if (dto.decision !== 'nothing') {
      const f = FOLLOW_UP[dto.decision];
      let applied = false;
      try {
        ({ applied } = await this.actions.apply({
          decision: dto.decision,
          appealId: id,
          targetAdminId: f.target === 'head' ? r.head_admin_id : r.author_id,
          ownerId: admin.id,
        }));
      } catch (e) {
        // The decision is already recorded; the owner presses the call.
        this.logger.error(`appeal ${id}: follow-up failed: ${String(e)}`);
      }
      followUp = { call: f.call, target: f.target, applied };
    }
    return {
      id,
      status: 'resolved',
      decision: dto.decision,
      decidedAt: now.toISOString(),
      followUp,
    };
  }

  async reveal(
    admin: AdminActor,
    id: string,
    now = new Date(),
  ): Promise<StaffRevealResultDto> {
    await this.owner(admin);
    const cap = await this.staff.number('staff.reveal_per_day');
    const r = await this.prisma.adminAppeal.findUnique({
      where: { id },
      select: { id: true, anonymous: true, author_id: true },
    });
    if (!r) throw notFound();
    if (!r.anonymous) {
      throw new HttpException(
        {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'The author is not anonymous.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const used = await this.prisma.auditLog.count({
      where: {
        admin_id: admin.id,
        action: ACTION.reveal,
        created_at: { gte: startOfUtcDay(now) },
      },
    });
    if (!revealAllowed(used, cap)) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Daily limit of revealed names reached.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // The audit row and the reveal log commit together (fail closed).
    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(
        {
          adminId: admin.id,
          action: ACTION.reveal,
          targetType: 'admin_appeal',
          targetId: id,
          ip: admin.ip,
        },
        tx,
      );
      const cur = await tx.adminAppeal.findUnique({
        where: { id },
        select: { reveal_log: true },
      });
      const log = Array.isArray(cur?.reveal_log) ? cur.reveal_log : [];
      await tx.adminAppeal.update({
        where: { id },
        data: {
          reveal_log: [...log, { at: now.toISOString(), by: admin.id }],
        },
      });
    });
    const u = await this.prisma.user.findUnique({
      where: { id: r.author_id },
      select: USER_SELECT,
    });
    return {
      adminId: r.author_id,
      name: u ? displayName(u) : 'без имени',
      email: u?.email ?? null,
      revealsLeftToday: Math.max(0, cap - used - 1),
    };
  }

  // ---- owner side: retaliation flags and signals -------------------------

  private flag(
    f: {
      id: string;
      appeal_id: string;
      subject_admin_id: string;
      state: string;
      window_until: Date;
      hold_until: Date | null;
      created_at: Date;
      decided_at: Date | null;
    },
    appeal: { author_alias: number; anonymous: boolean },
    authorId: string,
    users: UserRow[],
    now: Date,
  ): StaffRetaliationFlagDto {
    const byId = new Map(users.map((u) => [u.id, displayName(u)]));
    return {
      id: f.id,
      appealId: f.appeal_id,
      appealNumber: appeal.author_alias,
      subject: maskAuthor(
        {
          anonymous: appeal.anonymous,
          author_alias: appeal.author_alias,
          author_id: authorId,
        },
        (x) => byId.get(x),
      ),
      state: f.state,
      windowUntil: f.window_until.toISOString(),
      holdUntil: f.hold_until?.toISOString() ?? null,
      holdActive: f.state === 'open' && !!f.hold_until && f.hold_until > now,
      createdAt: f.created_at.toISOString(),
      decidedAt: f.decided_at?.toISOString() ?? null,
    };
  }

  /** Red marks: 3 queries (flags, their appeals, people). */
  async flags(
    admin: AdminActor,
    q: StaffFlagListQueryDto,
  ): Promise<StaffFlagListDto> {
    await this.owner(admin);
    const rows = await this.prisma.staffRetaliationFlag.findMany({
      where:
        q.state === 'open'
          ? { state: 'open' }
          : q.state === 'closed'
            ? { state: { not: 'open' } }
            : {},
      orderBy: { created_at: 'desc' },
      take: q.limit ?? 50,
    });
    if (rows.length === 0) return { items: [] };
    const appeals = await this.prisma.adminAppeal.findMany({
      where: { id: { in: rows.map((f) => f.appeal_id) } },
      select: {
        id: true,
        author_id: true,
        author_alias: true,
        anonymous: true,
      },
    });
    const open = appeals.filter((a) => !a.anonymous).map((a) => a.author_id);
    const users = open.length
      ? await this.prisma.user.findMany({
          where: { id: { in: open } },
          select: USER_SELECT,
        })
      : [];
    const byAppeal = new Map(appeals.map((a) => [a.id, a]));
    const now = new Date();
    return {
      items: rows.flatMap((f) => {
        const a = byAppeal.get(f.appeal_id);
        return a ? [this.flag(f, a, a.author_id, users, now)] : [];
      }),
    };
  }

  /** Owner reverses the hold: the person works again, journal + audit. */
  async reverse(
    admin: AdminActor,
    flagId: string,
    note: string | undefined,
    now = new Date(),
  ): Promise<StaffFlagDecisionResultDto> {
    await this.owner(admin);
    return this.closeFlag(admin, flagId, 'cleared', note, now);
  }

  /** Owner agrees with the head's action: the removal stands. */
  async uphold(
    admin: AdminActor,
    flagId: string,
    note: string | undefined,
    now = new Date(),
  ): Promise<StaffFlagDecisionResultDto> {
    await this.owner(admin);
    return this.closeFlag(admin, flagId, 'upheld', note, now);
  }

  private async closeFlag(
    admin: AdminActor,
    flagId: string,
    state: 'cleared' | 'upheld',
    note: string | undefined,
    now: Date,
  ): Promise<StaffFlagDecisionResultDto> {
    const f = await this.prisma.staffRetaliationFlag.findUnique({
      where: { id: flagId },
      select: { id: true, state: true, subject_admin_id: true },
    });
    if (!f) throw notFound();
    if (f.state !== 'open') {
      throw new HttpException(
        { code: ErrorCode.VALIDATION_ERROR, message: 'Already closed.' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const reverse = state === 'cleared';
    const held: Prisma.StaffMemberStateWhereInput = {
      admin_id: f.subject_admin_id,
      state_reason: {
        in: ['retaliation_check', 'retaliation_hold_expired'],
      },
    };
    const moved = await this.prisma.$transaction(async (tx) => {
      const closed = await tx.staffRetaliationFlag.updateMany({
        where: { id: flagId, state: 'open' },
        data: { state, decided_at: now },
      });
      if (closed.count === 0) return null;
      const m = await tx.staffMemberState.updateMany({
        where: held,
        data: reverse
          ? {
              state: 'active',
              state_reason: 'retaliation_reversed',
              state_until: null,
            }
          : {
              state: 'offboarded',
              state_reason: 'retaliation_upheld',
              state_until: null,
            },
      });
      await tx.staffAction.create({
        data: {
          admin_id: f.subject_admin_id,
          actor_id: admin.id,
          source: 'owner',
          kind: reverse ? 'reinstate' : 'offboard',
          reason_code: reverse ? 'retaliation_reversed' : 'retaliation_upheld',
          reason_note: note?.trim() || null,
          created_at: now,
        },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: reverse ? ACTION.reverse : ACTION.uphold,
          targetType: 'staff_retaliation_flag',
          targetId: flagId,
          after: { state },
          ip: admin.ip,
        },
        tx,
      );
      return m.count;
    });
    if (moved === null) {
      throw new HttpException(
        { code: ErrorCode.VALIDATION_ERROR, message: 'Already closed.' },
        HttpStatus.BAD_REQUEST,
      );
    }
    return { id: flagId, state, reinstated: reverse && moved > 0 };
  }

  /** Owner-inbox signals of the last 30 days (3 queries). */
  async signals(admin: AdminActor, limit = 50): Promise<StaffSignalListDto> {
    await this.owner(admin);
    const rows = await this.prisma.staffAction.findMany({
      where: {
        kind: SIGNAL_KIND,
        created_at: { gte: since(new Date(), 30) },
      },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
    const ids = new Set<string>();
    for (const r of rows) {
      ids.add(r.admin_id);
      if (r.actor_id) ids.add(r.actor_id);
    }
    const users = ids.size
      ? await this.prisma.user.findMany({
          where: { id: { in: [...ids] } },
          select: USER_SELECT,
        })
      : [];
    const name = new Map(users.map((u) => [u.id, displayName(u)]));
    // A removed person may be the anonymous author of an appeal: the inbox
    // keeps them «автор обжалования №N» too.
    const anon = ids.size
      ? await this.prisma.adminAppeal.findMany({
          where: { anonymous: true, author_id: { in: [...ids] } },
          orderBy: { created_at: 'desc' },
          select: { author_id: true, author_alias: true },
        })
      : [];
    for (const a of anon) {
      name.set(a.author_id, anonymousLabel(a.author_alias));
    }
    return {
      items: rows.map((r) => ({
        id: r.id,
        code: r.reason_code,
        subject: {
          adminId: anon.some((a) => a.author_id === r.admin_id)
            ? null
            : r.admin_id,
          name: name.get(r.admin_id) ?? 'без имени',
        },
        actor: r.actor_id
          ? {
              adminId: r.actor_id,
              name: name.get(r.actor_id) ?? 'без имени',
            }
          : null,
        details:
          r.rating_snapshot &&
          typeof r.rating_snapshot === 'object' &&
          !Array.isArray(r.rating_snapshot)
            ? (r.rating_snapshot as Record<string, unknown>)
            : {},
        createdAt: r.created_at.toISOString(),
      })),
    };
  }
}
