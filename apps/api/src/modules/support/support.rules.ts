import { ConflictException, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import type { SupportStatus } from './support.dto';

/** Owner 2026-10-02 — support ticket state rules, shared by the app and
 * admin services (pure, unit-tested in support.rules.spec.ts). */

export const SUPPORT_TEAM_NAME = 'LawBid Support';

export interface StatusChange {
  status: SupportStatus;
  resolvedAt: Date | null;
}

/** resolved_at: kept/stamped while resolved or closed, cleared otherwise. */
export function withResolvedAt(
  next: SupportStatus,
  prevResolvedAt: Date | null,
  now: Date,
): StatusChange {
  return {
    status: next,
    resolvedAt:
      next === 'resolved' || next === 'closed' ? (prevResolvedAt ?? now) : null,
  };
}

/** The user writes: a closed ticket refuses; anything else is (re)opened. */
export function afterUserMessage(
  current: string,
  prevResolvedAt: Date | null,
  now: Date,
): StatusChange {
  if (current === 'closed') throw ticketClosed();
  return withResolvedAt('open', prevResolvedAt, now);
}

/** Support replies publicly: waiting_user unless the admin picks another. */
export function afterAdminReply(
  requested: SupportStatus | undefined,
  prevResolvedAt: Date | null,
  now: Date,
): StatusChange {
  return withResolvedAt(requested ?? 'waiting_user', prevResolvedAt, now);
}

export function ticketClosed(): ConflictException {
  return new ConflictException({
    code: ErrorCode.SUPPORT_TICKET_CLOSED,
    message: 'This ticket is closed. Create a new one.',
  });
}

export function ticketNotFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Ticket not found.',
  });
}

/** The name the app shows for a support message (never an email). */
export function supportAuthorName(
  firstName: string | null | undefined,
): string {
  const first = firstName?.trim();
  return first ? `${SUPPORT_TEAM_NAME} · ${first}` : SUPPORT_TEAM_NAME;
}

export const nameOf = (
  u: { first_name: string | null; last_name: string | null } | null | undefined,
): string => [u?.first_name, u?.last_name].filter(Boolean).join(' ') || '—';

/** Keyset paging on (last_message_at DESC, id DESC). */
export function activityKeyset(cursor?: string) {
  const c = cursor ? decodeCursor(cursor) : undefined;
  return c
    ? {
        OR: [
          { last_message_at: { lt: c.createdAt } },
          { last_message_at: c.createdAt, id: { lt: c.id } },
        ],
      }
    : {};
}

export function activityPage<
  T extends { id: string; last_message_at: Date },
  R,
>(
  rows: T[],
  limit: number,
  map: (r: T) => R,
): { items: R[]; nextCursor: string | null } {
  const slice = rows.slice(0, limit);
  const last = slice[slice.length - 1];
  return {
    items: slice.map(map),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({ createdAt: last.last_message_at, id: last.id })
        : null,
  };
}
