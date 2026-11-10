import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setLastInput } from '@/lib/activity';
import {
  __setAdminLiveUp,
  adminLiveUp,
  isLiveQuery,
  LIVE_DEBOUNCE_MS,
  startAdminLive,
  type LiveTicket,
} from '@/lib/admin-live';
import { LIVE_MS, livePoll } from '@/lib/live';

/** A socket.io-client stand-in: `on` registers, `fire` plays an event. */
function fakeIo() {
  const handlers = new Map<string, ((...a: unknown[]) => void)[]>();
  const socket = {
    on: vi.fn((ev: string, fn: (...a: unknown[]) => void) => {
      handlers.set(ev, [...(handlers.get(ev) ?? []), fn]);
      return socket;
    }),
    disconnect: vi.fn(),
    fire: (ev: string, ...a: unknown[]) => handlers.get(ev)?.forEach((fn) => fn(...a)),
  };
  const io = vi.fn(() => socket) as unknown as typeof import('socket.io-client').io & { mock: { calls: unknown[][] } };
  return { io, socket };
}

const ticket = (over: Partial<LiveTicket> = {}): LiveTicket => ({
  enabled: true,
  ticket: 'abcdefghijklmnopqrstuvwxyz012345',
  namespace: '/admin',
  origin: 'https://api.example.test',
  ...over,
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('admin live channel (speed matrix §3 #5)', () => {
  beforeEach(() => {
    __setAdminLiveUp(false);
    __setLastInput(Date.now());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    __setAdminLiveUp(false);
  });

  it('connects with the ticket at the API origin and marks the channel up / down', async () => {
    const qc = new QueryClient();
    const inv = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue();
    const { io, socket } = fakeIo();
    const stop = startAdminLive(qc, { fetchTicket: () => Promise.resolve(ticket()), io });
    await flush();
    expect(io).toHaveBeenCalledTimes(1);
    const [url, opts] = (io as unknown as { mock: { calls: [string, { auth: (cb: (a: unknown) => void) => void; transports: string[] }][] } }).mock.calls[0];
    expect(url).toBe('https://api.example.test/admin');
    expect(opts.transports).toEqual(['websocket']);
    // the first handshake uses the ticket already fetched
    const cb = vi.fn();
    opts.auth(cb);
    expect(cb).toHaveBeenCalledWith({ ticket: 'abcdefghijklmnopqrstuvwxyz012345' });
    expect(adminLiveUp()).toBe(false);
    socket.fire('connect');
    expect(adminLiveUp()).toBe(true);
    expect(inv).toHaveBeenCalledTimes(1); // one catch-up refetch of the live queries
    socket.fire('disconnect');
    expect(adminLiveUp()).toBe(false);
    expect(inv).toHaveBeenCalledTimes(2); // the timers start again
    stop();
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('owner 2026-11-10: the first connect re-reads only what was not just fetched, a reconnect everything', async () => {
    const qc = new QueryClient();
    const fresh = qc.getQueryCache().build(qc, { queryKey: ['fresh'], refetchInterval: livePoll() } as never);
    fresh.setData('x', { updatedAt: Date.now(), manual: false });
    const old = qc.getQueryCache().build(qc, { queryKey: ['old'], refetchInterval: livePoll() } as never);
    old.setData('y', { updatedAt: Date.now() - 60_000, manual: false });
    const inv = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue();
    const { io, socket } = fakeIo();
    const stop = startAdminLive(qc, { fetchTicket: () => Promise.resolve(ticket()), io });
    await flush();
    const picked = () => {
      const pred = (inv.mock.calls.at(-1)![0] as { predicate: (q: unknown) => boolean }).predicate;
      return [fresh, old].filter((q) => pred(q)).map((q) => q.queryKey[0]);
    };
    socket.fire('connect');
    expect(picked()).toEqual(['old']);
    socket.fire('disconnect');
    socket.fire('connect');
    expect(picked()).toEqual(['fresh', 'old']);
    stop();
  });

  it('a reconnect asks for a fresh one-shot ticket', async () => {
    const qc = new QueryClient();
    const tickets = [ticket(), ticket({ ticket: 'second-ticket-second-ticket-0001' })];
    const fetchTicket = vi.fn(() => Promise.resolve(tickets.shift() ?? null));
    const { io } = fakeIo();
    startAdminLive(qc, { fetchTicket, io });
    await flush();
    const opts = (io as unknown as { mock: { calls: [string, { auth: (cb: (a: unknown) => void) => void }][] } }).mock.calls[0][1];
    opts.auth(() => undefined); // first connect
    const cb = vi.fn();
    opts.auth(cb); // reconnect
    await flush();
    expect(fetchTicket).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenCalledWith({ ticket: 'second-ticket-second-ticket-0001' });
  });

  it('switch off or no session: no socket, the poll stays', async () => {
    const qc = new QueryClient();
    const { io } = fakeIo();
    startAdminLive(qc, { fetchTicket: () => Promise.resolve(ticket({ enabled: false, ticket: null })), io });
    startAdminLive(qc, { fetchTicket: () => Promise.resolve(null), io });
    startAdminLive(qc, { fetchTicket: () => Promise.reject(new Error('401')), io });
    await flush();
    expect(io).not.toHaveBeenCalled();
    expect(adminLiveUp()).toBe(false);
  });

  it('a burst of admin:changed events is one refetch of the live queries, none while idle', async () => {
    vi.useFakeTimers();
    const qc = new QueryClient();
    const inv = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue();
    const { io, socket } = fakeIo();
    startAdminLive(qc, { fetchTicket: () => Promise.resolve(ticket()), io });
    await vi.advanceTimersByTimeAsync(0);
    socket.fire('connect');
    inv.mockClear();
    socket.fire('admin:changed', { key: 'admin-counts' });
    socket.fire('admin:changed', { key: 'dashboard' });
    socket.fire('admin:changed', { key: 'audit-log' });
    expect(inv).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(LIVE_DEBOUNCE_MS);
    expect(inv).toHaveBeenCalledTimes(1);
    expect(inv.mock.calls[0][0]).toMatchObject({ refetchType: 'active' });
    // S18-1: nobody at the screen for 15 min — the event wakes nothing
    __setLastInput(Date.now() - 16 * 60_000);
    socket.fire('admin:changed', { key: 'dashboard' });
    await vi.advanceTimersByTimeAsync(LIVE_DEBOUNCE_MS);
    expect(inv).toHaveBeenCalledTimes(1);
  });

  it('livePoll: the minute timer stops while the socket is up, faster polls keep running', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const q = { state: { error: null, data: undefined } };
    expect(livePoll()(q)).toBe(LIVE_MS);
    __setAdminLiveUp(true);
    expect(livePoll()(q)).toBe(false);
    expect(livePoll(5 * 60_000)(q)).toBe(false);
    // a board that is red asks every 15 s: not announced by the server, keeps its timer
    expect(livePoll(() => 15_000)(q)).toBe(15_000);
    __setAdminLiveUp(false);
    expect(livePoll()(q)).toBe(LIVE_MS);
  });

  it('isLiveQuery picks exactly the livePoll() queries', () => {
    expect(isLiveQuery({ options: { refetchInterval: livePoll() } } as never)).toBe(true);
    expect(isLiveQuery({ options: { refetchInterval: 30_000 } } as never)).toBe(false);
    expect(isLiveQuery({ options: {} } as never)).toBe(false);
  });
});
