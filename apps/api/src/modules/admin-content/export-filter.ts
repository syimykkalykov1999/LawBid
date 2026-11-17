import { BadRequestException } from '@nestjs/common';
import {
  AssistantStatus,
  BidStatus,
  CaseStatus,
  ContentStatus,
  PaymentStatus,
  PostKind,
  UserRole,
  UserStatus,
} from '../../generated/prisma/enums';
import { ErrorCode } from '../../common/errors/error-code.enum';

/**
 * Owner 14.11 (row 180, B7 / detective R3A-8): the CSV export takes the
 * filters of the list on screen (Stripe Dashboard «Export» exports the
 * filtered list). One small filter shape for every entity; each entity
 * uses the fields it has. No filter = the whole table, as before.
 */
export interface ExportFilter {
  q?: string;
  role?: string;
  status?: string;
  stateCode?: string;
  userId?: string;
  caseId?: string;
  kind?: string;
  from?: string;
  to?: string;
  /** Case payments: only disputed ones (the «Споры» tab). */
  disputed?: boolean;
  /** Cases: «Только с жалобами» (true) / without an open report (false). */
  hasReports?: boolean;
  /** Cases: «С датой» — a deadline from today (report time zone) on. */
  withDeadline?: boolean;
}

/** What some filters need from the database / clock, resolved before the
 * export by the service (row 180 follow-up B7). Missing = only validated. */
export interface ExportFilterContext {
  /** Case ids with an open report (the cases list's own lookup). */
  reportedCaseIds?: string[];
  /** Local midnight of today in the report time zone. */
  deadlineFrom?: Date;
}

const STATUS: Record<string, readonly string[] | null> = {
  users: Object.values(UserStatus),
  cases: Object.values(CaseStatus),
  bids: Object.values(BidStatus),
  payments: Object.values(PaymentStatus),
  // a plain text column
  case_payments: null,
  posts: Object.values(ContentStatus),
  teams: Object.values(AssistantStatus),
};

function bad(field: string): BadRequestException {
  return new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message: `This list cannot be filtered by that ${field}.`,
    details: { field },
  });
}

/** The Prisma where of [entity] for [f]; undefined when nothing is set.
 * Throws 400 for a value the entity cannot take (checked before the file
 * starts, so a bad link never gives a broken download). */
export function exportWhere(
  entity: string,
  f: ExportFilter = {},
  ctx: ExportFilterContext = {},
): { AND: Record<string, unknown>[] } | undefined {
  const and: Record<string, unknown>[] = [];
  const like = (v: string) => ({ contains: v, mode: 'insensitive' });
  const q = f.q?.trim();
  if (q) {
    if (entity === 'users') {
      and.push({
        OR: [
          { first_name: like(q) },
          { last_name: like(q) },
          { email: like(q) },
        ],
      });
    } else if (entity === 'cases' || entity === 'posts') {
      and.push({ title: like(q) });
    } else if (entity === 'bids') {
      and.push({ case: { title: like(q) } });
    } else throw bad('q');
  }
  if (f.role) {
    if (
      entity !== 'users' ||
      !Object.values(UserRole).includes(f.role as never)
    )
      throw bad('role');
    and.push({ role: f.role });
  }
  if (f.status) {
    const allowed = STATUS[entity];
    if (allowed === undefined || (allowed && !allowed.includes(f.status)))
      throw bad('status');
    and.push({ status: f.status });
  }
  if (f.stateCode) {
    if (entity !== 'cases') throw bad('stateCode');
    and.push({ primary_state_code: f.stateCode.toUpperCase() });
  }
  if (f.userId) {
    const col: Record<string, string> = {
      cases: 'client_id',
      bids: 'attorney_id',
      payments: 'user_id',
      posts: 'author_id',
      teams: 'attorney_id',
    };
    if (entity === 'users') and.push({ id: f.userId });
    else if (entity === 'case_payments')
      and.push({ OR: [{ client_id: f.userId }, { attorney_id: f.userId }] });
    else and.push({ [col[entity]]: f.userId });
  }
  if (f.caseId) {
    if (!['bids', 'case_payments'].includes(entity)) throw bad('caseId');
    and.push({ case_id: f.caseId });
  }
  if (f.kind) {
    if (entity === 'posts' && Object.values(PostKind).includes(f.kind as never))
      and.push({ kind: f.kind });
    else if (entity === 'case_payments') and.push({ kind: f.kind });
    else throw bad('kind');
  }
  if (f.disputed) {
    if (entity !== 'case_payments') throw bad('disputed');
    and.push({ dispute_status: { not: null } });
  }
  if (f.hasReports !== undefined) {
    if (entity !== 'cases') throw bad('hasReports');
    if (ctx.reportedCaseIds) {
      and.push(
        f.hasReports
          ? { id: { in: ctx.reportedCaseIds } }
          : { id: { notIn: ctx.reportedCaseIds } },
      );
    }
  }
  if (f.withDeadline) {
    if (entity !== 'cases') throw bad('withDeadline');
    if (ctx.deadlineFrom) and.push({ deadline_at: { gte: ctx.deadlineFrom } });
  }
  if (f.from || f.to) {
    and.push({
      created_at: {
        ...(f.from ? { gte: new Date(f.from) } : {}),
        ...(f.to ? { lt: new Date(f.to) } : {}),
      },
    });
  }
  return and.length ? { AND: and } : undefined;
}
