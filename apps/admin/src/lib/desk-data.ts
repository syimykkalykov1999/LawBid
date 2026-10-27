'use client';

import { useQuery } from '@tanstack/react-query';
import createClient from 'openapi-fetch';
import { ApiError, toProxy } from '@/lib/api/client';
import type { Me } from '@/lib/hooks';

/**
 * Staff package T8: the data the one-page desk reads. The desk consumes the
 * APIs of the other staff tasks (leases and presence T3, rating T5, appeals
 * T6, piecework T7) by their planned names. Until such a route exists on
 * the server — or while its own switch is off — the server answers 404 /
 * 501 / FEATURE_DISABLED and the desk simply shows that part as «not
 * available yet» instead of an error. Hence the untyped client here: the
 * generated contract only knows routes that are already merged.
 */
interface LooseClient {
  GET(url: string, init?: { params?: { query?: Record<string, string | number | boolean | undefined> } }): Promise<{ data?: unknown }>;
  POST(url: string, init?: { body?: unknown }): Promise<{ data?: unknown }>;
}

const client = createClient<Record<string, never>>({ baseUrl: '/' });
client.use(toProxy);
const raw = client as unknown as LooseClient;

/** A route that is not there (yet) or is switched off. */
export function isMissing(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 404 || e.status === 405 || e.status === 501 || e.code === 'FEATURE_DISABLED');
}

export type DeskResult<T> = { ok: true; data: T } | { ok: false; missing: true };

function unwrap<T>(res: { data?: unknown }): T {
  const body = res.data as { data?: T } | undefined;
  return (body?.data ?? body) as T;
}

/** GET that turns «route missing / switched off» into `{ missing: true }`. */
export async function deskGet<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<DeskResult<T>> {
  try {
    return { ok: true, data: unwrap<T>(await raw.GET(path, query ? { params: { query } } : undefined)) };
  } catch (e) {
    if (isMissing(e)) return { ok: false, missing: true };
    throw e;
  }
}

export async function deskPost<T>(path: string, body?: unknown): Promise<DeskResult<T>> {
  try {
    return { ok: true, data: unwrap<T>(await raw.POST(path, { body: body ?? {} })) };
  } catch (e) {
    if (isMissing(e)) return { ok: false, missing: true };
    throw e;
  }
}

// --- settings (worker-readable whitelist, apps/api staff-core) ---------------

export interface DeskSettings {
  switches: Record<string, boolean>;
  numbers: Record<string, number>;
}

const NO_SETTINGS: DeskSettings = { switches: {}, numbers: {} };

/** Defaults while the server has not answered (the plan's start numbers). */
const DEFAULT_NUMBERS: Record<string, number> = {
  'staff.lease.ttl_verification_min': 20,
  'staff.lease.ttl_report_min': 10,
  'staff.lease.ttl_appeal_min': 15,
  'staff.lease.ttl_ticket_min': 30,
  'staff.lease.ttl_finance_min': 10,
  'staff.lease.warn_before_sec': 30,
  'staff.lease.capacity': 1,
  'staff.lease.chat_capacity': 3,
  'staff.lease.skips_per_hour': 3,
};

export interface DeskSettingsView {
  /** The first answer is still on its way. */
  loading: boolean;
  on(key: string): boolean;
  num(key: string): number;
}

export function settingsView(s: DeskSettings | undefined, loading: boolean): DeskSettingsView {
  const v = s ?? NO_SETTINGS;
  return {
    loading,
    on: (key) => v.switches[key] === true,
    num: (key) => v.numbers[key] ?? DEFAULT_NUMBERS[key] ?? 0,
  };
}

/** Only an admin of the workspaces asks (everybody else: nothing is on). */
export function useDeskSettings(me: Me | undefined): DeskSettingsView {
  const q = useQuery({
    queryKey: ['desk-settings'],
    enabled: !!me?.workspacesEnabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await deskGet<DeskSettings>('/admin/workspace/desk-settings');
      return r.ok ? r.data : NO_SETTINGS;
    },
  });
  return settingsView(q.data, !!me?.workspacesEnabled && q.isPending);
}

// --- leases, presence, team (T3) ------------------------------------------------

export interface LeaseView {
  kind: string;
  itemId: string;
  takenAt: string;
  leasedUntil: string;
  attempt: number;
}

export interface MyLeases {
  status: 'online' | 'away' | 'offline' | string;
  leases: LeaseView[];
  capacity: { chat: number; other: number };
  wrapUpSec: number;
}

export type NextOutcome =
  | { status: 'leased'; lease: LeaseView }
  | { status: 'busy'; held: LeaseView[] }
  | { status: 'empty' }
  | { status: 'wrap_up'; retryAfterSec: number }
  | { status: 'away' | 'offline' | 'off' };

export const MY_LEASES_KEY = ['desk-my-leases'] as const;

export function useMyLeases(enabled: boolean) {
  return useQuery({
    queryKey: MY_LEASES_KEY,
    enabled,
    staleTime: 15_000,
    queryFn: () => deskGet<MyLeases>('/admin/desk/lease/me'),
  });
}

export interface TeamTile {
  adminId: string;
  name: string | null;
  role: string;
  status: 'online' | 'away' | 'offline' | string;
  items: { kind: string; itemId: string; takenAt: string | null; leasedUntil: string | null; heldMinutes: number }[];
  doneToday: number;
}

export function useDeskTeam(enabled: boolean) {
  return useQuery({
    queryKey: ['desk-team'],
    enabled,
    staleTime: 30_000,
    queryFn: () => deskGet<{ tiles: TeamTile[] }>('/admin/desk/lease/team'),
  });
}

// --- my rating (T5) and decisions (staff-core), my pay (T7) ----------------------

export interface MyProgress {
  rating: number | null;
  status: string;
  decisions: number | null;
  rankPct: number | null;
  flags: string[];
  accuracy: number | null;
  clean: number | null;
  usersVerdict: number | null;
  speed: number | null;
  /** Kinds of the open suggestions about me (the desk shows only the soft ones). */
  suggestionKinds: string[];
  /** Weekly points of the last weeks if the server sends a trend. */
  trend: number[];
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Reads whatever the rating API sends, keeping only the known fields. */
export function normalizeProgress(raw: unknown): MyProgress {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const evidence = (r.evidence && typeof r.evidence === 'object' ? r.evidence : {}) as Record<string, unknown>;
  const kinds = [...(Array.isArray(r.openSuggestions) ? r.openSuggestions : []), ...(Array.isArray(r.suggestions) ? r.suggestions : [])]
    .map((s) => (s && typeof s === 'object' ? ((s as Record<string, unknown>).kind as unknown) : null))
    .filter((k): k is string => typeof k === 'string');
  const trendRaw = Array.isArray(evidence.trend) ? evidence.trend : Array.isArray(r.trend) ? r.trend : [];
  return {
    rating: num(r.rating),
    status: typeof r.status === 'string' ? r.status : 'low_data',
    decisions: num(r.decisions),
    rankPct: num(r.rankPct),
    flags: Array.isArray(r.flags) ? r.flags.filter((f): f is string => typeof f === 'string') : [],
    accuracy: num(r.accuracy),
    clean: num(r.clean),
    usersVerdict: num(r.usersVerdict),
    speed: num(r.speed),
    suggestionKinds: [...new Set(kinds)],
    trend: trendRaw
      .map((p) => (typeof p === 'number' ? p : p && typeof p === 'object' ? num((p as Record<string, unknown>).rating ?? (p as Record<string, unknown>).value) : null))
      .filter((p): p is number => p != null),
  };
}

export function useMyProgress(enabled: boolean) {
  return useQuery({
    queryKey: ['desk-my-progress'],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<DeskResult<MyProgress>> => {
      const r = await deskGet<unknown>('/admin/staff/me/progress');
      return r.ok ? { ok: true, data: normalizeProgress(r.data) } : r;
    },
  });
}

export interface DecisionDay {
  day: string;
  decided: number;
  avgHandleSec: number;
  reopened: number;
  lateSla: number;
  skips: number;
}

export function useMyDecisions(enabled: boolean) {
  return useQuery({
    queryKey: ['desk-my-decisions'],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: () => deskGet<{ days: DecisionDay[]; decidedTotal: number }>('/admin/workspace/desk-decisions', { days: 30 }),
  });
}

export interface PieceworkMine {
  period: string;
  scope: 'owner' | 'head' | 'self' | string;
  currency: string;
  totals: { people: number; units: number; heldUnits: number; amountCents: number };
  people: {
    adminId: string;
    name: string;
    units: number;
    heldUnits: number;
    amountCents: number | null;
    days: { day: string; units: number; heldUnits: number; qualityMult: number; amountCents: number; status: string; noRating: boolean }[];
  }[];
}

export function useMyPiecework(enabled: boolean) {
  return useQuery({
    queryKey: ['desk-my-piecework'],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: () => deskGet<PieceworkMine>('/admin/workspace/piecework'),
  });
}

// --- appeal against the head (T6) ----------------------------------------------------

export interface MyAppeal {
  id: string;
  number: number;
  status: 'received' | 'in_review' | 'decided' | string;
  createdAt: string;
  anonymous: boolean;
  ackAt: string | null;
}

export function useMyAppeals(enabled: boolean) {
  return useQuery({
    queryKey: ['desk-my-appeals'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => deskGet<MyAppeal[]>('/admin/workspace/appeals/mine'),
  });
}
