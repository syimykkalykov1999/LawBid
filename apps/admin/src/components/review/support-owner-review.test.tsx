import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let search = '';
let role = 'support';
let switches: Record<string, boolean> = {};
const push = vi.fn();
const GET = vi.fn();
const POST = vi.fn();
const PATCH = vi.fn();
const deskPost = vi.fn();
const staffGet = vi.fn();
const staffPost = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/support/review',
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...(rest as Record<string, unknown>)}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/hooks', () => ({ useMe: () => ({ data: { id: 'me', role, workspacesEnabled: true } }) }));
vi.mock('@/lib/rbac', async (orig) => ({ ...(await orig<typeof import('@/lib/rbac')>()), can: () => true, canOpen: () => true }));
vi.mock('@/lib/api/client', () => ({
  api: { GET: (...a: unknown[]) => GET(...a), POST: (...a: unknown[]) => POST(...a), PATCH: (...a: unknown[]) => PATCH(...a) },
  ApiError: class extends Error {
    constructor(readonly status: number) {
      super('x');
    }
  },
  toProxy: { onRequest: () => undefined },
  errorText: String,
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock('@/components/support/message-bubble', () => ({ MessageBubble: ({ m }: { m: { body: string } }) => <p>{m.body}</p> }));
vi.mock('@/components/support/user-summary-card', () => ({ UserSummaryCard: () => null }));
vi.mock('@/lib/desk-data', async (orig) => {
  const real = await orig<typeof import('@/lib/desk-data')>();
  return {
    ...real,
    useDeskSettings: () => real.settingsView({ switches, numbers: {} }, false),
    useMyLeases: () => ({ data: undefined, isPending: false }),
    deskPost: (...a: unknown[]) => deskPost(...a),
  };
});
vi.mock('@/lib/staff-data', async (orig) => ({
  ...(await orig<typeof import('@/lib/staff-data')>()),
  staffGet: (...a: unknown[]) => staffGet(...a),
  staffPost: (...a: unknown[]) => staffPost(...a),
}));

import { OwnerReview } from './owner-review';
import { SupportReview } from './support-review';

function show(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const ticket = (id: string, subject: string) => ({
  id,
  subject,
  category: 'account',
  status: 'open',
  priority: 'normal',
  slaDueAt: null,
  slaBreached: false,
  createdAt: '2026-10-27T10:00:00Z',
  lastMessageAt: '2026-10-27T10:00:00Z',
  unreadByUser: false,
  assigneeId: null,
  messages: [{ id: `${id}-m1`, body: `вопрос ${subject}` }],
  userSummary: { uiLanguage: 'ru' },
  clientContext: null,
});
const TICKETS: Record<string, ReturnType<typeof ticket>> = { t1: ticket('t1', 'Не приходит код'), t2: ticket('t2', 'Оплата'), t3: ticket('t3', 'Удалить аккаунт') };

function supportApi() {
  GET.mockImplementation(async (path: string, init?: { params?: { path?: { id?: string } } }) => {
    if (path === '/admin/support/tickets') return { data: { data: Object.values(TICKETS).map((t) => ({ id: t.id, assigneeId: null })) } };
    if (path === '/admin/support/tickets/{id}') return { data: { data: TICKETS[init!.params!.path!.id!] } };
    if (path === '/admin/support/macros') return { data: { data: [] } };
    if (path === '/admin/support/agents') return { data: { data: [{ adminId: 'a2', name: 'Ольга', onShift: true, maxOpen: 5, openTickets: 1 }] } };
    throw new Error(`unexpected GET ${path}`);
  });
  // The old «Следующее обращение» has nothing more: the list decides.
  POST.mockImplementation(async (path: string) => (path === '/admin/support/tickets/next' ? { data: { data: { ticket: null } } } : { data: { data: {} } }));
  PATCH.mockResolvedValue({ data: { data: {} } });
}

const calls = (fn: ReturnType<typeof vi.fn>, path: string, id?: string) =>
  fn.mock.calls.filter(([p, init]) => p === path && (!id || JSON.stringify(init).includes(`"${id}"`))).length;

beforeEach(() => {
  search = 'id=t1';
  role = 'support';
  switches = {};
  for (const f of [push, GET, POST, PATCH, deskPost, staffGet, staffPost]) f.mockReset();
  window.history.replaceState(null, '', '/support/review?id=t1');
  supportApi();
});
afterEach(cleanup);

describe('support review screen', () => {
  it('Ctrl/⌘+Enter replies and opens the next ticket in place (no navigation, no early read)', async () => {
    show(<SupportReview />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Не приходит код' })).toBeTruthy();
    // opening a ticket marks it read: the next one is NOT loaded in advance
    expect(calls(GET, '/admin/support/tickets/{id}', 't2')).toBe(0);
    const box = screen.getByPlaceholderText('Напишите ответ…');
    fireEvent.change(box, { target: { value: 'Проверьте папку «Спам»' } });
    await act(async () => {
      fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Оплата' })).toBeTruthy();
    expect(calls(POST, '/admin/support/tickets/{id}/messages', 't1')).toBe(1);
    expect(push).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?id=t2');
  });

  it('a note for the team keeps the ticket on screen', async () => {
    show(<SupportReview />);
    await screen.findByRole('heading', { level: 1, name: 'Не приходит код' });
    fireEvent.click(screen.getByRole('tab', { name: /Заметка для команды/ }));
    const box = screen.getByPlaceholderText('Заметка видна только команде…');
    fireEvent.change(box, { target: { value: 'проверить логи' } });
    await act(async () => {
      fireEvent.keyDown(box, { key: 'Enter', metaKey: true });
    });
    await waitFor(() => expect(calls(POST, '/admin/support/tickets/{id}/messages', 't1')).toBe(1));
    expect(screen.getByRole('heading', { level: 1, name: 'Не приходит код' })).toBeTruthy();
  });

  it('«Закрыть и дальше» resolves; «Передать и дальше» hands it to a colleague; buttons on one row', async () => {
    show(<SupportReview />);
    await screen.findByRole('heading', { level: 1, name: 'Не приходит код' });
    const row = screen.getByTestId('review-action-row');
    expect(row.className).toContain('xl:flex-nowrap');
    expect(Array.from(row.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual([
      'ПропуститьN',
      'Передать и дальше',
      'Закрыть и дальше',
      'Ответить и дальше',
    ]);
    // nothing typed yet: the bar's reply waits for text
    expect((screen.getByRole('button', { name: 'Ответить и дальше' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть и дальше' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Оплата' })).toBeTruthy();
    expect(PATCH.mock.calls[0][1]).toMatchObject({ params: { path: { id: 't1' } }, body: { status: 'resolved' } });

    fireEvent.click(screen.getByRole('button', { name: 'Передать и дальше' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ольга' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Удалить аккаунт' })).toBeTruthy();
    expect(PATCH.mock.calls[1][1]).toMatchObject({ params: { path: { id: 't2' } }, body: { assigneeId: 'a2' } });
  });

  it('the lease engine on: a reply ends the lease and the engine hands the next ticket', async () => {
    switches = { 'staff.lease_enabled': true, 'staff.lease_support_enabled': true };
    deskPost.mockImplementation(async (path: string) =>
      path === '/admin/desk/lease/next'
        ? { ok: true, data: { status: 'leased', lease: { kind: 'support_ticket', itemId: 't3', expiresAt: new Date(Date.now() + 600_000).toISOString() } } }
        : { ok: true, data: {} },
    );
    show(<SupportReview />);
    await screen.findByRole('heading', { level: 1, name: 'Не приходит код' });
    const box = screen.getByPlaceholderText('Напишите ответ…');
    fireEvent.change(box, { target: { value: 'Готово' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ответить и дальше' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Удалить аккаунт' })).toBeTruthy();
    expect(deskPost.mock.calls.map((c) => c[0])).toEqual(['/admin/desk/lease/support_ticket/t1/done', '/admin/desk/lease/next']);
    expect(deskPost.mock.calls[0][1]).toEqual({ outcome: 'replied' });
  });
});

describe('owner review screen', () => {
  const rec = { advice: 'reward', adviceLabel: 'Премировать', actionLabel: 'Премировать', headline: 'Лучший месяц', lines: ['200 решений'] };
  beforeEach(() => {
    role = 'super_admin';
    search = '';
    window.history.replaceState(null, '', '/today/review');
    staffGet.mockImplementation(async (path: string) => {
      if (path === '/admin/appeals/flags') return { ok: true, data: { items: [{ id: 'f1', appealId: 'ap0', appealNumber: 7, subject: { adminId: 'w1', label: 'Иван', anonymous: false }, state: 'open', windowUntil: '', holdUntil: null, holdActive: false, createdAt: '2026-10-27T10:00:00Z' }] } };
      if (path === '/admin/appeals') return { ok: true, data: { items: [{ id: 'ap1', number: 12, kind: 'unfair', excerpt: 'кратко', head: { adminId: 'h1', name: 'Пётр' }, author: { adminId: null, label: 'Аноним', anonymous: true }, status: 'new', ownerDecision: 'none', redFlag: false, createdAt: '2026-10-26T10:00:00Z', decidedAt: null }], nextCursor: null } };
      if (path === '/admin/appeals/ap1') return { ok: true, data: { id: 'ap1', number: 12, kind: 'unfair', excerpt: 'кратко', text: 'Полный текст жалобы', head: { adminId: 'h1', name: 'Пётр' }, author: { adminId: null, label: 'Аноним', anonymous: true }, status: 'new', ownerDecision: 'none', redFlag: false, createdAt: '2026-10-26T10:00:00Z', decidedAt: null, ownerNote: null, revealCount: 0, flags: [] } };
      if (path === '/admin/staff/today') return { ok: true, data: { suggestions: { open: 1, items: [{ id: 's1', adminId: 'w2', name: 'Мария', workspace: 'mass', kind: 'reward', createdAt: '', recommendation: rec }] } } };
      throw new Error(`unexpected staffGet ${path}`);
    });
    staffPost.mockResolvedValue({});
  });

  it('red flag → complaint against a head → suggestion, each decided in place', async () => {
    show(<OwnerReview />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Красная пометка' })).toBeTruthy();
    expect(screen.getByTestId('owner-review-queues').querySelectorAll('a')).toHaveLength(3);
    await act(async () => {
      fireEvent.keyDown(window, { key: 'a', code: 'KeyA' });
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Жалоба №12 · на Пётр' })).toBeTruthy();
    expect(staffPost.mock.calls[0][0]).toBe('/admin/appeals/flags/f1/reverse');
    expect(await screen.findByText('Полный текст жалобы')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/Заметка к решению/), { target: { value: 'разобрался' } });
    fireEvent.click(screen.getByRole('button', { name: /Ничего не делать и дальше/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Премировать: Мария' })).toBeTruthy();
    expect(staffPost.mock.calls[1]).toEqual(['/admin/appeals/ap1/decide', { decision: 'nothing', note: 'разобрался' }]);
    // the note belongs to one decision only
    expect((screen.getByPlaceholderText(/Заметка к решению/) as HTMLTextAreaElement).value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: /Не сейчас и дальше/ }));
    expect(await screen.findByText(/Решать больше нечего/)).toBeTruthy();
    expect(staffPost.mock.calls[2]).toEqual(['/admin/staff/suggestions/s1/decide', { action: 'dismiss', note: undefined }]);
    expect(push).not.toHaveBeenCalled();
  });
});
