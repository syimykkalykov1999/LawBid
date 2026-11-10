import { QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setLastInput } from '@/lib/activity';
import { __setAdminLiveUp, invalidateLiveQueries } from '@/lib/admin-live';
import { livePoll } from '@/lib/live';
import { makeQueryClient } from '@/lib/query-client';

/**
 * Speed matrix 2026-11-09 (§3 #5), the before / after numbers for the PR:
 * how many requests the panel's live queries send in five minutes with the
 * minute poll (socket down) and with the socket up (server-announced
 * changes only). 29 = the `livePoll()` sites counted in the matrix (§2.8),
 * mounted on the panel's real QueryClient with TanStack's own timers.
 */
const PANELS = 29;
const FIVE_MIN = 5 * 60_000;

describe('live queries: requests in five minutes (speed matrix §3 #5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __setLastInput(Date.now());
    __setAdminLiveUp(false);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    __setAdminLiveUp(false);
  });

  it('poll: one request per panel per minute; socket: only the announced changes', async () => {
    const qc = makeQueryClient();
    let requests = 0;
    const observers = Array.from({ length: PANELS }, (_, i) => {
      const o = new QueryObserver(qc, {
        queryKey: ['live-panel', i],
        queryFn: () => {
          requests += 1;
          return Promise.resolve({ i, at: Date.now() });
        },
        refetchInterval: livePoll(),
      });
      o.subscribe(() => undefined);
      return o;
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(requests).toBe(PANELS); // the first load
    requests = 0;
    await vi.advanceTimersByTimeAsync(FIVE_MIN);
    const polled = requests;
    // 60 s timer x 5 minutes x 29 panels
    expect(polled).toBe(PANELS * 5);

    // The socket comes up: one catch-up refetch, then the timers are off.
    __setAdminLiveUp(true);
    requests = 0;
    await invalidateLiveQueries(qc);
    await vi.advanceTimersByTimeAsync(10);
    expect(requests).toBe(PANELS);
    requests = 0;
    await vi.advanceTimersByTimeAsync(FIVE_MIN);
    const quiet = requests;
    expect(quiet).toBe(0);

    // Two server announcements in five minutes (an action, a counts change).
    await invalidateLiveQueries(qc);
    await vi.advanceTimersByTimeAsync(FIVE_MIN / 2);
    await invalidateLiveQueries(qc);
    await vi.advanceTimersByTimeAsync(FIVE_MIN / 2);
    const withChanges = requests;
    expect(withChanges).toBe(PANELS * 2);

    console.log(
      `\n| режим | запросов за 5 мин (29 панелей) | в минуту |\n|---|---|---|\n| опрос раз в 60 с (было) | ${polled} | ${polled / 5} |\n| сокет, ничего не менялось (стало) | ${quiet} | ${quiet / 5} |\n| сокет, 2 изменения на сервере за 5 мин | ${withChanges} | ${withChanges / 5} |\n`,
    );
    observers.forEach((o) => o.destroy());
  });
});
