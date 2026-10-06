'use client';

import { ApiError } from './client';
import type { components } from './schema';

/**
 * Demo mode («Продвижение») + external partners — docs/ops/demo-world.md, §4, §5.
 * These endpoints are not in packages/api-contract/openapi.json yet, so the
 * DTOs are declared by hand here and the calls go through `proxyJson`
 * (same /api/proxy route and error envelope as the generated client). When
 * the contract is regenerated the hand-written shapes stay compatible.
 */

export type DemoRole = 'client' | 'attorney' | 'assistant';
export const DEMO_ROLES: DemoRole[] = ['client', 'attorney', 'assistant'];

export interface DemoAccountDto {
  id: string;
  role: DemoRole;
  displayName: string;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
}

export interface AdminDemoAccountDto extends DemoAccountDto {
  createdBy: { kind: 'partner' | 'admin'; userId: string | null; name: string };
  label: string | null;
  hasInvite: boolean;
  inviteExpiresAt: string | null;
}

export interface DemoSettingsDto {
  enabled: boolean;
  ttlDays: number;
  maxAccountsPerPartner: number;
  autoClean: boolean;
  uploadQuotaMb: number;
  bannerText: { en: string; ru: string };
}

export interface DemoStatusDto {
  ready: boolean;
  reason: string | null;
  databaseName: string;
  accounts: number;
  lastResetAt: string | null;
  lastSweepAt: string | null;
  migrationsApplied: number;
  migrationsPending: number;
}

export interface DemoAccountsPage {
  items: AdminDemoAccountDto[];
  total: number;
}

export interface CreateDemoAccountBody {
  role: DemoRole;
  label?: string;
  firstName?: string;
  lastName?: string;
  withInvite?: boolean;
}

export interface CreateDemoAccountResult {
  account: AdminDemoAccountDto;
  inviteCode: string | null;
}

export interface DemoInviteResult {
  inviteCode: string;
  inviteExpiresAt: string;
}

/** §5: a blogger without a LawBid account. */
export interface PartnerExternalDto {
  name: string;
  contact: string | null;
}

type GenPartnerRow = components['schemas']['AdminPartnerRowDto'];
type GenPartnerUser = components['schemas']['AdminPartnerUserDto'];

/** AdminPartnerRowDto as extended by §4/§5: `user` may be null for an
 * external partner, `external` describes them, `demoAccess` is the right. */
export type PartnerRowExt = Omit<GenPartnerRow, 'user'> & {
  user: GenPartnerUser | null;
  external?: PartnerExternalDto | null;
  demoAccess?: boolean;
};

export type CreateExternalPartnerBody = Omit<
  components['schemas']['CreatePartnerDto'],
  'userId'
> & {
  externalName: string;
  externalContact?: string | null;
};

const SERVER_ENVELOPE = 'data';

/**
 * JSON call to `/admin/<path>` through the proxy. Unwraps the `{ data }`
 * envelope the API uses when present, throws ApiError like the typed client.
 */
export async function proxyJson<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  init?: { body?: unknown; query?: Record<string, string | number | undefined> },
): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(init?.query ?? {})) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const url = `/api/proxy/${path.replace(/^\/?(admin\/)?/, '')}${qs.size ? `?${qs}` : ''}`;
  const headers = new Headers();
  if (init?.body !== undefined) headers.set('content-type', 'application/json');
  const res = await fetch(url, {
    method,
    headers,
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      const next = encodeURIComponent(window.location.pathname);
      window.location.assign(`/login?next=${next}`);
    }
    const body = (await res.json().catch(() => null)) as {
      error?: { code: string; message: string; details?: Record<string, unknown> };
    } | null;
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'INTERNAL_ERROR',
      body?.error?.message ?? `HTTP ${res.status}`,
      body?.error?.details,
    );
  }
  if (res.status === 204 || res.status === 202) return undefined as T;
  const json = (await res.json().catch(() => null)) as unknown;
  if (json && typeof json === 'object' && SERVER_ENVELOPE in json) {
    return (json as Record<string, unknown>)[SERVER_ENVELOPE] as T;
  }
  return json as T;
}

export const demoApi = {
  settings: () => proxyJson<DemoSettingsDto>('GET', 'demo/settings'),
  saveSettings: (body: DemoSettingsDto) =>
    proxyJson<DemoSettingsDto>('PUT', 'demo/settings', { body }),
  status: () => proxyJson<DemoStatusDto>('GET', 'demo/status'),
  accounts: (query: { q?: string; page?: number; limit?: number }) =>
    proxyJson<DemoAccountsPage | AdminDemoAccountDto[]>('GET', 'demo/accounts', { query }).then(
      (r): DemoAccountsPage =>
        Array.isArray(r) ? { items: r, total: r.length } : r,
    ),
  createAccount: (body: CreateDemoAccountBody) =>
    proxyJson<CreateDemoAccountResult>('POST', 'demo/accounts', { body }),
  newInvite: (id: string) =>
    proxyJson<DemoInviteResult>('POST', `demo/accounts/${encodeURIComponent(id)}/invite`),
  deleteAccount: (id: string) =>
    proxyJson<void>('DELETE', `demo/accounts/${encodeURIComponent(id)}`),
  reset: () => proxyJson<void>('POST', 'demo/reset'),
};

export const partnersExtApi = {
  /** §4: the per-partner demo right. */
  setDemoAccess: (id: string, demoAccess: boolean, reason: string) =>
    proxyJson<PartnerRowExt>('PATCH', `partners/${encodeURIComponent(id)}`, {
      body: { demoAccess, reason },
    }),
  /** §5: a partner without an account. */
  createExternal: (body: CreateExternalPartnerBody) =>
    proxyJson<PartnerRowExt>('POST', 'partners', { body }),
  /** §5: attach a real account later (code and earnings stay). */
  linkUser: (id: string, userId: string, reason?: string) =>
    proxyJson<PartnerRowExt>('POST', `partners/${encodeURIComponent(id)}/link-user`, {
      body: { userId, reason },
    }),
};
