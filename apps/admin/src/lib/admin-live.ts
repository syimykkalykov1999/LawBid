'use client';

import type { Query, QueryClient } from '@tanstack/react-query';
import type { io as ioFn, Socket } from 'socket.io-client';
import { idleMs, IDLE_STOP_MS } from '@/lib/activity';

/**
 * Speed matrix 2026-11-09 (§3 #5, «опрос раз в 60 с на 29 панелях»): the
 * panel keeps one read-only Socket.IO connection to the API's `/admin`
 * namespace (socket.io-client, the library the app already uses). The
 * server says `admin:changed` when a stored board, the sidebar counts or
 * the action journal moved; the panel then invalidates its LIVE queries —
 * those that carry `refetchInterval: livePoll()` — and TanStack refetches
 * only the ones on screen (304 from the browser cache when the body is
 * the same). While the socket is up `livePoll` returns false, so the minute
 * timers stop; the moment it drops they run again (the fallback).
 *
 * Auth: the admin JWT is an httpOnly cookie, so the browser asks its own
 * server (`POST /api/realtime/ticket`) for a one-shot ticket and presents
 * that at the handshake — for the first connect and, through socket.io's
 * `auth` callback, for every reconnect.
 */
export interface LiveTicket {
  enabled: boolean;
  ticket: string | null;
  namespace: string;
  /** The API origin the browser connects to (`https://api.…`). */
  origin: string;
}

/** Events of one burst (an action drops several boards) become one refetch. */
export const LIVE_DEBOUNCE_MS = 1000;

let up = false;

/** True while the live socket is connected (livePoll stops its timer). */
export function adminLiveUp(): boolean {
  return up;
}

/** Test hook. */
export function __setAdminLiveUp(v: boolean): void {
  up = v;
}

/** The queries the minute poll used to refresh: `refetchInterval` given as
 * a function is exactly the `livePoll()` form (lib/live.ts). */
export function isLiveQuery(q: Pick<Query, 'options'>): boolean {
  // The observer's options (refetchInterval among them) are what the query
  // holds; the core `QueryOptions` type just does not name that field.
  return typeof (q.options as { refetchInterval?: unknown }).refetchInterval === 'function';
}

/** Owner 2026-11-10 (every admin page asked for all its data twice): on
 * the first connect of a tab only what is older than this is re-read — the
 * page fetched the rest a moment ago. After a drop everything is. */
export const FIRST_CONNECT_FRESH_MS = 5_000;

/** Refetch the live queries that are on screen now (only those older than
 * `olderThanMs` when given). */
export function invalidateLiveQueries(qc: QueryClient, olderThanMs?: number): Promise<void> {
  const before = olderThanMs === undefined ? Infinity : Date.now() - olderThanMs;
  return qc.invalidateQueries({
    predicate: (q) => isLiveQuery(q) && q.state.dataUpdatedAt < before,
    refetchType: 'active',
  });
}

export async function fetchLiveTicket(): Promise<LiveTicket | null> {
  const res = await fetch('/api/realtime/ticket', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { data?: LiveTicket } | null;
  return body?.data ?? null;
}

export interface LiveDeps {
  fetchTicket: () => Promise<LiveTicket | null>;
  /** socket.io-client's `io`; loaded in its own chunk when not given (S18-8:
   * nothing of the live channel is in the first paint). */
  io: typeof ioFn;
}

async function defaultDeps(): Promise<LiveDeps> {
  const { io } = await import('socket.io-client');
  return { fetchTicket: fetchLiveTicket, io };
}

/**
 * Opens the live channel for [qc]; returns the stopper. Does nothing (the
 * poll stays) when the switch `realtime.admin_events_enabled` is off or
 * the ticket cannot be had.
 */
export function startAdminLive(qc: QueryClient, given?: LiveDeps): () => void {
  let stopped = false;
  // This tab has been connected before (a later `connect` is a reconnect).
  let wasUp = false;
  let socket: Socket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  // The newest change time (`at`) of the events in this debounce window;
  // null = an event without a time: re-read everything, as before.
  let changedAt: number | null | undefined;

  const flush = () => {
    timer = undefined;
    const at = changedAt;
    changedAt = undefined;
    // S18-1: nobody has touched the screen for 15 minutes — the session
    // must be allowed to run out; the first input brings the data back.
    if (idleMs() > IDLE_STOP_MS) return;
    // Owner 2026-11-10 («Масштаб» asked for everything three times): a
    // query that was answered after the change already shows it — only
    // what was read before the change is read again (the page's own visit
    // recomputes the summaries and announces them a moment later).
    void invalidateLiveQueries(qc, typeof at === 'number' ? Math.max(0, Date.now() - at) : undefined);
  };
  const schedule = (event?: { at?: unknown }) => {
    const t = typeof event?.at === 'string' ? Date.parse(event.at) : Number.NaN;
    if (Number.isNaN(t)) changedAt = null;
    else if (changedAt !== null) changedAt = Math.max(changedAt ?? 0, t);
    if (!timer) timer = setTimeout(flush, LIVE_DEBOUNCE_MS);
  };

  void (given ? Promise.resolve(given) : defaultDeps())
    .then(async (deps) => [deps, await deps.fetchTicket().catch(() => null)] as const)
    .then(([deps, first]) => {
      if (stopped || !first?.enabled || !first.ticket) return;
      let firstTicket: string | null = first.ticket;
      socket = deps.io(`${first.origin}${first.namespace}`, {
        path: '/socket.io',
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelayMax: 30_000,
        // A fresh one-shot ticket for every (re)connect.
        auth: (cb) => {
          if (firstTicket) {
            const t = firstTicket;
            firstTicket = null;
            cb({ ticket: t });
            return;
          }
          deps
            .fetchTicket()
            .then((t) => cb({ ticket: t?.ticket ?? '' }))
            .catch(() => cb({ ticket: '' }));
        },
      });
      socket.on('connect', () => {
        up = true;
        // The timers re-read their interval on the next state change; one
        // refetch now also catches what moved while the socket was down
        // (on the first connect: only what was not just fetched).
        void invalidateLiveQueries(qc, wasUp ? undefined : FIRST_CONNECT_FRESH_MS);
        wasUp = true;
      });
      socket.on('disconnect', () => {
        up = false;
        if (!stopped) void invalidateLiveQueries(qc);
      });
      socket.on('admin:changed', schedule);
      socket.on('auth:error', () => {
        // Session ended / ticket refused: back to the poll (a 401 there
        // sends the tab to /login); no reconnect storm.
        up = false;
        socket?.disconnect();
      });
    });

  return () => {
    stopped = true;
    up = false;
    if (timer) clearTimeout(timer);
    socket?.disconnect();
    socket = null;
  };
}
