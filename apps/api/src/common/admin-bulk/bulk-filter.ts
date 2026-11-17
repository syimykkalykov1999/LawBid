import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { AppSettingsService } from '../app-settings/app-settings.service';
import { ErrorCode } from '../errors/error-code.enum';
import { assertStaffBulkCap, BULK_CHUNK, isOwnerAdmin } from './admin-bulk';

/**
 * Owner 14.11 (row 179 follow-up B6): «Выбрать всё по фильтру» on the cases,
 * content, media and templates lists works like the users page (S18-10):
 * the browser sends the list's FILTER, the server resolves the ids with the
 * very same where as the list (ids only, keyset pages of BULK_CHUNK) and
 * audits the filter once. The browser no longer walks the list page by page
 * collecting ids.
 *
 * The owner (super admin) has no cap; staff are capped by the owner's
 * setting `admin.bulk_select_cap` (0 = no cap), the same number the panel
 * shows as «первые N».
 */

export interface BulkFilterMatch {
  ids: string[];
  /** Ids the action touches (at most the cap). */
  matched: number;
  /** More rows match than the cap; only the first `cap` are touched. */
  capped: boolean;
}

/** One keyset page of ids, newest first; Prisma's `cursor` + `skip: 1`. */
export type IdPageReader = (page: {
  take: number;
  cursor?: { id: string };
  skip?: number;
}) => Promise<{ id: string }[]>;

/** The order every admin list pages in (created_at, id) desc. */
export const NEWEST_FIRST = [
  { created_at: 'desc' as const },
  { id: 'desc' as const },
];

/** The staff default of `admin.bulk_select_cap` when no settings are wired. */
export const BULK_SELECT_CAP_DEFAULT = 2000;

/** Same as AdminUsersService.resolveFilter: cap + 1 ids tell whether the
 * cap cut the list without a count over the table; no cap = every match. */
export async function idsByFilter(
  read: IdPageReader,
  cap: number | null,
): Promise<BulkFilterMatch> {
  const want = cap === null ? Number.POSITIVE_INFINITY : cap + 1;
  const ids: string[] = [];
  let cursor: string | undefined;
  while (ids.length < want) {
    const take = Math.min(BULK_CHUNK, want - ids.length);
    const page = await read({
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    ids.push(...page.map((r) => r.id));
    if (page.length < take) break;
    cursor = page[page.length - 1].id;
  }
  if (cap !== null && ids.length > cap) {
    return { ids: ids.slice(0, cap), matched: cap, capped: true };
  }
  return { ids, matched: ids.length, capped: false };
}

/** null = no cap: always the owner; staff when the setting is 0. */
export async function bulkFilterCap(
  admin: { adminRole?: string } | null,
  settings?: Pick<AppSettingsService, 'number'>,
): Promise<number | null> {
  if (isOwnerAdmin(admin)) return null;
  const n = settings
    ? await settings.number('admin.bulk_select_cap')
    : BULK_SELECT_CAP_DEFAULT;
  return Number.isInteger(n) && n > 0 ? n : null;
}

interface BulkActor {
  id: string;
  adminRole?: string;
  ip?: string | null;
}

interface AuditSink {
  record(entry: {
    adminId: string;
    action: string;
    targetType: string;
    targetId: null;
    after: Prisma.InputJsonObject;
    ip?: string | null;
  }): Promise<unknown>;
}

/**
 * The ids one bulk call acts on: the explicit `ids` (staff keep the list's
 * per-request cap, the owner has none) or the ids the `filter` matches
 * (resolved here, the filter audited once — the per-item audit rows stay
 * with the actions). Exactly one of the two, else 400.
 */
export async function bulkTargets(opts: {
  admin: BulkActor;
  ids?: string[];
  filter?: object;
  staffMax: number;
  settings?: Pick<AppSettingsService, 'number'>;
  resolve: (cap: number | null) => Promise<BulkFilterMatch>;
  audit?: AuditSink;
  auditAction: string;
  targetType: string;
  bulkAction?: string;
}): Promise<string[]> {
  if ((opts.ids === undefined) === (opts.filter === undefined)) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Send exactly one of ids or filter.',
      details: { field: 'ids' },
    });
  }
  if (opts.ids) {
    assertStaffBulkCap(opts.admin, opts.ids, opts.staffMax);
    return opts.ids;
  }
  const found = await opts.resolve(
    await bulkFilterCap(opts.admin, opts.settings),
  );
  await opts.audit?.record({
    adminId: opts.admin.id,
    action: opts.auditAction,
    targetType: opts.targetType,
    targetId: null,
    after: {
      ...(opts.bulkAction ? { action: opts.bulkAction } : {}),
      filter: { ...opts.filter },
      matched: found.matched,
      capped: found.capped,
      processed: found.ids.length,
    },
    ip: opts.admin.ip ?? null,
  });
  return found.ids;
}

/** For the confirm dialog: how many rows the filter matches for this admin. */
export async function bulkFilterPreview(
  admin: { adminRole?: string },
  settings: Pick<AppSettingsService, 'number'> | undefined,
  resolve: (cap: number | null) => Promise<BulkFilterMatch>,
): Promise<{ matched: number; capped: boolean; cap: number | null }> {
  const cap = await bulkFilterCap(admin, settings);
  const found = await resolve(cap);
  return { matched: found.matched, capped: found.capped, cap };
}
