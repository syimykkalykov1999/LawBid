import { MutationObserver, type QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Owner list row 179 (detective R3A-6): settings must not overwrite each
 * other and must not stay old for 15 minutes.
 * - every one-key save sends the version this tab saw (lib/config-save.ts);
 * - a 409 STALE_VERSION puts the fresh row on screen at once;
 * - a save on any settings screen (Настройки, Функции, a section's own
 *   «Настройки») invalidates every settings screen, in this tab and in the
 *   other tabs (lib/query-client.ts + lib/api/client.ts).
 */
vi.mock('@/lib/api/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api/client')>();
  const { default: createClient } = await import('openapi-fetch');
  // jsdom's Request wants absolute URLs; the browser resolves '/' itself.
  const api = createClient({ baseUrl: 'http://localhost', fetch: (r: Request) => globalThis.fetch(r) });
  api.use(real.toProxy);
  return { ...real, api };
});

import { api, takeSettingsWrite } from '@/lib/api/client';
import { saveConfig, saveFlag } from '@/lib/config-save';
import { connectSettingsTabs, isSettingsKey, makeQueryClient, SETTINGS_KEYS } from '@/lib/query-client';

type Sent = { method: string; path: string; body: unknown };
let sent: Sent[] = [];
let reply: (req: Request) => Response = () => Response.json({ data: {} });

beforeEach(() => {
  takeSettingsWrite();
  sent = [];
  reply = () => Response.json({ data: {} });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (r: Request) => {
      const text = r.method === 'GET' ? '' : await r.clone().text();
      sent.push({ method: r.method, path: new URL(r.url).pathname, body: text ? JSON.parse(text) : null });
      return reply(r);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const CONFIG = [
  { key: 'feed.reco_scan_max', value: 1000, stored: true, updatedAt: '2026-11-15T10:00:00.000Z' },
  { key: 'text.max_post', value: 500, stored: false, updatedAt: null },
];
const FLAGS = [{ key: 'stars', enabled: true, updatedAt: '2026-11-15T09:00:00.000Z' }];

function seed(qc: QueryClient) {
  qc.setQueryData(['config'], CONFIG);
  qc.setQueryData(['flags'], FLAGS);
  qc.setQueryData(['support-settings'], { slaHours: 4 });
  qc.setQueryData(['users', { page: 1 }], []);
}

async function runMutation(qc: QueryClient, fn: () => Promise<unknown>) {
  const m = new MutationObserver(qc, { mutationFn: fn });
  await m.mutate().catch(() => undefined);
  // The invalidation runs one tick after the mutation settles.
  await new Promise((r) => setTimeout(r, 5));
}

describe('one-key saves carry the version this tab saw (row 179)', () => {
  it('config: expectedUpdatedAt = the row the tab shows; null for a default', async () => {
    const qc = makeQueryClient();
    seed(qc);
    await saveConfig(qc, 'feed.reco_scan_max', 900);
    await saveConfig(qc, 'text.max_post', 400);
    expect(sent[0]).toMatchObject({
      method: 'PUT',
      path: '/api/proxy/config/feed.reco_scan_max',
      body: { value: 900, expectedUpdatedAt: '2026-11-15T10:00:00.000Z' },
    });
    expect(sent[1]!.body).toEqual({ value: 400, expectedUpdatedAt: null });
  });

  it('config: a key this tab never loaded is sent without a check', async () => {
    const qc = makeQueryClient();
    await saveConfig(qc, 'ai.assistant_mode', 'auto');
    expect(sent[0]!.body).toEqual({ value: 'auto' });
  });

  it('flags: expectedUpdatedAt, except for the admin’s own «Отменить»', async () => {
    const qc = makeQueryClient();
    seed(qc);
    await saveFlag(qc, 'stars', false);
    await saveFlag(qc, 'stars', true, { check: false });
    expect(sent[0]!.body).toEqual({ enabled: false, expectedUpdatedAt: '2026-11-15T09:00:00.000Z' });
    expect(sent[1]!.body).toEqual({ enabled: true });
  });

  it('409 STALE_VERSION: the fresh row from the server is on screen at once', async () => {
    const qc = makeQueryClient();
    seed(qc);
    reply = () =>
      Response.json(
        {
          error: {
            code: 'STALE_VERSION',
            message: 'changed',
            details: {
              currentUpdatedAt: '2026-11-15T10:05:00.000Z',
              current: { key: 'feed.reco_scan_max', value: 800, stored: true, updatedAt: '2026-11-15T10:05:00.000Z' },
            },
          },
        },
        { status: 409 },
      );
    await expect(saveConfig(qc, 'feed.reco_scan_max', 900)).rejects.toMatchObject({ code: 'STALE_VERSION' });
    const row = qc.getQueryData<typeof CONFIG>(['config'])!.find((e) => e.key === 'feed.reco_scan_max');
    expect(row).toMatchObject({ value: 800, updatedAt: '2026-11-15T10:05:00.000Z' });
    // The next save goes on top of the fresh version.
    reply = () => Response.json({ data: { key: 'feed.reco_scan_max', value: 900, updatedAt: '2026-11-15T10:06:00.000Z' } });
    await saveConfig(qc, 'feed.reco_scan_max', 900);
    expect(sent[1]!.body).toMatchObject({ expectedUpdatedAt: '2026-11-15T10:05:00.000Z' });
  });
});

describe('a settings save re-reads every settings screen (row 179)', () => {
  it('the settings keys are config, flags and every section «Настройки»', () => {
    expect(SETTINGS_KEYS).toEqual(expect.arrayContaining(['config', 'flags', 'support-settings', 'fraud-settings']));
    expect(isSettingsKey(['users'])).toBe(false);
  });

  it('a section save (PUT /admin/support/settings) invalidates Настройки and Функции too', async () => {
    const qc = makeQueryClient();
    seed(qc);
    await runMutation(qc, () => api.PUT('/admin/support/settings' as never, { body: { slaHours: 2 } } as never));
    expect(qc.getQueryState(['config'])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(['flags'])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(['support-settings'])?.isInvalidated).toBe(true);
    // Lists are not settings: untouched.
    expect(qc.getQueryState(['users', { page: 1 }])?.isInvalidated).toBe(false);
  });

  it('a 409 «изменено другим» also re-reads them', async () => {
    const qc = makeQueryClient();
    seed(qc);
    reply = () => Response.json({ error: { code: 'STALE_VERSION', message: 'x' } }, { status: 409 });
    await runMutation(qc, () => saveFlag(qc, 'stars', false));
    expect(qc.getQueryState(['config'])?.isInvalidated).toBe(true);
  });

  it('a non-settings write does not', async () => {
    const qc = makeQueryClient();
    seed(qc);
    await runMutation(qc, () => api.POST('/admin/users/x/ban' as never, { body: {} } as never));
    expect(qc.getQueryState(['config'])?.isInvalidated).toBe(false);
  });

  it('another tab of this browser hears the save (BroadcastChannel)', async () => {
    const posted: unknown[] = [];
    class FakeChannel {
      onmessage: ((e: MessageEvent) => void) | null = null;
      constructor(readonly name: string) {}
      postMessage(m: unknown) {
        posted.push([this.name, m]);
      }
      close() {}
    }
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    const qc = makeQueryClient();
    seed(qc);
    await runMutation(qc, () => api.PUT('/admin/stars/settings' as never, { body: {} } as never));
    expect(posted).toEqual([['lawbid-admin-settings', 'saved']]);
  });

  it('this tab re-reads its settings when another tab announces a save', async () => {
    const opened: { onmessage: ((e: MessageEvent) => void) | null }[] = [];
    class FakeChannel {
      onmessage: ((e: MessageEvent) => void) | null = null;
      constructor() {
        opened.push(this);
      }
      postMessage() {}
      close() {}
    }
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    const qc = makeQueryClient();
    seed(qc);
    const stop = connectSettingsTabs(qc);
    opened[0]!.onmessage?.(new MessageEvent('message', { data: 'saved' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(qc.getQueryState(['config'])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(['support-settings'])?.isInvalidated).toBe(true);
    stop();
  });
});
