'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { outcomeText, queueMode } from '@/components/desk/use-desk-queue';
import { useLeaseAutoRenew } from '@/components/desk/lease-hooks';
import { deskPost, MY_LEASES_KEY, useDeskSettings, useMyLeases, type LeaseView, type NextOutcome } from '@/lib/desk-data';
import { KIND_TTL_KEY, type LeaseKind } from '@/lib/desk';
import { useMe } from '@/lib/hooks';
import { pickNext } from '@/lib/review-flow';

/**
 * Owner 2026-10-28: the shared engine of every «…и дальше» review screen
 * (verification, complaints; support and the owner's queues plug in the
 * same way). It keeps the item on screen in React state — a decision opens
 * the next one in place: no page load, no trip back to the list.
 *
 * Who gets which item:
 *  - the lease engine is on for the queue (`staff.lease_enabled` + the
 *    queue's switch): `POST admin/desk/lease/next` hands the next item to
 *    this worker only (one item, one worker); a decision ends the lease
 *    (`…/done` with the outcome, which also checks a golden task), «Пропустить»
 *    is the engine's skip with a reason; the lease is renewed while the
 *    person works, exactly like on the desk;
 *  - otherwise: the queue's own list in its usual order (the same light call
 *    the list page makes), minus what was already decided or skipped here.
 *
 * Speed: the most likely next item (the head of that same list) is warmed
 * up once in the background — its card and its pictures — so «дальше» shows
 * it at once from the React Query cache. One item ahead, never the queue.
 */
export interface ReviewFlowConfig<T> {
  /** The lease kind of the queue (null = a queue without leases). */
  kind: LeaseKind | null;
  /** The item the page was opened with (from the address), if any. */
  initial: T | null;
  keyOf: (t: T) => string;
  /** The queue list, oldest first (a light, existing list call). */
  candidates: () => Promise<T[]>;
  /**
   * Without the lease engine: the queue's own «take the next one» call, if it
   * has one (support's `tickets/next` assigns the ticket to me). An item
   * already decided or skipped here falls back to the list.
   */
  take?: () => Promise<T | null>;
  /** Items the person can work right now (others are passed over). */
  usable?: (t: T) => boolean;
  /** The item of a lease the engine handed out (null = not this screen's). */
  fromLease: (l: LeaseView) => T | null;
  /** Warm up one item (card + pictures) in the background. */
  prefetch: (t: T) => Promise<void> | void;
  /** The address of an item (kept in the address bar for reload / sharing). */
  hrefOf: (t: T | null) => string;
}

export interface ReviewFlow<T> {
  current: T | null;
  /** Looking for the next item. */
  finding: boolean;
  /** The queue has nothing more for this person. */
  empty: boolean;
  /** Why there is no item (lease engine answer), if any. */
  note: string | null;
  /** Decided here or skipped in this session. */
  doneCount: number;
  leaseMode: boolean;
  /** The item was decided: close its lease and open the next one. */
  advance: (outcome?: string) => Promise<void>;
  /** «Пропустить» (the reason is required by the lease engine). */
  skip: (reason?: string) => Promise<void>;
  /** Look for the next item again (after «очередь пуста»). */
  refresh: () => Promise<void>;
}

export const CANDIDATES_KEY = 'review-candidates';

export function useReviewFlow<T>(cfg: ReviewFlowConfig<T>): ReviewFlow<T> {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const settings = useDeskSettings(me);
  const leaseMode = !settings.loading && queueMode(settings, cfg.kind) === 'lease';
  const ready = !me?.workspacesEnabled || !settings.loading;

  const [current, setCurrent] = useState<T | null>(cfg.initial);
  const [finding, setFinding] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const seen = useRef(new Set<string>());
  const prefetched = useRef(new Set<string>());
  const conf = useRef(cfg);
  conf.current = cfg;
  const currentKey = current ? cfg.keyOf(current) : null;

  // Keep the address in step without a navigation (reload opens the same item).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const href = conf.current.hrefOf(current);
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.replaceState(window.history.state, '', href);
  }, [current]);

  // The lease on screen stays alive while the person works (same rule as the desk).
  const leases = useMyLeases(leaseMode);
  const held = leases.data && leases.data.ok ? leases.data.data.leases.filter((l) => l.kind === cfg.kind && l.itemId === currentKey) : [];
  useLeaseAutoRenew(held, (k) => settings.num(KIND_TTL_KEY[k as LeaseKind] ?? 'staff.lease.ttl_ticket_min') * 60, leaseMode && held.length > 0);

  const list = useQuery({
    queryKey: [CANDIDATES_KEY, cfg.kind ?? 'none'],
    enabled: ready,
    staleTime: 30_000,
    queryFn: () => conf.current.candidates(),
  });

  const fromList = useCallback(async (): Promise<T | null> => {
    const c = conf.current;
    const rows = await qc.fetchQuery({ queryKey: [CANDIDATES_KEY, c.kind ?? 'none'], queryFn: () => c.candidates(), staleTime: 0 });
    return pickNext(rows, c.keyOf, null, seen.current, c.usable);
  }, [qc]);

  const findNext = useCallback(async () => {
    const c = conf.current;
    setFinding(true);
    setNote(null);
    try {
      let next: T | null = null;
      let leased = false;
      if (leaseMode && c.kind) {
        const r = await deskPost<NextOutcome>('/admin/desk/lease/next', { kind: c.kind });
        if (r.ok) {
          leased = true;
          const o = r.data;
          void qc.invalidateQueries({ queryKey: MY_LEASES_KEY });
          if (o.status === 'leased') next = c.fromLease(o.lease);
          else if (o.status === 'busy') {
            // Something of this queue is already in my hands: that one first.
            const mine = o.held.map((l) => c.fromLease(l)).find((t): t is T => !!t && !seen.current.has(c.keyOf(t)));
            next = mine ?? null;
            if (!next) setNote(outcomeText(o));
          } else setNote(outcomeText(o));
        }
      }
      if (!leased && c.take) {
        const t = await c.take();
        if (t && !seen.current.has(c.keyOf(t))) next = t;
      }
      if (!leased && !next) next = await fromList();
      setCurrent(next);
      setEmpty(!next);
    } catch (e) {
      toast.error(e);
    } finally {
      setFinding(false);
    }
  }, [fromList, leaseMode, qc, toast]);

  // Opened without an item: take the next one straight away.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !ready || cfg.initial) return;
    started.current = true;
    void findNext();
  }, [cfg.initial, findNext, ready]);

  // One item ahead: warm up the head of the list once.
  useEffect(() => {
    const c = conf.current;
    if (!list.data || !currentKey) return;
    const guess = pickNext(list.data, c.keyOf, currentKey, seen.current, c.usable);
    if (!guess) return;
    const k = c.keyOf(guess);
    if (prefetched.current.has(k)) return;
    prefetched.current.add(k);
    void Promise.resolve(c.prefetch(guess)).catch(() => undefined);
  }, [list.data, currentKey]);

  const leave = useCallback(() => {
    if (!currentKey) return;
    seen.current.add(currentKey);
    setDoneCount((n) => n + 1);
  }, [currentKey]);

  const advance = useCallback(
    async (outcome?: string) => {
      const c = conf.current;
      if (leaseMode && c.kind && currentKey) {
        // The decision is in force already; closing the lease is bookkeeping.
        await deskPost(`/admin/desk/lease/${c.kind}/${currentKey}/done`, outcome ? { outcome: outcome.slice(0, 24) } : {}).catch(() => undefined);
      }
      leave();
      await findNext();
    },
    [currentKey, findNext, leave, leaseMode],
  );

  const skip = useCallback(
    async (reason = 'other') => {
      const c = conf.current;
      if (leaseMode && c.kind && currentKey) {
        const r = await deskPost<{ ok: boolean; limited: boolean }>(`/admin/desk/lease/${c.kind}/${currentKey}/skip`, { reason }).catch((e: unknown) => {
          toast.error(e);
          return null;
        });
        if (!r) return;
        if (r.ok && r.data.limited) {
          toast.error(new Error('Пропусков в час больше нельзя: решите этот элемент или отпустите его на столе.'));
          return;
        }
      }
      leave();
      await findNext();
    },
    [currentKey, findNext, leave, leaseMode, toast],
  );

  return { current, finding, empty, note, doneCount, leaseMode, advance, skip, refresh: findNext };
}
