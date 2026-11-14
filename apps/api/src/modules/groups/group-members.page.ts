import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma, type ChatGroupMember } from '../../generated/prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { PrismaService } from '../../prisma/prisma.service';

/** Sweep B-c1 (2026-11-09): the most members GET /groups/:id carries;
 * a bigger group pages through GET /groups/:id/members. */
export const DETAIL_MEMBERS = 100;
export const MEMBERS_PAGE_DEFAULT = 50;

/** Keyset position in (role, joined_at, user_id) — owner, admins, members
 * (the chat_group_role enum order), then by join time. */
export interface MemberCursor {
  role: 'owner' | 'admin' | 'member';
  joinedAt: Date;
  userId: string;
}

const ROLES = new Set(['owner', 'admin', 'member']);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const badCursor = () =>
  new HttpException(
    {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Invalid cursor.',
      details: { field: 'cursor' },
    },
    HttpStatus.BAD_REQUEST,
  );

export function encodeMemberCursor(c: MemberCursor): string {
  return Buffer.from(
    JSON.stringify({ r: c.role, t: c.joinedAt.toISOString(), id: c.userId }),
  ).toString('base64url');
}

/** 400 VALIDATION_ERROR (details.field = 'cursor') for anything else. */
export function decodeMemberCursor(raw: string): MemberCursor {
  try {
    const p = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      r?: unknown;
      t?: unknown;
      id?: unknown;
    };
    const joinedAt = typeof p.t === 'string' ? new Date(p.t) : undefined;
    if (
      typeof p.r === 'string' &&
      ROLES.has(p.r) &&
      joinedAt &&
      !Number.isNaN(joinedAt.getTime()) &&
      typeof p.id === 'string' &&
      UUID_RE.test(p.id)
    ) {
      return {
        role: p.r as MemberCursor['role'],
        joinedAt,
        userId: p.id,
      };
    }
  } catch {
    // fall through
  }
  throw badCursor();
}

/**
 * One page of a group's live members in (role, joined_at, user_id) order,
 * [limit] + 1 read to know whether there is more. The keyset query reads
 * only ids (a group holds ≤ 5 000 rows on the PK index); the rows follow
 * by id and keep the page order.
 */
export async function memberPage(
  prisma: PrismaService,
  groupId: string,
  limit: number,
  after: MemberCursor | null,
): Promise<{ rows: ChatGroupMember[]; next: MemberCursor | null }> {
  const keyset = after
    ? Prisma.sql`AND (role, joined_at, user_id) > (${after.role}::chat_group_role, ${after.joinedAt}::timestamptz, ${after.userId}::uuid)`
    : Prisma.empty;
  const ids = await prisma.$queryRaw<{ user_id: string }[]>`
    SELECT user_id::TEXT AS user_id
    FROM chat_group_members
    WHERE group_id = ${groupId}::uuid AND left_at IS NULL ${keyset}
    ORDER BY role, joined_at, user_id
    LIMIT ${limit + 1}`;
  const pageIds = ids.slice(0, limit).map((r) => r.user_id);
  const found = pageIds.length
    ? await prisma.chatGroupMember.findMany({
        where: { group_id: groupId, user_id: { in: pageIds } },
      })
    : [];
  const byId = new Map(found.map((r) => [r.user_id, r]));
  const rows = pageIds.flatMap((id) => {
    const r = byId.get(id);
    return r ? [r] : [];
  });
  const last = rows[rows.length - 1];
  const next =
    ids.length > limit && last
      ? { role: last.role, joinedAt: last.joined_at, userId: last.user_id }
      : null;
  return { rows, next };
}
