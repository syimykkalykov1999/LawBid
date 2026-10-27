'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { idleMs, IDLE_STOP_MS } from '@/lib/activity';
import { deskPost, MY_LEASES_KEY, type LeaseView } from '@/lib/desk-data';

/** The person moved the mouse or pressed a key within this time = «active». */
export const ACTIVE_WINDOW_MS = 3 * 60_000;
/** A lease is renewed only while the person is really at the screen. */
export const RENEW_IDLE_MS = 60_000;
/** How often the lease timers are looked at. */
export const RENEW_TICK_MS = 20_000;

/**
 * Staff package T4: the presence signal of an open desk every
 * `heartbeatSec` seconds (`POST admin/desk/heartbeat`, the twin of the
 * `presence:hb` socket event: the panel keeps the admin token in an httpOnly
 * cookie, so the browser talks to the API only through its proxy). `active`
 * = movement within the last 3 minutes. Does nothing while [enabled] is off.
 */
export function useDeskHeartbeat(enabled: boolean, heartbeatSec: number): void {
  // The status lives on the server: the shell and the desk read it from «my leases».
  const beat = useMutation({
    mutationFn: async () => {
      // Nobody has touched the screen for 15 minutes: stop signalling so the
      // session can run into its idle timeout (the panel's S18-1 rule).
      if (idleMs() > IDLE_STOP_MS) return null;
      return deskPost<{ status: string }>('/admin/desk/heartbeat', { active: idleMs() < ACTIVE_WINDOW_MS });
    },
  });
  const send = useRef(beat.mutate);
  send.current = beat.mutate;
  useEffect(() => {
    if (!enabled) return;
    send.current();
    const t = setInterval(() => send.current(), Math.max(5, heartbeatSec) * 1000);
    return () => clearInterval(t);
  }, [enabled, heartbeatSec]);
}

/** Should [l] be renewed now? Half of the time spent, the person is moving, the tab is shown. */
export function renewDue(l: LeaseView, totalSec: number, now: number, idle: number, hidden: boolean): boolean {
  if (hidden || idle > RENEW_IDLE_MS || totalSec <= 0) return false;
  const left = (new Date(l.leasedUntil).getTime() - now) / 1000;
  return left > 0 && left < totalSec / 2;
}

/**
 * Staff package T4: while the tab is open and the person moves, the items
 * in their hands are renewed on their own (`POST lease/:kind/:id/renew`), so
 * the timer never runs out under a working person. [ttlSec] says how long a
 * lease of a kind lasts.
 */
export function useLeaseAutoRenew(held: LeaseView[], ttlSec: (kind: string) => number, enabled: boolean): void {
  const qc = useQueryClient();
  const renew = useMutation({
    mutationFn: (l: LeaseView) => deskPost(`/admin/desk/lease/${l.kind}/${l.itemId}/renew`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: MY_LEASES_KEY }),
  });
  const state = useRef({ held, ttlSec, renew: renew.mutate });
  state.current = { held, ttlSec, renew: renew.mutate };
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      const { held: list, ttlSec: ttl, renew: go } = state.current;
      const now = Date.now();
      for (const l of list) {
        if (renewDue(l, ttl(l.kind), now, idleMs(now), document.hidden)) go(l);
      }
    }, RENEW_TICK_MS);
    return () => clearInterval(t);
  }, [enabled]);
}

/**
 * A decision made on a card (approve, resolve, hide, …) closes the lease on
 * the server by itself; the desk only has to look again so the card of the
 * finished item goes away. Any successful change made on the desk triggers
 * one look (the list of my items is a single cheap call).
 */
export function useRefreshOnDecision(enabled: boolean): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = qc.getMutationCache().subscribe((e) => {
      if (e.type !== 'updated' || e.action.type !== 'success') return;
      clearTimeout(timer);
      timer = setTimeout(() => void qc.invalidateQueries({ queryKey: MY_LEASES_KEY }), 600);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [enabled, qc]);
}
