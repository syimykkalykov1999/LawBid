import { Injectable } from '@nestjs/common';
import { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { SecretsService } from '../../common/secrets/secrets.service';

/** Redis key of the cached Sentry reading (AdminSummaryService prefixes it). */
export const SENTRY_SUMMARY_KEY = 'staff.today.sentry';
/** Budget: at most ONE Sentry request per this many seconds. */
export const SENTRY_FRESH_SEC = 300;
/** «New» = first seen within this window. */
export const SENTRY_NEW_WINDOW_MS = 24 * 3_600_000;
const PAGE = 100;
const TOP = 5;
const TIMEOUT_MS = 8_000;

export type SentryState = 'off' | 'unconfigured' | 'ok' | 'error';

export interface SentryIssue {
  id: string;
  title: string;
  /** Events counted by Sentry. */
  count: number;
  users: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
}

export interface SentrySummary {
  state: SentryState;
  /** Unresolved issues (at least this many when the page was full). */
  unresolved: number;
  unresolvedAtLeast: boolean;
  /** Unresolved issues first seen in the last 24 h. */
  newCount: number;
  /** The newest few, for the «Решено» buttons. */
  issues: SentryIssue[];
  /** The project's issue list in Sentry («Открыть»). */
  url: string | null;
  /** Last error text (state = error). */
  error: string | null;
  computedAt: string;
}

interface Creds {
  host: string;
  org: string;
  project: string;
  authToken: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};

/**
 * Owner 2026-10-27 («Сегодня» as the owner's desk): «Ошибки в приложении:
 * N новых / M нерешённых» from the Sentry Issues API. ONE request (the
 * unresolved list of the project, newest first, one page) every five minutes
 * at most, shared by every admin process through AdminSummaryService; while
 * the switch `today.sentry_enabled` is off or the `sentry` fields orgSlug /
 * project / issuesToken are not saved nothing is called. «Решено» marks one issue resolved (the owner's
 * action, behind the 2FA step-up in the controller) and recounts at once.
 */
@Injectable()
export class SentryIssuesClient {
  /** Replaceable in tests. */
  fetchImpl: typeof fetch = (...a) => fetch(...a);

  constructor(
    private readonly secrets: SecretsService,
    private readonly settings: AppSettingsService,
    private readonly summary: AdminSummaryService,
  ) {}

  private async creds(): Promise<Creds | null> {
    const f = (await this.secrets.get('sentry'))?.fields;
    if (!f?.orgSlug || !f.project || !f.issuesToken) return null;
    return {
      host: (f.host || 'https://sentry.io').replace(/\/+$/, ''),
      org: f.orgSlug,
      project: f.project,
      authToken: f.issuesToken,
    };
  }

  private async state(): Promise<
    { state: 'off' | 'unconfigured' } | { state: 'ok'; creds: Creds }
  > {
    if (!(await this.settings.boolean('today.sentry_enabled'))) {
      return { state: 'off' };
    }
    const creds = await this.creds();
    return creds ? { state: 'ok', creds } : { state: 'unconfigured' };
  }

  /** What «Сегодня» shows: the cached reading (computed once if none). */
  async read(now: Date = new Date()): Promise<SentrySummary> {
    const s = await this.state();
    if (s.state !== 'ok') return empty(s.state, now);
    const hit = await this.summary.get(
      SENTRY_SUMMARY_KEY,
      () => this.load(s.creds, now),
      SENTRY_FRESH_SEC,
    );
    return { ...hit.data, computedAt: hit.computedAt };
  }

  /** Marks one issue resolved, then recounts (two requests, owner-driven). */
  async resolve(
    issueId: string,
    now: Date = new Date(),
  ): Promise<SentrySummary> {
    const s = await this.state();
    if (s.state !== 'ok') return empty(s.state, now);
    const res = await this.call(
      s.creds,
      `/api/0/issues/${encodeURIComponent(issueId)}/`,
      { method: 'PUT', body: JSON.stringify({ status: 'resolved' }) },
    );
    if (!res.ok) {
      throw new Error(`Sentry did not resolve the issue (HTTP ${res.status})`);
    }
    const hit = await this.summary.refresh(SENTRY_SUMMARY_KEY, () =>
      this.load(s.creds, now),
    );
    return { ...hit.data, computedAt: hit.computedAt };
  }

  /** The one request. Errors are stored too (no retry storm): state = error. */
  async load(c: Creds, now: Date = new Date()): Promise<SentrySummary> {
    const url = `${c.host}/organizations/${encodeURIComponent(c.org)}/issues/?project=&query=is%3Aunresolved`;
    try {
      const q = new URLSearchParams({
        query: 'is:unresolved',
        sort: 'date',
        limit: String(PAGE),
        statsPeriod: '24h',
      });
      const res = await this.call(
        c,
        `/api/0/projects/${encodeURIComponent(c.org)}/${encodeURIComponent(c.project)}/issues/?${q}`,
        { method: 'GET' },
      );
      if (!res.ok) {
        throw new Error(
          res.status === 401 || res.status === 403
            ? `Sentry отверг ключ (HTTP ${res.status})`
            : `Sentry ответил HTTP ${res.status}`,
        );
      }
      const body = (await res.json()) as unknown;
      const rows = Array.isArray(body) ? body : [];
      const issues = rows.map((r): SentryIssue => {
        const o = (r ?? {}) as Record<string, unknown>;
        return {
          id: str(o.id),
          title: str(o.title).slice(0, 200),
          count: num(o.count),
          users: num(o.userCount),
          firstSeen: str(o.firstSeen),
          lastSeen: str(o.lastSeen),
          permalink: str(o.permalink),
        };
      });
      const since = now.getTime() - SENTRY_NEW_WINDOW_MS;
      const more = /results="true"/.test(res.headers.get('link') ?? '');
      return {
        state: 'ok',
        unresolved: issues.length,
        unresolvedAtLeast: more,
        newCount: issues.filter((i) => Date.parse(i.firstSeen) >= since).length,
        issues: issues.slice(0, TOP),
        url,
        error: null,
        computedAt: now.toISOString(),
      };
    } catch (e) {
      return {
        ...empty('error', now),
        url,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private call(c: Creds, path: string, init: RequestInit): Promise<Response> {
    return this.fetchImpl(`${c.host}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${c.authToken}`,
        'content-type': 'application/json',
        'user-agent': 'lawbid-admin',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }
}

function empty(state: SentryState, now: Date): SentrySummary {
  return {
    state,
    unresolved: 0,
    unresolvedAtLeast: false,
    newCount: 0,
    issues: [],
    url: null,
    error: null,
    computedAt: now.toISOString(),
  };
}
