import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Person, PersonDetail, PersonHistory } from '@/lib/staff-data';

let people: unknown = { ok: false, missing: true };
let person: unknown = { ok: false, missing: true };
let history: unknown = { ok: false, missing: true };
const post = vi.fn();
const lastFilter = vi.fn();

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...(rest as Record<string, unknown>)}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/hooks', () => ({ useMe: () => ({ data: { role: 'super_admin', permissions: {} } }) }));
vi.mock('@/lib/api/client', () => ({ api: { GET: vi.fn() }, ApiError: class extends Error {}, toProxy: { onRequest: () => undefined }, errorText: String }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock('@/lib/staff-data', async (orig) => {
  const real = await orig<typeof import('@/lib/staff-data')>();
  return {
    ...real,
    usePeople: (f: unknown) => {
      lastFilter(f);
      return { data: people, isPending: false, error: null };
    },
    usePerson: () => ({ data: person, isPending: false, error: null }),
    usePersonHistory: () => ({ data: history, isPending: false, error: null }),
    staffPost: (...a: unknown[]) => post(...a),
  };
});

import { PeoplePage } from './people-page';
import { PersonCard } from './person-card';

const base: Person = {
  adminId: 'w1',
  name: 'Пётр Иванов',
  workspace: 'mass',
  rating: 52.4,
  status: 'red',
  flags: ['very_low'],
  decisions: 90,
  rankPct: 96,
  accuracy: 50,
  clean: 60,
  usersVerdict: 40,
  speed: 70,
  openSuggestions: [{ id: 's1', kind: 'pull', createdAt: '2026-10-27T01:00:00Z' }],
};
const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
afterEach(() => {
  cleanup();
  post.mockReset();
  lastFilter.mockReset();
  people = person = history = { ok: false, missing: true };
});

describe('«Люди и рейтинг»', () => {
  it('lists people and passes the filters to the API', () => {
    people = { ok: true, data: { snapshotDate: '2026-10-27', items: [base] } };
    wrap(<PeoplePage />);
    expect(screen.getByText('Пётр Иванов').closest('a')?.getAttribute('href')).toBe('/staff/w1');
    expect(screen.getByText('Снять с очереди')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Пространство'), { target: { value: 'finance' } });
    fireEvent.change(screen.getByLabelText('Уровень'), { target: { value: 'red' } });
    expect(lastFilter).toHaveBeenLastCalledWith({ workspace: 'finance', status: 'red', sort: 'worst' });
  });

  it('rating off: an explanation instead of the table', () => {
    wrap(<PeoplePage />);
    expect(screen.getByText('Рейтинг выключен')).toBeTruthy();
  });
});

describe('person card', () => {
  const detailData: PersonDetail = { ...base, evidence: {}, suggestions: [] };
  const hist: PersonHistory = {
    adminId: 'w1',
    state: 'paused',
    stateUntil: '2026-11-03T00:00:00Z',
    signals: [{ kind: 'complaint', label: 'жалоба', count: 3 }],
    actions: [{ id: 'x1', kind: 'warn', source: 'owner', reasonCode: 'very_low', reasonNote: 'первый раз', createdAt: '2026-10-20T10:00:00Z' }],
    recommendations: [
      { suggestionId: 's1', kind: 'pull', recommendation: { advice: 'replace', adviceLabel: 'Заменить', actionLabel: 'Снять с очереди на 7 дней', headline: 'Снять.', lines: ['Рейтинг 52 из 100.'] } },
    ],
  };

  it('shows rating, signals, journal and the buttons under a suggestion', async () => {
    person = { ok: true, data: detailData };
    history = { ok: true, data: hist };
    post.mockResolvedValue({ status: 'applied', done: 'Снят с очереди до 3 ноября.' });
    wrap(<PersonCard adminId="w1" />);
    expect((screen.getByTestId('person-rating')).textContent).toContain('52');
    expect((screen.getByTestId('person-signals')).textContent).toContain('жалоба');
    expect((screen.getByTestId('person-actions')).textContent).toContain('Предупреждение');
    expect(screen.getByText('На паузе')).toBeTruthy();
    // two-step: the button asks for confirmation first, nothing is sent yet
    fireEvent.click(screen.getByText('Снять с очереди на 7 дней'));
    expect(post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText('Причина (по желанию, попадёт в журнал)'), { target: { value: 'ок' } });
    fireEvent.click(screen.getByText('Подтвердить'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/staff/suggestions/s1/decide', { action: 'apply', note: 'ок' }));
  });

  it('no card (404): a calm message with a way back', () => {
    wrap(<PersonCard adminId="w1" />);
    expect(screen.getByText('Карточки нет')).toBeTruthy();
  });
});
