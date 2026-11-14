import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LazyMotion, domMax } from 'motion/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';

/**
 * Scout 13.11 batch 1 (row 96): the three URL bugs the scout found, the
 * waiting colour of the verification queue, and the two deletes that now ask.
 */
class NoObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as Record<string, unknown>).IntersectionObserver ??= NoObserver;
(globalThis as Record<string, unknown>).ResizeObserver ??= NoObserver;
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;

const calls = vi.hoisted(() => ({ GET: vi.fn(), DELETE: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
  useParams: () => ({}),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={String(href)}>{children}</a>,
}));
vi.mock('@/lib/hooks', async (orig) => ({
  ...(await orig<typeof import('@/lib/hooks')>()),
  useMe: () => ({ data: { id: 'me', role: 'super_admin', permissions: {}, areas: {} } }),
}));
vi.mock('@/lib/api/client', () => ({
  api: {
    GET: (...a: unknown[]) => calls.GET(...a),
    POST: vi.fn(async () => ({ data: { data: {} } })),
    PUT: vi.fn(),
    PATCH: vi.fn(async () => ({ data: { data: {} } })),
    DELETE: (...a: unknown[]) => calls.DELETE(...a),
  },
  errorText: (e: unknown) => String(e),
  errorDetail: () => undefined,
}));

const page = { data: [], meta: { nextCursor: null } };

function mount(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LazyMotion features={domMax}>
        <ToastProvider>{ui}</ToastProvider>
      </LazyMotion>
    </QueryClientProvider>,
  );
}

/** The `params.query` of every GET to `path`. */
const queriesOf = (path: string) =>
  calls.GET.mock.calls.filter((c) => c[0] === path).map((c) => ((c[1] as { params?: { query?: Record<string, unknown> } })?.params?.query ?? {}));

beforeEach(() => {
  calls.GET.mockImplementation(async (path: string) => {
    if (path === '/admin/config') return { data: { data: [{ key: 'verification.queue_warn_hours', value: 24 }, { key: 'verification.queue_late_hours', value: 48 }] } };
    if (path === '/admin/billing/catalog') return { data: { data: [] } };
    return { data: page };
  });
});
afterEach(() => {
  cleanup();
  calls.GET.mockReset();
  calls.DELETE.mockReset();
  window.history.replaceState(null, '', '/');
});

describe('⌘K «Найти пользователя» → /users?q=…', () => {
  it('the list is searched by q on arrival, and the box shows it', async () => {
    window.history.replaceState(null, '', '/users?q=jane%40example.com&role=attorney');
    const { default: UsersPage } = await import('./(app)/users/page');
    mount(<UsersPage />);
    await waitFor(() => expect(queriesOf('/admin/users').some((q) => q.q === 'jane@example.com' && q.role === 'attorney')).toBe(true));
    expect((screen.getByLabelText('Поиск') as HTMLInputElement).value).toBe('jane@example.com');
  });
});

describe('overview links to «Кейсы»', () => {
  it('?tab=contact-issues opens «Не могу связаться», old ?tab=contact too', async () => {
    const { default: CasesPage } = await import('./(app)/cases/page');
    for (const tab of ['contact-issues', 'contact']) {
      calls.GET.mockClear();
      window.history.replaceState(null, '', `/cases?tab=${tab}`);
      mount(<CasesPage />);
      await waitFor(() => expect(calls.GET.mock.calls.some((c) => c[0] === '/admin/contact-issues')).toBe(true));
      expect(calls.GET.mock.calls.some((c) => c[0] === '/admin/cases')).toBe(false);
      cleanup();
    }
  });

  it('?tab=disputes opens «Споры»', async () => {
    window.history.replaceState(null, '', '/cases?tab=disputes');
    const { default: CasesPage } = await import('./(app)/cases/page');
    mount(<CasesPage />);
    await waitFor(() => expect(calls.GET.mock.calls.some((c) => c[0] === '/admin/case-disputes')).toBe(true));
  });
});

describe('verification queue', () => {
  it('«Назад» from a card: the filter from the address is the filter of the list', async () => {
    window.history.replaceState(null, '', '/verification?status=in_review&stateCode=NY');
    const { default: Queue } = await import('./(app)/verification/page');
    mount(<Queue />);
    await waitFor(() => expect(queriesOf('/admin/verification/requests').some((q) => q.status === 'in_review' && q.stateCode === 'NY')).toBe(true));
    expect((screen.getByLabelText('Штат') as HTMLInputElement).value).toBe('NY');
  });

  it('a tab click writes the address (so «Назад» comes back to it)', async () => {
    window.history.replaceState(null, '', '/verification');
    const { default: Queue } = await import('./(app)/verification/page');
    mount(<Queue />);
    fireEvent.click(await screen.findByRole('tab', { name: /нужна информация/ }));
    await waitFor(() => expect(window.location.search).toBe('?status=needs_more_info'));
  });

  it('waiting time turns amber from 24 h and red from 48 h (settings)', async () => {
    const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
    const row = (id: string, h: number) => ({
      id,
      status: 'submitted',
      stateCodes: ['NY'],
      submittedAt: ago(h),
      reviewerId: null,
      adminNote: null,
      formatReview: false,
      attorney: { id: `a-${id}`, firstName: 'A', lastName: id, username: id },
    });
    calls.GET.mockImplementation(async (path: string) => {
      if (path === '/admin/config') return { data: { data: [{ key: 'verification.queue_warn_hours', value: 24 }, { key: 'verification.queue_late_hours', value: 48 }] } };
      return { data: { data: [row('r1', 2), row('r2', 30), row('r3', 50)], meta: { nextCursor: null } } };
    });
    window.history.replaceState(null, '', '/verification');
    const { default: Queue } = await import('./(app)/verification/page');
    mount(<Queue />);
    await waitFor(() => expect(document.querySelectorAll('[data-wait-tone]').length).toBe(3));
    const tones = [...document.querySelectorAll('[data-wait-tone]')].map((e) => e.getAttribute('data-wait-tone'));
    expect(tones).toEqual(['ok', 'warn', 'late']);
  });
});

describe('deletes ask first (plans, stars gifts)', () => {
  it('«Удалить подарок» opens a confirmation; nothing is deleted until «Удалить»', async () => {
    calls.GET.mockImplementation(async (path: string) => {
      if (path === '/admin/stars/gifts')
        return { data: { data: [{ id: 'g1', title: 'Роза', priceStars: 10, position: 1, status: 'active', sentCount: 0, imageUrl: null }] } };
      return { data: { data: [] } };
    });
    calls.DELETE.mockResolvedValue({ data: {} });
    window.history.replaceState(null, '', '/stars?tab=gifts');
    const { default: Stars } = await import('./(app)/stars/page');
    mount(<Stars />);
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить подарок' }, { timeout: 8000 }));
    expect(await screen.findByText('Удалить подарок «Роза»?')).toBeTruthy();
    expect(calls.DELETE).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(calls.DELETE).toHaveBeenCalledWith('/admin/stars/gifts/{id}', { params: { path: { id: 'g1' } } }));
    expect(screen.getByRole('button', { name: 'Скрыть подарок' })).toBeTruthy();
  }, 20_000);

  it('«Удалить функцию» of a plan opens a confirmation; «Отмена» deletes nothing', async () => {
    calls.GET.mockImplementation(async (path: string) => {
      if (path === '/admin/billing/plans')
        return { data: { data: { plans: [], catalog: [{ key: 'x_feature', custom: true, type: 'boolean', label: { ru: 'Фича', en: 'Feature' }, audiences: ['attorney'] }] } } };
      return { data: { data: { packs: [] } } };
    });
    window.history.replaceState(null, '', '/plans');
    const { default: Plans } = await import('./(app)/plans/page');
    mount(<Plans />);
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить функцию' }, { timeout: 8000 }));
    expect(await screen.findByText('Удалить функцию «Фича»?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByText('Удалить функцию «Фича»?')).toBeNull());
    expect(calls.DELETE).not.toHaveBeenCalled();
  }, 20_000);
});
