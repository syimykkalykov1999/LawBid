import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import type {
  SupportClientContextInputDto,
  SupportStatus,
} from './support.dto';

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

// --- ready answers (macros): variables and languages ---------------------------

/** The short number support and the user quote: `#` + the first 8 hex of
 * the ticket id, upper case. */
export function ticketRef(ticketId: string): string {
  return `#${ticketId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

/**
 * Owner 2026-10-18 (OQ-055): fills `{name}` (the user's first name) and
 * `{ticket}` (the ticket number) in an admin reply — on the server, when
 * the reply is sent, so the agent cannot send them raw. Without a first
 * name `{name}` becomes "there" (English) or nothing (Russian: "Здравствуйте,
 * {name}!" reads "Здравствуйте!"; stray spaces and commas are tidied).
 */
export function renderMacro(
  text: string,
  v: {
    firstName: string | null | undefined;
    ticketId: string;
    language: string;
  },
): string {
  const first = v.firstName?.trim() ?? '';
  const ru = v.language.toLowerCase().startsWith('ru');
  const name = first || (ru ? '' : 'there');
  const out = text
    .replace(/\{name\}/gi, () => name)
    .replace(/\{ticket\}/gi, () => ticketRef(v.ticketId));
  return name === '' ? tidyAfterEmptyName(out) : out;
}

/** "Здравствуйте, !" → "Здравствуйте!"; "Hi , x" → "Hi, x". Only runs
 * when a variable was replaced by nothing. */
function tidyAfterEmptyName(s: string): string {
  return s
    .replace(/[ \t]+([,!.?:;])/g, '$1')
    .replace(/,([!.?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ');
}

/** The macro text for a user's language: the Russian body for `ru` when
 * there is one, otherwise the English body. */
export function pickMacroBody(
  m: { body: string; body_ru: string | null },
  language: string | null | undefined,
): string {
  const ru = (language ?? 'en').toLowerCase().startsWith('ru');
  const bodyRu = m.body_ru?.trim();
  return ru && bodyRu ? bodyRu : m.body;
}

// --- messages: content and device context --------------------------------------

/** A message needs words or at least one file. */
export function assertHasContent(
  body: string,
  files: readonly unknown[] | undefined,
): void {
  if (body.trim().length === 0 && (files?.length ?? 0) === 0) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Write a message or attach a file.',
      details: { field: 'body' },
    });
  }
}

/** What is stored in `client_context`: the app's fields (trimmed, only the
 * known keys) plus the user id and role from the session. */
export function buildClientContext(
  input: SupportClientContextInputDto | undefined,
  user: { id: string; role: string | null },
): Record<string, string> | null {
  if (!input) return null;
  const out: Record<string, string> = {};
  const keys = [
    'appVersion',
    'buildNumber',
    'platform',
    'osVersion',
    'deviceModel',
    'language',
    'theme',
    'timezone',
    'route',
  ] as const;
  for (const k of keys) {
    const v = input?.[k];
    if (typeof v === 'string' && v.trim() !== '') out[k] = v.trim();
  }
  out.userId = user.id;
  if (user.role) out.role = user.role;
  return out;
}
