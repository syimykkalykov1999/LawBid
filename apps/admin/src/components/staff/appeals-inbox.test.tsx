import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppealDetail, AppealItem, RetaliationFlag } from '@/lib/staff-data';

let list: { ok: true; data: { items: AppealItem[]; nextCursor: null } } | { ok: false; missing: true } = { ok: false, missing: true };
let detail: { ok: true; data: AppealDetail } | { ok: false; missing: true } = { ok: false, missing: true };
let flags: { ok: true; data: { items: RetaliationFlag[] } } | { ok: false; missing: true } = { ok: false, missing: true };
let search = '';
const post = vi.fn();

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search) }));
vi.mock('@/lib/hooks', () => ({ useMe: () => ({ data: { role: 'super_admin', permissions: {} } }) }));
vi.mock('@/lib/api/client', () => ({ api: { GET: vi.fn() }, ApiError: class extends Error {}, toProxy: { onRequest: () => undefined }, errorText: String }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock('@/lib/staff-data', async (orig) => {
  const real = await orig<typeof import('@/lib/staff-data')>();
  return {
    ...real,
    useAppeals: () => ({ data: list, isPending: false, error: null }),
    useAppeal: () => ({ data: detail, isPending: false }),
    useRetaliationFlags: () => ({ data: flags, isPending: false, error: null }),
    staffPost: (...a: unknown[]) => post(...a),
  };
});

import { AppealsInbox } from './appeals-inbox';

const item: AppealItem = {
  id: 'p1',
  number: 7,
  kind: 'pressure',
  excerpt: 'Главный давит на смену…',
  head: { adminId: 'h1', name: 'Олег Главный' },
  author: { adminId: null, label: 'автор обжалования №7', anonymous: true },
  status: 'new',
  ownerDecision: 'none',
  redFlag: false,
  createdAt: '2026-10-26T08:00:00Z',
  decidedAt: null,
};
const full: AppealDetail = { ...item, text: 'Полный текст жалобы.', ownerNote: null, revealCount: 0, flags: [] };

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AppealsInbox />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  post.mockReset();
  search = '';
  list = { ok: false, missing: true };
  detail = { ok: false, missing: true };
  flags = { ok: false, missing: true };
});

describe('«Жалобы на главных»', () => {
  it('route off (404): an explanation, no crash', () => {
    renderPage();
    expect(screen.getByText('Жалобы на главных выключены')).toBeTruthy();
  });

  it('an anonymous author is shown only as a number — never a name', () => {
    list = { ok: true, data: { items: [item], nextCursor: null } };
    renderPage();
    const row = screen.getByTestId('appeal-row');
    expect((row).textContent).toContain('автор обжалования №7');
    expect((row).textContent).toContain('на Олег Главный');
    expect((row).textContent).not.toContain('adminId');
  });

  it('reveal asks the server (which caps and journals it) and then shows the name', async () => {
    list = { ok: true, data: { items: [item], nextCursor: null } };
    detail = { ok: true, data: full };
    post.mockResolvedValue({ name: 'Анна Секрет', revealsLeftToday: 19 });
    renderPage();
    fireEvent.click(screen.getByText('Прочитать и решить'));
    expect(screen.getByText('Полный текст жалобы.')).toBeTruthy();
    expect(screen.queryByText('Анна Секрет')).toBeNull();
    fireEvent.click(screen.getByText('Раскрыть имя'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/appeals/p1/reveal'));
    expect(await screen.findByText('Анна Секрет')).toBeTruthy();
  });

  it('decide sends the choice and the note', async () => {
    list = { ok: true, data: { items: [item], nextCursor: null } };
    detail = { ok: true, data: full };
    post.mockResolvedValue({ followUp: { applied: true, call: 'x' } });
    renderPage();
    fireEvent.click(screen.getByText('Прочитать и решить'));
    fireEvent.change(screen.getByPlaceholderText('Заметка к решению (по желанию)'), { target: { value: 'проверил' } });
    fireEvent.click(screen.getByText('Закончить работу с главным'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/appeals/p1/decide', { decision: 'fire_head', note: 'проверил' }));
  });

  it('a red mark can be reversed or upheld', async () => {
    search = 'tab=flags';
    flags = {
      ok: true,
      data: {
        items: [{ id: 'f1', appealId: 'p1', appealNumber: 7, subject: { adminId: null, label: 'автор обжалования №7', anonymous: true }, state: 'open', windowUntil: '2027-01-01T00:00:00Z', holdUntil: '2026-11-10T00:00:00Z', holdActive: true, createdAt: '2026-10-26T08:00:00Z' }],
      },
    };
    post.mockResolvedValue({});
    renderPage();
    const row = screen.getByTestId('flag-row');
    expect((row).textContent).toContain('автор обжалования №7');
    fireEvent.click(screen.getByText('Вернуть к работе'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/appeals/flags/f1/reverse', { note: undefined }));
  });
});
