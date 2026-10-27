import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';

type Setting = { key: string; type: string; value: unknown; stored: boolean; defaultValue: unknown };
const calls: { path: string; body?: unknown }[] = [];
let overview: Record<string, unknown>;
let me: { role: string; permissions: Record<string, string>; canManageAdmins: boolean };

vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  errorText: (e: unknown) => String(e),
  errorDetail: (t: string) => t,
  api: {
    GET: vi.fn(async (path: string) => ({ data: { data: path === '/admin/auth/me' ? me : overview } })),
    PUT: vi.fn(async (path: string, init: { params: { path: { key: string } }; body: unknown }) => {
      calls.push({ path: init.params.path.key, body: init.body });
      return { data: { data: {} } };
    }),
    POST: vi.fn(async (path: string) => {
      calls.push({ path });
      return {
        data: {
          data: { started: false, command: 'gh workflow run seo-deploy.yml -f dry_run=true', runsUrl: null, message: 'Выполните команду вручную.' },
        },
      };
    }),
  },
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import PromotionPage from './page';

const sw = (key: string, type: string, value: unknown, stored: boolean): Setting => ({ key, type, value, stored, defaultValue: type === 'boolean' ? false : 0 });
const IDS = [
  'google_search_console', 'bing_webmaster', 'google_business_profile', 'apple_business_connect', 'app_store_connect',
  'play_console', 'lawyer_directories', 'yelp_bbb', 'reddit_quora', 'video_social', 'pr_reviews',
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <PromotionPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls.length = 0;
  me = { role: 'super_admin', permissions: {}, canManageAdmins: false };
  overview = {
    switches: [
      sw('seo.llms_enabled', 'boolean', false, false),
      sw('seo.incremental_enabled', 'boolean', true, true),
      sw('seo.ramp_per_day', 'integer', 0, false),
      sw('seo.quality_gate_enabled', 'boolean', false, true),
    ],
    checklist: IDS.map((id) => ({ id, key: `seo.checklist.${id}`, done: id === 'google_search_console' })),
    status: {
      manifestUrl: 'https://lawbid.dev/seo-manifest.json',
      manifest: { builtAt: '2026-10-27', pages: 12000, indexed: 9000, noindex: 3000, rampPerDay: null, rampDeferred: null },
      error: null,
      checkedAt: '2026-10-27T10:00:00Z',
    },
    dryRun: { canStart: false, command: 'gh workflow run seo-deploy.yml -f dry_run=true' },
  };
});
afterEach(cleanup);

describe('«Продвижение» page', () => {
  it('shows the tumblers in the recommended order with their hints and warnings', async () => {
    renderPage();
    await screen.findByText('Публиковать только изменённое');
    const order = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    const i = order.indexOf('Публиковать только изменённое');
    const l = order.indexOf('Файл llms.txt для ИИ');
    const g = order.indexOf('Закрыть слабые страницы от поиска');
    expect(i).toBeLessThan(l);
    expect(l).toBeLessThan(g);
    expect(screen.getByText(/Сначала сделайте пробный запуск/)).toBeTruthy();
    expect(screen.getByText('В каком порядке включать')).toBeTruthy();
    expect(screen.getAllByText('не трогали').length).toBeGreaterThan(0);
  });

  it('flips a tumbler through the API and turns another off', async () => {
    renderPage();
    const llms = await screen.findByRole('switch', { name: 'Файл llms.txt для ИИ' });
    fireEvent.click(llms);
    await waitFor(() => expect(calls).toContainEqual({ path: 'seo.llms_enabled', body: { value: true } }));
    fireEvent.click(screen.getByRole('switch', { name: 'Публиковать только изменённое' }));
    await waitFor(() => expect(calls).toContainEqual({ path: 'seo.incremental_enabled', body: { value: false } }));
  });

  it('saves the daily limit as a number', async () => {
    renderPage();
    const input = await screen.findByLabelText('Сколько новых страниц в сутки пускать в поиск');
    fireEvent.change(input, { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(calls).toContainEqual({ path: 'seo.ramp_per_day', body: { value: 200 } }));
  });

  it('shows the build status from the manifest, and a calm text when there is none', async () => {
    const { unmount } = renderPage();
    const box = await screen.findByTestId('promotion-status');
    await waitFor(() => expect(within(box).getByText(/^12\s000$/)).toBeTruthy());
    expect(within(box).getByText('27 октября 2026 г.')).toBeTruthy();
    expect(within(box).getByText('Закрыто от поиска (noindex)')).toBeTruthy();
    unmount();
    overview.status = { manifestUrl: 'https://lawbid.dev/seo-manifest.json', manifest: null, error: 'Файла seo-manifest.json на сайте ещё нет.', checkedAt: 'x' };
    renderPage();
    expect(await screen.findByText(/ещё нет/)).toBeTruthy();
  });

  it('lists every channel with English names and ticks one through the API', async () => {
    renderPage();
    for (const name of ['Google Search Console', 'Bing Webmaster Tools + IndexNow', 'Google Business Profile', 'Apple Business Connect', 'App Store Connect', 'Play Console', 'Justia / Avvo / FindLaw', 'Yelp / BBB']) {
      expect(await screen.findByText(name)).toBeTruthy();
    }
    expect(screen.getByText('1 из 11')).toBeTruthy();
    const done = screen.getByRole('checkbox', { name: 'Google Search Console: сделано' });
    expect(done.getAttribute('aria-checked')).toBe('true');
    const bing = screen.getByRole('checkbox', { name: 'Bing Webmaster Tools + IndexNow: сделано' });
    fireEvent.click(bing);
    await waitFor(() => expect(calls).toContainEqual({ path: 'seo.checklist.bing_webmaster', body: { value: true } }));
  });

  it('the dry run without the GitHub App shows the command', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Пробный запуск/ }));
    await waitFor(() => expect(calls).toContainEqual({ path: '/admin/promotion/dry-run' }));
    expect(await screen.findByText('gh workflow run seo-deploy.yml -f dry_run=true')).toBeTruthy();
  });

  it('a view-only admin reads everything and can change nothing', async () => {
    me = { role: 'support', permissions: { promotion: 'view' }, canManageAdmins: false };
    renderPage();
    const sw1 = await screen.findByRole('switch', { name: 'Файл llms.txt для ИИ' });
    await waitFor(() => expect(screen.queryByRole('button', { name: /Пробный запуск/ })).toBeNull());
    expect((sw1 as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Bing Webmaster Tools + IndexNow: сделано' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
