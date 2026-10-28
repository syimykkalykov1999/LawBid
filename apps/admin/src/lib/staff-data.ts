'use client';

import { useQuery } from '@tanstack/react-query';
import createClient from 'openapi-fetch';
import { ApiError, toProxy } from '@/lib/api/client';
import type { Me } from '@/lib/hooks';

/**
 * Staff package T10: the data of the owner's cockpit («Сегодня», people, the
 * complaint inbox, piecework rates). Same approach as the desk (desk-data.ts):
 * the pages read the staff APIs by name through an untyped client, and a route
 * that answers «not found» (its switch is off, or the part is not merged yet)
 * shows an empty state instead of an error. Writes are plain calls: the
 * 2FA step-up is asked for by the shared client (StepUpHost) and the call is
 * repeated.
 */
interface LooseClient {
  GET(url: string, init?: { params?: { query?: Record<string, string | number | boolean | undefined> } }): Promise<{ data?: unknown }>;
  POST(url: string, init?: { body?: unknown }): Promise<{ data?: unknown }>;
  PUT(url: string, init?: { body?: unknown }): Promise<{ data?: unknown }>;
  DELETE(url: string): Promise<{ data?: unknown }>;
}

// Built on first use, so importing this file (the menu does) costs nothing.
let cached: LooseClient | null = null;
function loose(): LooseClient {
  if (!cached) {
    const client = createClient<Record<string, never>>({ baseUrl: '/' });
    client.use(toProxy);
    cached = client as unknown as LooseClient;
  }
  return cached;
}

export type StaffResult<T> = { ok: true; data: T } | { ok: false; missing: true };
type Query = Record<string, string | number | boolean | undefined>;

function unwrap<T>(res: { data?: unknown }): T {
  const body = res.data as { data?: T } | undefined;
  return (body?.data ?? body) as T;
}

export function isMissing(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 404 || e.status === 405 || e.status === 501 || e.code === 'FEATURE_DISABLED');
}

/** GET that turns «not found / switched off» into `{ ok: false, missing: true }`. */
export async function staffGet<T>(path: string, query?: Query): Promise<StaffResult<T>> {
  try {
    return { ok: true, data: unwrap<T>(await loose().GET(path, query ? { params: { query } } : undefined)) };
  } catch (e) {
    if (isMissing(e)) return { ok: false, missing: true };
    throw e;
  }
}

export async function staffPost<T>(path: string, body?: unknown): Promise<T> {
  return unwrap<T>(await loose().POST(path, { body: body ?? {} }));
}
export async function staffPut<T>(path: string, body?: unknown): Promise<T> {
  return unwrap<T>(await loose().PUT(path, { body: body ?? {} }));
}
export async function staffDelete<T>(path: string): Promise<T> {
  return unwrap<T>(await loose().DELETE(path));
}

/** The owner of the whole system (the only one who sees the cockpit). */
export const isOwner = (me: Me | undefined): boolean => me?.role === 'super_admin';

// --- switches (owner reads them to hide menu items whose feature is off) -------------

export interface StaffSwitches {
  switches: Record<string, boolean>;
}

export function useStaffSwitches(me: Me | undefined) {
  return useQuery({
    queryKey: ['staff-switches'],
    enabled: isOwner(me),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const r = await staffGet<StaffSwitches>('/admin/staff/settings');
      return r.ok ? (r.data.switches ?? {}) : {};
    },
  });
}

// --- «Сегодня» --------------------------------------------------------------------------

export interface Recommendation {
  advice: 'reward' | 'train' | 'replace' | string;
  adviceLabel: string;
  actionLabel: string;
  headline: string;
  lines: string[];
}

export interface TodayPerson {
  adminId: string;
  name: string;
  workspace: string;
  rating: number | null;
  status: string;
  flags: string[];
  decisions: number;
}

export interface TodaySuggestion {
  id: string;
  adminId: string;
  name: string;
  workspace: string;
  kind: string;
  createdAt: string;
  recommendation: Recommendation;
}

export interface Today {
  computedAt: string;
  decision: { code: string; title: string; text: string; href: string } | null;
  appeals: { open: number; newest: { id: string; number: number; kind: string; status: string; headName: string; createdAt: string }[] } | null;
  flags: { open: number } | null;
  shortlist: { snapshotDate: string | null; worst: TodayPerson[]; best: TodayPerson[] } | null;
  suggestions: { open: number; items: TodaySuggestion[] } | null;
  anomalies: { day: string | null; total: number; items: { adminId: string; name: string; rule: string; ruleLabel: string; score: number }[] } | null;
  piecework: { disputedDays: number } | null;
}

export interface DigestWeek {
  weekStart: string;
  numbers: {
    decisions: number;
    returnedPct: number | null;
    appeals: number;
    worstCount: number;
    bestCount: number;
    worstName: string | null;
    bestName: string | null;
    pieceworkCents: number;
    currency: string;
  };
}

export const TODAY_KEY = ['staff-today'] as const;

/** The ONE staff request of the «Сегодня» page. */
export function useToday(enabled: boolean) {
  return useQuery({
    queryKey: TODAY_KEY,
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: () => staffGet<Today>('/admin/staff/today'),
  });
}

/** Owner 2026-10-27: the «Система» block (server snapshot, 5-minute TTL) + the Sentry line. */
export const TODAY_SYSTEM_KEY = ['staff-today-system'];
export function useTodaySystem<T>(enabled: boolean) {
  return useQuery({
    queryKey: TODAY_SYSTEM_KEY,
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: () => staffGet<T>('/admin/staff/today/system'),
  });
}

export function useDigest(enabled: boolean) {
  return useQuery({
    queryKey: ['staff-digest'],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: () => staffGet<{ items: DigestWeek[] }>('/admin/staff/digest'),
  });
}

// --- people ------------------------------------------------------------------------------

export interface Person extends TodayPerson {
  rankPct: number | null;
  accuracy: number | null;
  clean: number | null;
  usersVerdict: number | null;
  speed: number | null;
  openSuggestions: { id: string; kind: string; createdAt: string }[];
}

export interface PersonDetail extends Person {
  evidence: Record<string, unknown>;
  suggestions: { id: string; kind: string; status: string; createdAt: string }[];
}

export interface PersonHistory {
  adminId: string;
  state: string;
  stateUntil: string | null;
  signals: { kind: string; label: string; count: number }[];
  actions: { id: string; kind: string; source: string; reasonCode: string; reasonNote: string | null; createdAt: string }[];
  recommendations: { suggestionId: string; kind: string; recommendation: Recommendation }[];
}

export interface PeopleFilter {
  workspace?: string;
  status?: string;
  sort?: 'worst' | 'best';
}

export function usePeople(f: PeopleFilter, enabled: boolean) {
  return useQuery({
    queryKey: ['staff-people', f],
    enabled,
    staleTime: 60_000,
    queryFn: () => staffGet<{ snapshotDate: string | null; items: Person[] }>('/admin/staff/people', { ...f, limit: 100 }),
  });
}

export function usePerson(adminId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['staff-person', adminId],
    enabled,
    staleTime: 60_000,
    queryFn: () => staffGet<PersonDetail>(`/admin/staff/people/${adminId}`),
  });
}

export function usePersonHistory(adminId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['staff-person-history', adminId],
    enabled,
    staleTime: 60_000,
    queryFn: () => staffGet<PersonHistory>(`/admin/staff/people/${adminId}/history`),
  });
}

// --- complaints against heads --------------------------------------------------------------

export interface AppealAuthor {
  adminId: string | null;
  label: string;
  anonymous: boolean;
}

export interface AppealItem {
  id: string;
  number: number;
  kind: string;
  excerpt: string;
  head: { adminId: string | null; name: string };
  author: AppealAuthor;
  status: string;
  ownerDecision: string;
  redFlag: boolean;
  createdAt: string;
  decidedAt: string | null;
}

export interface AppealDetail extends AppealItem {
  text: string;
  ownerNote: string | null;
  revealCount: number;
  flags: RetaliationFlag[];
}

export interface RetaliationFlag {
  id: string;
  appealId: string;
  appealNumber: number;
  subject: AppealAuthor;
  state: string;
  windowUntil: string;
  holdUntil: string | null;
  holdActive: boolean;
  createdAt: string;
}

export function useAppeals(state: 'open' | 'decided', enabled: boolean) {
  return useQuery({
    queryKey: ['staff-appeals', state],
    enabled,
    staleTime: 30_000,
    queryFn: () => staffGet<{ items: AppealItem[]; nextCursor: string | null }>('/admin/appeals', { state, limit: 50 }),
  });
}

export function useAppeal(id: string | null) {
  return useQuery({
    queryKey: ['staff-appeal', id],
    enabled: !!id,
    queryFn: () => staffGet<AppealDetail>(`/admin/appeals/${id}`),
  });
}

export function useRetaliationFlags(state: 'open' | 'closed', enabled: boolean) {
  return useQuery({
    queryKey: ['staff-flags', state],
    enabled,
    staleTime: 30_000,
    queryFn: () => staffGet<{ items: RetaliationFlag[] }>('/admin/appeals/flags', { state }),
  });
}

// --- piecework -----------------------------------------------------------------------------

export interface Rate {
  id: string;
  kind: string;
  workspace: string;
  amountCents: number;
  currency: string;
  validFrom: string;
  validTo: string | null;
  boostMult: number | null;
  active: boolean;
}

export interface PieceDay {
  day: string;
  units: number;
  heldUnits: number;
  qualityMult: number;
  amountCents: number;
  status: string;
  noRating: boolean;
}

export interface PieceOverview {
  period: string;
  scope: string;
  currency: string;
  totals: { people: number; units: number; heldUnits: number; amountCents: number };
  people: { adminId: string; name: string; workspace: string; units: number; heldUnits: number; amountCents: number | null; days: PieceDay[] }[];
}

export function useRates(enabled: boolean) {
  return useQuery({
    queryKey: ['staff-rates'],
    enabled,
    staleTime: 60_000,
    queryFn: () => staffGet<Rate[]>('/admin/staff/rates'),
  });
}

export function usePieceOverview(period: string, enabled: boolean) {
  return useQuery({
    queryKey: ['staff-piecework', period],
    enabled,
    staleTime: 60_000,
    queryFn: () => staffGet<PieceOverview>('/admin/staff/piecework', { period }),
  });
}
