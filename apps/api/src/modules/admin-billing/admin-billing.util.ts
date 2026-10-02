import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AdminBillingUserDto } from './admin-billing.dto';

export const ADMIN_BILLING_PAGE = 30;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Keyset condition for (created_at DESC, id DESC) lists. */
export function afterCursor(cursor?: string): {
  OR?: (
    { created_at: { lt: Date } } | { created_at: Date; id: { lt: string } }
  )[];
} {
  if (!cursor) return {};
  const c = decodeCursor(cursor);
  return {
    OR: [
      { created_at: { lt: c.createdAt } },
      { created_at: c.createdAt, id: { lt: c.id } },
    ],
  };
}

/** Rows fetched with take = size + 1 → one page and its cursor. */
export function toPage<R extends { id: string; created_at: Date }, T>(
  rows: R[],
  size: number,
  map: (r: R) => T,
): Page<T> {
  const page = rows.slice(0, size);
  const last = page[page.length - 1];
  return {
    items: page.map(map),
    nextCursor:
      rows.length > size && last
        ? encodeCursor({ createdAt: last.created_at, id: last.id })
        : null,
  };
}

/** Display info of the users on a page — one query. */
export async function usersById(
  prisma: PrismaService,
  ids: string[],
): Promise<Map<string, AdminBillingUserDto>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      role: true,
      attorney_profile: { select: { username: true } },
    },
  });
  return new Map(
    rows.map((u) => [
      u.id,
      {
        id: u.id,
        name: [u.first_name, u.last_name].filter(Boolean).join(' ') || null,
        username: u.attorney_profile?.username ?? null,
        email: u.email,
        role: u.role,
      },
    ]),
  );
}

/** Calendar months in UTC (Jan 31 + 1 month → Feb 28/29). */
export function addMonthsUtc(d: Date, months: number): Date {
  const r = new Date(d.getTime());
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0),
  ).getUTCDate();
  r.setUTCDate(Math.min(day, lastDay));
  return r;
}
