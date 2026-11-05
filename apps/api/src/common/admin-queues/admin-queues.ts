import { Prisma } from '@prisma/client';
import type {
  ReportTargetType,
  VerificationRequestStatus,
} from '@prisma/client';
import {
  type CountryScope,
  userInScope,
} from '../../modules/countries/country-scope';

/**
 * R-403 (owner 2026-11-04): the sidebar badge of a queue and the rows of
 * that queue's default list view are ONE definition. Each `*Where` here is
 * used by the list service (plus its cursor) AND by AdminCountsService, with
 * the same country scope, so the badge can never count a row the list hides
 * (an `in_review` request taken by a verifier, a second report on an object
 * already listed, a report from another country than the open tab).
 */

/** AdminSummaryService family of the badges (`GET /admin/counts`): every
 * action that moves an item out of a queue drops it, so the next poll
 * recounts. */
export const ADMIN_COUNTS_SUMMARY_KEY = 'admin-counts';

/** «Люди → Адвокаты», tab «Все ожидающие». */
export const VERIFICATION_QUEUE_DEFAULT_STATUSES = [
  'submitted',
  'needs_more_info',
] as const satisfies readonly VerificationRequestStatus[];

export function verificationQueueWhere(
  q: { status?: VerificationRequestStatus; stateCode?: string },
  countries: CountryScope = null,
): Prisma.VerificationRequestWhereInput {
  return {
    // Owner 2026-10-05: a verifier for one country sees only its attorneys.
    ...(countries && {
      AND: [{ attorney: { user: userInScope(countries) } }],
    }),
    status: {
      in: q.status ? [q.status] : [...VERIFICATION_QUEUE_DEFAULT_STATUSES],
    },
    submitted_at: { not: null },
    ...(q.stateCode && {
      attorney: {
        licenses: {
          some: { state_code: q.stateCode, license_status: 'pending' },
        },
      },
    }),
  };
}

/** «Контент и модерация → Жалобы», tab «Открытые»: one row per object. */
export const REPORTS_QUEUE_DEFAULT_STATUS = 'open';

export function reportsQueueWhereSql(
  q: {
    status?: 'open' | 'actioned' | 'dismissed';
    targetType?: ReportTargetType;
    priority?: boolean;
  },
  countries: CountryScope = null,
): Prisma.Sql {
  const status = q.status ?? REPORTS_QUEUE_DEFAULT_STATUS;
  return Prisma.sql`WHERE status = ${status}::report_status
        ${
          // Owner 2026-10-23: the open queue is small and read in full; the
          // «handled» history is a window of the last 180 days, not a scan
          // of every report ever filed.
          status === 'open'
            ? Prisma.empty
            : Prisma.sql`AND created_at >= now() - interval '180 days'`
        }
        ${q.targetType ? Prisma.sql`AND target_type = ${q.targetType}::report_target_type` : Prisma.empty}
        ${q.priority ? Prisma.sql`AND priority_review` : Prisma.empty}
        ${
          // Owner 2026-10-05: moderators of one country see reports
          // made by people of that country.
          countries
            ? Prisma.sql`AND reporter_id IN (SELECT id FROM users WHERE country_code::TEXT = ANY(${countries}::TEXT[]))`
            : Prisma.empty
        }`;
}

/** How many rows the reports queue shows = distinct reported objects. */
export function reportsQueueCountSql(where: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`SELECT count(*)::INT AS n
      FROM (SELECT 1 FROM reports ${where} GROUP BY target_type, target_id) AS g`;
}

/** «Поддержка»: the «Непрочитанные» filter (owner 2026-10-18) — something
 * new from the user on a ticket that is not closed. */
export function unreadTicketsWhere(
  countries: CountryScope = null,
): Prisma.SupportTicketWhereInput {
  return {
    // Owner 2026-10-05: support staff of one country see its tickets.
    ...(countries ? { country_code: { in: countries } } : {}),
    unread_by_admin: true,
    status: { not: 'closed' },
  };
}

/** «Поддержка» sidebar badge (owner 2026-11-04): the page opens on the
 * «Открытые» tab, so the number equals the rows of that tab. */
export function openTicketsWhere(
  countries: CountryScope = null,
): Prisma.SupportTicketWhereInput {
  return {
    ...(countries ? { country_code: { in: countries } } : {}),
    status: 'open',
  };
}
