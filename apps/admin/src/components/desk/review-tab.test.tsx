import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@/lib/hooks';
import type { ReviewMe, ReviewSample } from '@/lib/desk-review';

type Routes = Record<string, unknown>;
let getRoutes: Routes = {};
let postRoutes: Routes = {};
let switches: Record<string, boolean> = {};
let search = '';
const replace = vi.fn();
const deskGet = vi.fn();
const deskPost = vi.fn();
const toast = { success: vi.fn(), error: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/desk/support',
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/lib/hooks', () => ({ useMe: () => ({ data: me }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));
vi.mock('@/lib/desk-data', async (orig) => {
  const real = await orig<typeof import('@/lib/desk-data')>();
  const q = (data: unknown) => ({ data, isPending: false });
  return {
    ...real,
    deskGet: (...a: unknown[]) => deskGet(...a),
    deskPost: (...a: unknown[]) => deskPost(...a),
    useDeskSettings: () => real.settingsView({ switches, numbers: {} }, false),
    useMyLeases: () => q({ ok: false, missing: true }),
    useMyProgress: () => q({ ok: false, missing: true }),
    useMyPiecework: () => q({ ok: false, missing: true }),
    useMyDecisions: () => q({ ok: false, missing: true }),
    useDeskTeam: () => q({ ok: false, missing: true }),
    useMyAppeals: () => q({ ok: false, missing: true }),
  };
});
vi.mock('@/app/(app)/support/page', () => ({ default: () => <div>PAGE support inbox</div> }));
vi.mock('./support-chats-tab', () => ({ SupportChatsTab: () => <div>PAGE chats</div> }));

import { DeskPage } from './desk-page';
import { ReviewTab } from './review-tab';

let me: Me | undefined;

const base = (over: Partial<Me>): Me =>
  ({
    id: 'a',
    email: 'a@x.io',
    role: 'support',
    totpEnabled: true,
    permissions: {},
    canManageAdmins: false,
    workspacesEnabled: true,
    workspace: 'mass',
    ...over,
  }) as Me;

const SAMPLE: ReviewSample = {
  id: 's1',
  decisionKind: 'support_ticket',
  itemId: 'i1',
  stage: 'sample',
  outcome: 'resolve',
  decidedAt: '2026-10-27T10:00:00Z',
  handleSec: 95,
  facts: [
    { key: 'subject', value: 'Не приходит письмо' },
    { key: 'status', value: 'closed' },
  ],
  leasedUntil: '2026-10-27T10:30:00Z',
  worker: null,
};

const SENIOR: ReviewMe = { level: 'senior', canManage: false };
const HEAD: ReviewMe = { level: 'head', canManage: true };

function mount(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const missing = { ok: false, missing: true };

beforeEach(() => {
  me = base({});
  search = '';
  switches = { 'staff.workspaces_enabled': true, 'staff.desk_enabled': true, 'staff.rating_enabled': true };
  getRoutes = { '/admin/workspace/review/current': { ok: true, data: { sample: null } } };
  postRoutes = {};
  deskGet.mockReset().mockImplementation(async (path: string) => getRoutes[path] ?? missing);
  deskPost.mockReset().mockImplementation(async (path: string) => postRoutes[path] ?? missing);
  toast.success.mockReset();
  toast.error.mockReset();
  replace.mockClear();
});
afterEach(cleanup);

describe('the «Перепроверка» tab of the desk', () => {
  const tabs = () => screen.getAllByRole('tab').map((t) => t.textContent?.trim());

  it('shows for who may re-check', async () => {
    getRoutes['/admin/workspace/review/me'] = { ok: true, data: HEAD };
    mount(<DeskPage role="support" />);
    await waitFor(() => expect(tabs()).toContain('Перепроверка'));
    expect(tabs().indexOf('Перепроверка')).toBe(tabs().length - 1);
  });

  it('a plain worker (the server says «not found») never sees it', async () => {
    mount(<DeskPage role="support" />);
    await waitFor(() => expect(deskGet).toHaveBeenCalledWith('/admin/workspace/review/me'));
    expect(tabs()).not.toContain('Перепроверка');
    expect(screen.queryByTestId('review-tab')).toBeNull();
  });

  it('rating switch off: nobody is even asked', async () => {
    switches = { 'staff.workspaces_enabled': true, 'staff.desk_enabled': true };
    getRoutes['/admin/workspace/review/me'] = { ok: true, data: HEAD };
    mount(<DeskPage role="support" />);
    expect(tabs()).not.toContain('Перепроверка');
    expect(deskGet).not.toHaveBeenCalledWith('/admin/workspace/review/me');
  });

  it('?tab=review opens the tab; clicking it changes the address', async () => {
    getRoutes['/admin/workspace/review/me'] = { ok: true, data: SENIOR };
    search = 'tab=review';
    mount(<DeskPage role="support" />);
    expect(await screen.findByTestId('review-tab')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Перепроверка' }));
    expect(replace).toHaveBeenCalledWith('/desk/support?tab=review', { scroll: false });
  });

  it('?tab=review without the right falls back to the first tab', async () => {
    search = 'tab=review';
    mount(<DeskPage role="support" />);
    expect(await screen.findByText('PAGE support inbox')).toBeTruthy();
    expect(screen.queryByTestId('review-tab')).toBeNull();
  });
});

describe('the check', () => {
  it('«Следующая проверка» leases a sample; it is read-only and shows no worker', async () => {
    postRoutes['/admin/workspace/review/next'] = { ok: true, data: { status: 'leased', sample: SAMPLE } };
    mount(<ReviewTab me={SENIOR} />);
    fireEvent.click(await screen.findByRole('button', { name: /Следующая проверка/ }));
    getRoutes['/admin/workspace/review/current'] = { ok: true, data: { sample: SAMPLE } };
    const card = await screen.findByTestId('review-sample');
    expect(within(card).getByText('Обращение в поддержку')).toBeTruthy();
    expect(within(card).getByText('Не приходит письмо')).toBeTruthy();
    expect(within(card).getByText('resolve')).toBeTruthy();
    expect(card.textContent).not.toContain('Работник (видно только владельцу)');
    expect(screen.queryByRole('tab', { name: 'Цифры' })).toBeNull();
  });

  it('nothing to check: says so in plain words', async () => {
    postRoutes['/admin/workspace/review/next'] = { ok: true, data: { status: 'empty', sample: null } };
    mount(<ReviewTab me={SENIOR} />);
    fireEvent.click(await screen.findByRole('button', { name: /Следующая проверка/ }));
    expect(await screen.findByText('Сейчас нечего перепроверять')).toBeTruthy();
  });

  it('«Решение верное» sends «confirmed»', async () => {
    getRoutes['/admin/workspace/review/current'] = { ok: true, data: { sample: SAMPLE } };
    postRoutes['/admin/workspace/review/s1/verdict'] = { ok: true, data: { ok: true, result: 'done' } };
    mount(<ReviewTab me={SENIOR} />);
    fireEvent.click(await screen.findByRole('button', { name: /Решение верное/ }));
    await waitFor(() => expect(deskPost).toHaveBeenCalledWith('/admin/workspace/review/s1/verdict', { verdict: 'confirmed' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Решение подтверждено'));
  });

  it('«Решение неверное» needs a reason before it can be sent', async () => {
    getRoutes['/admin/workspace/review/current'] = { ok: true, data: { sample: SAMPLE } };
    postRoutes['/admin/workspace/review/s1/verdict'] = { ok: true, data: { ok: true, result: 'done' } };
    mount(<ReviewTab me={SENIOR} />);
    fireEvent.click(await screen.findByRole('button', { name: /Решение неверное/ }));
    const send = screen.getByRole('button', { name: 'Отменить решение' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Неверный итог' }));
    fireEvent.click(screen.getByRole('button', { name: 'Пропущен важный признак' }));
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() =>
      expect(deskPost).toHaveBeenCalledWith('/admin/workspace/review/s1/verdict', {
        verdict: 'overturned',
        reasons: ['wrong_outcome', 'missed_signal'],
      }),
    );
  });

  it('«Не могу решить» passes it on without a mark', async () => {
    getRoutes['/admin/workspace/review/current'] = { ok: true, data: { sample: SAMPLE } };
    postRoutes['/admin/workspace/review/s1/verdict'] = { ok: true, data: { ok: true, result: 'returned' } };
    mount(<ReviewTab me={SENIOR} />);
    fireEvent.click(await screen.findByRole('button', { name: /Не могу решить/ }));
    await waitFor(() => expect(deskPost).toHaveBeenCalledWith('/admin/workspace/review/s1/verdict', { verdict: 'unclear' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Передано другому проверяющему'));
  });

  it('a sample that is no longer in my hands is reported, not hidden', async () => {
    getRoutes['/admin/workspace/review/current'] = { ok: true, data: { sample: SAMPLE } };
    mount(<ReviewTab me={SENIOR} />);
    fireEvent.click(await screen.findByRole('button', { name: /Решение верное/ }));
    expect(await screen.findByText('Эта проверка уже не у вас — возьмите следующую')).toBeTruthy();
  });

  it('only the owner sees who decided', async () => {
    getRoutes['/admin/workspace/review/current'] = {
      ok: true,
      data: { sample: { ...SAMPLE, worker: { adminId: 'w', name: 'Анна Лисина' } } },
    };
    mount(<ReviewTab me={{ level: 'owner', canManage: true }} />);
    expect(await screen.findByText('Анна Лисина')).toBeTruthy();
  });

  it('a head can turn a confirmed decision into a golden task', async () => {
    getRoutes['/admin/workspace/review/current'] = { ok: true, data: { sample: SAMPLE } };
    postRoutes['/admin/workspace/review/s1/verdict'] = { ok: true, data: { ok: true, result: 'done' } };
    postRoutes['/admin/workspace/review/golden'] = { ok: true, data: { ok: true, goldenId: 'g1' } };
    mount(<ReviewTab me={HEAD} />);
    fireEvent.click(await screen.findByRole('button', { name: /Решение верное/ }));
    getRoutes['/admin/workspace/review/current'] = { ok: true, data: { sample: null } };
    const offer = await screen.findByTestId('review-golden-offer');
    fireEvent.click(within(offer).getByRole('button', { name: /Сделать эталоном/ }));
    await waitFor(() => expect(deskPost).toHaveBeenCalledWith('/admin/workspace/review/golden', { sampleId: 's1' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Эталонная задача выдана'));
  });
});

describe('head and owner see the numbers', () => {
  it('returned rate per worker', async () => {
    getRoutes['/admin/workspace/review/team'] = {
      ok: true,
      data: {
        snapshotDate: '2026-10-26',
        items: [
          { adminId: 'w1', name: 'Анна Лисина', decisions: 200, returnedRate: 5, sampled: 10, overturned: 2, goldenTotal: 4, goldenFailed: 1 },
          { adminId: 'w2', name: 'Борис', decisions: 0, returnedRate: null, sampled: 0, overturned: 0, goldenTotal: 0, goldenFailed: 0 },
        ],
      },
    };
    mount(<ReviewTab me={HEAD} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Возвраты по людям' }));
    const row = (await screen.findByText('Анна Лисина')).closest('tr') as HTMLElement;
    expect(within(row).getByText('5%')).toBeTruthy();
    expect(within(row).getByText('1 из 4')).toBeTruthy();
    expect(within(screen.getByText('Борис').closest('tr') as HTMLElement).getByText('—')).toBeTruthy();
  });

  it('workspace numbers and reviewer agreement', async () => {
    getRoutes['/admin/workspace/review/stats'] = {
      ok: true,
      data: {
        snapshotDate: '2026-10-26',
        workspaces: [
          { workspace: 'mass', decisions: 1000, sampled: 60, overturned: 9, overturnRate: 15, returnedRate: 5, goldenTotal: 20, goldenFailed: 3, pending: 7 },
        ],
        calibration: [{ decisionKind: 'report', pairs: 10, agreementPct: 90 }],
      },
    };
    mount(<ReviewTab me={HEAD} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Цифры' }));
    const card = await screen.findByTestId('review-numbers');
    expect(within(card).getByText('Массовая работа')).toBeTruthy();
    expect(within(card).getByText('9 (15%)')).toBeTruthy();
    expect(within(card).getByText('3 из 20')).toBeTruthy();
    expect(screen.getByText('90%')).toBeTruthy();
  });

  it('golden tasks with their results', async () => {
    getRoutes['/admin/workspace/review/golden'] = {
      ok: true,
      data: {
        items: [
          { id: 'g1', decisionKind: 'golden_report', state: 'passed', worker: { adminId: 'w1', name: 'Анна Лисина' }, createdAt: '2026-10-26T10:00:00Z', doneAt: '2026-10-26T11:00:00Z' },
          { id: 'g2', decisionKind: 'golden_verification', state: 'failed', worker: { adminId: 'w2', name: 'Борис' }, createdAt: '2026-10-26T10:00:00Z', doneAt: null },
        ],
      },
    };
    mount(<ReviewTab me={HEAD} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Эталонные задачи' }));
    expect(await screen.findByText('верно')).toBeTruthy();
    expect(screen.getByText('неверно')).toBeTruthy();
    expect(screen.getByText('Заявка адвоката')).toBeTruthy();
  });

  it('a senior has no way to the numbers', () => {
    mount(<ReviewTab me={SENIOR} />);
    expect(screen.queryByRole('tab', { name: 'Возвраты по людям' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Эталонные задачи' })).toBeNull();
  });
});
