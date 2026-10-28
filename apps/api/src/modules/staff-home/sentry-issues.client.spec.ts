import type { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { SecretsService } from '../../common/secrets/secrets.service';
import {
  SENTRY_FRESH_SEC,
  SENTRY_SUMMARY_KEY,
  SentryIssuesClient,
} from './sentry-issues.client';

const NOW = new Date('2026-10-27T10:00:00Z');

/** A Redis-less AdminSummaryService: one stored value, same TTL rule. */
function fakeSummary(freshSec = SENTRY_FRESH_SEC) {
  let stored: { data: unknown; computedAt: string } | null = null;
  let computes = 0;
  const now = () => NOW.getTime();
  const svc = {
    async get(_k: string, compute: () => Promise<unknown>, fresh: number) {
      expect(fresh).toBe(freshSec);
      if (stored) return stored;
      computes += 1;
      stored = {
        data: await compute(),
        computedAt: new Date(now()).toISOString(),
      };
      return stored;
    },
    async refresh(_k: string, compute: () => Promise<unknown>) {
      computes += 1;
      stored = {
        data: await compute(),
        computedAt: new Date(now()).toISOString(),
      };
      return stored;
    },
    peek() {
      return Promise.resolve(stored);
    },
  };
  return {
    svc: svc as unknown as AdminSummaryService,
    computes: () => computes,
    stored: () => stored,
  };
}

const settings = (on: boolean) =>
  ({
    boolean: jest.fn().mockResolvedValue(on),
  }) as unknown as AppSettingsService;

const secrets = (fields: Record<string, string> | null) =>
  ({
    get: jest.fn().mockResolvedValue(fields ? { fields } : null),
  }) as unknown as SecretsService;

const CREDS = {
  orgSlug: 'lawbid',
  project: 'api',
  issuesToken: 'sntrys_' + 'x'.repeat(30),
};

const issue = (id: string, firstSeen: string) => ({
  id,
  title: `Error ${id}`,
  count: '3',
  userCount: 2,
  firstSeen,
  lastSeen: NOW.toISOString(),
  permalink: `https://sentry.io/organizations/lawbid/issues/${id}/`,
});

function fetchOk(body: unknown, link = '') {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(link ? { link } : {}),
    json: () => Promise.resolve(body),
  });
}

describe('SentryIssuesClient', () => {
  it('switch off: no request, no cache, state off', async () => {
    const sum = fakeSummary();
    const c = new SentryIssuesClient(secrets(CREDS), settings(false), sum.svc);
    c.fetchImpl = jest.fn();
    expect(await c.read(NOW)).toMatchObject({ state: 'off', unresolved: 0 });
    expect(c.fetchImpl).not.toHaveBeenCalled();
    expect(sum.computes()).toBe(0);
  });

  it('switch on, no keys saved: unconfigured, no request', async () => {
    const sum = fakeSummary();
    const c = new SentryIssuesClient(secrets(null), settings(true), sum.svc);
    c.fetchImpl = jest.fn();
    expect((await c.read(NOW)).state).toBe('unconfigured');
    expect(c.fetchImpl).not.toHaveBeenCalled();
  });

  it('one request fills the cache; the next reads cost nothing', async () => {
    const sum = fakeSummary();
    const c = new SentryIssuesClient(secrets(CREDS), settings(true), sum.svc);
    const f = fetchOk(
      [
        issue('1', '2026-10-27T09:00:00Z'),
        issue('2', '2026-10-20T09:00:00Z'),
        issue('3', '2026-10-26T12:00:00Z'),
      ],
      '<x>; rel="next"; results="true"',
    );
    c.fetchImpl = f;
    const first = await c.read(NOW);
    await c.read(NOW);
    await c.read(NOW);
    expect(f).toHaveBeenCalledTimes(1);
    expect(sum.computes()).toBe(1);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://sentry.io/api/0/projects/lawbid/api/issues/?query=is%3Aunresolved&sort=date&limit=100&statsPeriod=24h',
    );
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${CREDS.issuesToken}`,
    );
    expect(first).toMatchObject({
      state: 'ok',
      unresolved: 3,
      unresolvedAtLeast: true,
      newCount: 2,
      url: 'https://sentry.io/organizations/lawbid/issues/?project=&query=is%3Aunresolved',
      error: null,
    });
    expect(first.issues[0]).toEqual({
      id: '1',
      title: 'Error 1',
      count: 3,
      users: 2,
      firstSeen: '2026-10-27T09:00:00Z',
      lastSeen: NOW.toISOString(),
      permalink: 'https://sentry.io/organizations/lawbid/issues/1/',
    });
  });

  it('a Sentry error is stored as state=error (no retry storm) and worded', async () => {
    const sum = fakeSummary();
    const c = new SentryIssuesClient(
      secrets({ ...CREDS, host: 'https://sentry.example.com/' }),
      settings(true),
      sum.svc,
    );
    c.fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: () => Promise.resolve({}),
    });
    const r = await c.read(NOW);
    expect(r.state).toBe('error');
    expect(r.error).toContain('401');
    expect(r.url).toContain('https://sentry.example.com/organizations/');
    await c.read(NOW);
    expect(c.fetchImpl).toHaveBeenCalledTimes(1);
    expect((c.fetchImpl as jest.Mock).mock.calls[0][0]).toBe(
      'https://sentry.example.com/api/0/projects/lawbid/api/issues/?query=is%3Aunresolved&sort=date&limit=100&statsPeriod=24h',
    );
  });

  it('a network failure is also an error summary, not a throw', async () => {
    const sum = fakeSummary();
    const c = new SentryIssuesClient(secrets(CREDS), settings(true), sum.svc);
    c.fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    expect(await c.read(NOW)).toMatchObject({
      state: 'error',
      error: 'ECONNRESET',
    });
  });

  it('resolve: PUT status=resolved, then one recount', async () => {
    const sum = fakeSummary();
    const c = new SentryIssuesClient(secrets(CREDS), settings(true), sum.svc);
    const f = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve([]),
      });
    c.fetchImpl = f;
    const r = await c.resolve('123', NOW);
    expect(f).toHaveBeenCalledTimes(2);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://sentry.io/api/0/issues/123/');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ status: 'resolved' });
    expect(r).toMatchObject({ state: 'ok', unresolved: 0, newCount: 0 });
    expect(sum.stored()).not.toBeNull();
  });

  it('resolve: a refused PUT throws and recounts nothing', async () => {
    const sum = fakeSummary();
    const c = new SentryIssuesClient(secrets(CREDS), settings(true), sum.svc);
    c.fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(c.resolve('5', NOW)).rejects.toThrow('403');
    expect(sum.computes()).toBe(0);
  });

  it('resolve while off does nothing', async () => {
    const sum = fakeSummary();
    const c = new SentryIssuesClient(secrets(CREDS), settings(false), sum.svc);
    c.fetchImpl = jest.fn();
    expect((await c.resolve('5', NOW)).state).toBe('off');
    expect(c.fetchImpl).not.toHaveBeenCalled();
  });

  it('the cache key and TTL are the shared ones (one request per 5 min)', () => {
    expect(SENTRY_SUMMARY_KEY).toBe('staff.today.sentry');
    expect(SENTRY_FRESH_SEC).toBeGreaterThanOrEqual(300);
  });
});
