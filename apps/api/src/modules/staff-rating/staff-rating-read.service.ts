import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type AdminWorkspace } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestAdmin } from '../admin-auth/admin-auth.decorators';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import type {
  StaffPeopleListDto,
  StaffPeopleQueryDto,
  StaffPersonDetailDto,
  StaffPersonDto,
  StaffShortlistDto,
  StaffSuggestionDto,
  StaffSuggestionListDto,
  StaffSuggestionsQueryDto,
} from './staff-rating.dto';

const SHORTLIST_SIZE = 20;
const DETAIL_SUGGESTIONS = 20;

const notFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Not found.' });

/** Whose rating the caller may read: every workspace (the owner) or one. */
export interface RatingScope {
  /** null = all workspaces. */
  workspace: AdminWorkspace | null;
}

/**
 * The owner sees everyone (and may narrow to one workspace); a workspace
 * head sees only their own workspace, whatever they ask for; everybody else
 * gets «not found», like any section that is not theirs.
 */
export function ratingScope(
  admin: Pick<RequestAdmin, 'adminRole' | 'workspace' | 'workspaceHead'>,
  asked?: AdminWorkspace,
): RatingScope {
  if (admin.adminRole === 'super_admin' || admin.workspace === 'owner') {
    return { workspace: asked ?? null };
  }
  if (admin.workspaceHead === true && admin.workspace) {
    return { workspace: admin.workspace };
  }
  throw notFound();
}

interface SnapshotRow {
  admin_id: string;
  workspace: AdminWorkspace;
  snapshot_date: Date;
  rating: number | null;
  n_decisions: number;
  accuracy: number | null;
  clean: number | null;
  users_verdict: number | null;
  speed: number | null;
  status: string;
  flags: string[];
  rank_pct: number | null;
  evidence: Record<string, unknown>;
  first_name: string | null;
  last_name: string | null;
}

interface SuggestionRow {
  id: string;
  admin_id: string;
  kind: string;
  status: string;
  snapshot_date: Date;
  evidence: Record<string, unknown>;
  created_at: Date;
  workspace: AdminWorkspace;
  first_name: string | null;
  last_name: string | null;
}

const nameOf = (r: { first_name: string | null; last_name: string | null }) =>
  [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || 'Admin';
const day = (d: Date) => d.toISOString().slice(0, 10);

/** The columns every snapshot read takes (one join to users for the name). */
const SNAPSHOT_COLUMNS = Prisma.sql`
  s.admin_id, s.workspace, s.snapshot_date, s.rating, s.n_decisions, s.accuracy,
  s.clean, s.users_verdict, s.speed, s.status, s.flags, s.rank_pct, s.evidence,
  u.first_name, u.last_name`;

/** Latest snapshot date: an index-only MAX on (snapshot_date, …). */
const LATEST = Prisma.sql`s.snapshot_date = (SELECT MAX(snapshot_date) FROM staff_rating_snapshots)`;

const scopeSql = (alias: string, ws: AdminWorkspace | null) =>
  ws === null
    ? Prisma.sql`TRUE`
    : Prisma.sql`${Prisma.raw(alias)}.workspace = ${ws}::admin_workspace`;

/**
 * Staff package T5: the read side for the owner and the heads. Reads ONLY
 * the nightly snapshots and the suggestion rows — never the big tables —
 * and each endpoint costs at most two queries (the snapshots with names in
 * one join, then the open suggestions of those people). `staff.rating_enabled`
 * off → «not found»: the feature does not exist.
 */
@Injectable()
export class StaffRatingReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: StaffSettingsService,
  ) {}

  private async assertOn(): Promise<void> {
    if (!(await this.settings.isOn('staff.rating_enabled'))) throw notFound();
  }

  async people(
    scope: RatingScope,
    q: StaffPeopleQueryDto,
  ): Promise<StaffPeopleListDto> {
    await this.assertOn();
    const order =
      q.sort === 'best'
        ? Prisma.sql`s.rating DESC NULLS LAST, s.admin_id`
        : Prisma.sql`s.rating ASC NULLS LAST, s.admin_id`;
    const rows = await this.prisma.$queryRaw<SnapshotRow[]>`
      SELECT ${SNAPSHOT_COLUMNS}
      FROM staff_rating_snapshots s JOIN users u ON u.id = s.admin_id
      WHERE ${LATEST} AND ${scopeSql('s', scope.workspace)}
        AND (${q.status ?? null}::text IS NULL OR s.status = ${q.status ?? null}::text)
      ORDER BY ${order}
      LIMIT ${q.limit ?? 50} OFFSET ${q.offset ?? 0}`;
    return {
      snapshotDate: rows[0] ? day(rows[0].snapshot_date) : null,
      items: await this.withOpenSuggestions(rows),
    };
  }

  async person(
    scope: RatingScope,
    adminId: string,
  ): Promise<StaffPersonDetailDto> {
    await this.assertOn();
    const rows = await this.prisma.$queryRaw<SnapshotRow[]>`
      SELECT ${SNAPSHOT_COLUMNS}
      FROM staff_rating_snapshots s JOIN users u ON u.id = s.admin_id
      WHERE ${LATEST} AND s.admin_id = ${adminId}::uuid AND ${scopeSql('s', scope.workspace)}`;
    const row = rows[0];
    if (!row) throw notFound();
    const recent = await this.prisma.staffSuggestion.findMany({
      where: { admin_id: adminId },
      orderBy: { created_at: 'desc' },
      take: DETAIL_SUGGESTIONS,
    });
    const person = this.person1(
      row,
      recent.filter((r) => r.status === 'open'),
    );
    return {
      ...person,
      evidence: row.evidence,
      suggestions: recent.map((r) => ({
        id: r.id,
        adminId: r.admin_id,
        name: person.name,
        workspace: row.workspace,
        kind: r.kind,
        status: r.status,
        snapshotDate: day(r.snapshot_date),
        evidence: r.evidence as Record<string, unknown>,
        createdAt: r.created_at.toISOString(),
      })),
    };
  }

  async shortlist(scope: RatingScope): Promise<StaffShortlistDto> {
    await this.assertOn();
    const rows = await this.prisma.$queryRaw<
      Array<SnapshotRow & { bucket: string }>
    >`
      (SELECT 'worst' AS bucket, ${SNAPSHOT_COLUMNS}
         FROM staff_rating_snapshots s JOIN users u ON u.id = s.admin_id
        WHERE ${LATEST} AND ${scopeSql('s', scope.workspace)} AND s.status IN ('red', 'yellow')
        ORDER BY (s.status = 'red') DESC, s.rating ASC NULLS LAST, s.admin_id
        LIMIT ${SHORTLIST_SIZE})
      UNION ALL
      (SELECT 'best' AS bucket, ${SNAPSHOT_COLUMNS}
         FROM staff_rating_snapshots s JOIN users u ON u.id = s.admin_id
        WHERE ${LATEST} AND ${scopeSql('s', scope.workspace)} AND s.status = 'green'
        ORDER BY s.rating DESC, s.admin_id
        LIMIT ${SHORTLIST_SIZE})`;
    const people = await this.withOpenSuggestions(rows);
    const bucket = new Map(rows.map((r) => [r.admin_id, r.bucket]));
    return {
      snapshotDate: rows[0] ? day(rows[0].snapshot_date) : null,
      worst: people.filter((p) => bucket.get(p.adminId) === 'worst'),
      best: people.filter((p) => bucket.get(p.adminId) === 'best'),
    };
  }

  async suggestions(
    scope: RatingScope,
    q: StaffSuggestionsQueryDto,
  ): Promise<StaffSuggestionListDto> {
    await this.assertOn();
    const rows = await this.prisma.$queryRaw<SuggestionRow[]>`
      SELECT g.id, g.admin_id, g.kind, g.status, g.snapshot_date, g.evidence, g.created_at,
             p.workspace, u.first_name, u.last_name
      FROM staff_suggestions g
      JOIN admin_profiles p ON p.user_id = g.admin_id
      JOIN users u ON u.id = g.admin_id
      WHERE g.status = ${q.status ?? 'open'}
        AND (${q.kind ?? null}::text IS NULL OR g.kind = ${q.kind ?? null}::text)
        AND ${scopeSql('p', scope.workspace)}
      ORDER BY g.created_at DESC, g.id
      LIMIT ${q.limit ?? 50} OFFSET ${q.offset ?? 0}`;
    const items: StaffSuggestionDto[] = rows.map((r) => ({
      id: r.id,
      adminId: r.admin_id,
      name: nameOf(r),
      workspace: r.workspace,
      kind: r.kind,
      status: r.status,
      snapshotDate: day(r.snapshot_date),
      evidence: r.evidence,
      createdAt: r.created_at.toISOString(),
    }));
    return { items };
  }

  private async withOpenSuggestions(
    rows: SnapshotRow[],
  ): Promise<StaffPersonDto[]> {
    if (rows.length === 0) return [];
    const open = await this.prisma.staffSuggestion.findMany({
      where: { admin_id: { in: rows.map((r) => r.admin_id) }, status: 'open' },
      select: { id: true, admin_id: true, kind: true, created_at: true },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((r) =>
      this.person1(
        r,
        open.filter((o) => o.admin_id === r.admin_id),
      ),
    );
  }

  private person1(
    r: SnapshotRow,
    open: Array<{ id: string; kind: string; created_at: Date }>,
  ): StaffPersonDto {
    return {
      adminId: r.admin_id,
      name: nameOf(r),
      workspace: r.workspace,
      rating: r.rating,
      decisions: r.n_decisions,
      status: r.status,
      flags: r.flags,
      rankPct: r.rank_pct,
      accuracy: r.accuracy,
      clean: r.clean,
      usersVerdict: r.users_verdict,
      speed: r.speed,
      openSuggestions: open.map((o) => ({
        id: o.id,
        kind: o.kind,
        createdAt: o.created_at.toISOString(),
      })),
    };
  }
}
