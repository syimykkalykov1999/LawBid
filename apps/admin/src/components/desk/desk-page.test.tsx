import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@/lib/hooks';
import type { DeskResult, MyLeases, MyProgress, PieceworkMine, TeamTile } from '@/lib/desk-data';

let me: Me | undefined;
let search = '';
let switches: Record<string, boolean> = {};
let numbers: Record<string, number> = {};
let myLeases: DeskResult<MyLeases> = { ok: false, missing: true };
let progress: DeskResult<MyProgress> = { ok: false, missing: true };
let piecework: DeskResult<PieceworkMine> = { ok: false, missing: true };
let team: DeskResult<{ tiles: TeamTile[] }> = { ok: false, missing: true };
let appeals: DeskResult<unknown[]> = { ok: false, missing: true };
const replace = vi.fn();
const post = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/desk/x',
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...(rest as Record<string, unknown>)}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/hooks', () => ({ useMe: () => ({ data: me }) }));
vi.mock('@/lib/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() }, ApiError: class extends Error {}, toProxy: { onRequest: () => undefined }, errorText: String }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/components/workspace/queue-next', () => ({ useNextVerification: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('@/lib/desk-data', async (orig) => {
  const real = await orig<typeof import('@/lib/desk-data')>();
  const q = (data: unknown) => ({ data, isPending: false });
  return {
    ...real,
    useDeskSettings: (m: Me | undefined) => real.settingsView({ switches, numbers }, !m && false),
    useMyLeases: () => q(myLeases),
    useMyProgress: () => q(progress),
    useMyPiecework: () => q(piecework),
    useMyDecisions: () => q({ ok: true, data: { days: [{ day: '2026-10-26', decided: 7, avgHandleSec: 120, reopened: 1, lateSla: 0, skips: 0 }], decidedTotal: 7 } }),
    useDeskTeam: () => q(team),
    useMyAppeals: () => q(appeals),
    deskPost: (...a: unknown[]) => post(...a),
  };
});
// the real pages are big and have their own tests: the desk only composes them
vi.mock('@/app/(app)/verification/page', () => ({ default: () => <div>PAGE verification queue</div> }));
vi.mock('@/app/(app)/moderation/page', () => ({ default: () => <div>PAGE reports</div> }));
vi.mock('@/app/(app)/moderation-appeals/page', () => ({ default: () => <div>PAGE decision appeals</div> }));
vi.mock('@/app/(app)/review-appeals/page', () => ({ default: () => <div>PAGE review appeals</div> }));
vi.mock('@/app/(app)/support/page', () => ({ default: () => <div>PAGE support inbox</div> }));
vi.mock('@/app/(app)/payroll/page', () => ({ default: () => <div>PAGE payroll</div> }));
vi.mock('@/app/(app)/payments/page', () => ({ default: () => <div>PAGE payments</div> }));
vi.mock('@/app/(app)/treasury/page', () => ({ default: () => <div>PAGE treasury</div> }));
vi.mock('./support-chats-tab', () => ({ SupportChatsTab: () => <div>PAGE chats</div> }));

import { DeskPage } from './desk-page';

function base(over: Partial<Me>): Me {
  return {
    id: 'a',
    email: 'a@x.io',
    role: 'verifier',
    totpEnabled: true,
    lastLoginAt: null,
    login: null,
    hasPassword: true,
    permissions: {},
    canManageAdmins: false,
    hasSecurityQuestion: false,
    securityQuestion: null,
    workspacesEnabled: true,
    workspace: 'mass',
    ...over,
  } as Me;
}

function show(role: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DeskPage role={role} />
    </QueryClientProvider>,
  );
}

const tabLabels = () => within(screen.getByRole('tablist')).getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, '').trim());

beforeEach(() => {
  me = base({});
  search = '';
  switches = { 'staff.workspaces_enabled': true, 'staff.desk_enabled': true };
  numbers = {};
  myLeases = { ok: false, missing: true };
  progress = { ok: false, missing: true };
  piecework = { ok: false, missing: true };
  team = { ok: false, missing: true };
  appeals = { ok: false, missing: true };
  replace.mockClear();
  post.mockReset();
});
afterEach(cleanup);

describe('desk routes: off means «not found»', () => {
  it('the desk switch off → 404 for everyone, with the same words as any missing section', () => {
    switches = { 'staff.workspaces_enabled': true };
    show('verifier');
    expect(screen.getByText('Такой страницы нет.')).toBeTruthy();
    expect(screen.queryByTestId('desk-header')).toBeNull();
  });

  it('workspaces off (Me says so) → 404', () => {
    me = base({ workspacesEnabled: false });
    show('verifier');
    expect(screen.getByText('Такой страницы нет.')).toBeTruthy();
  });

  it('not your desk, and an unknown desk → 404', () => {
    show('moderator');
    expect(screen.getByText('Такой страницы нет.')).toBeTruthy();
    cleanup();
    show('nonsense');
    expect(screen.getByText('Такой страницы нет.')).toBeTruthy();
  });
});

describe('each desk renders its tabs and composes the existing queue page', () => {
  it('verifier: Очередь | Мои | Проверено | Мой рейтинг', () => {
    show('verifier');
    expect(tabLabels()).toEqual(['Очередь', 'Мои', 'Проверено', 'Мой рейтинг']);
    expect(screen.getByText('PAGE verification queue')).toBeTruthy();
    expect(screen.getByTestId('desk-header').textContent).toContain('Стол проверки');
  });

  it('moderator: Жалобы | Обжалования | Мои | Мой рейтинг, appeals switch between decisions and reviews', () => {
    me = base({ role: 'moderator' });
    show('moderator');
    expect(tabLabels()).toEqual(['Жалобы', 'Обжалования', 'Мои', 'Мой рейтинг']);
    expect(screen.getByText('PAGE reports')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Обжалования' }));
    expect(replace).toHaveBeenCalledWith('/desk/moderator?tab=appeals', { scroll: false });
  });

  it('moderator ?tab=appeals shows the decision appeals and then the review appeals', () => {
    me = base({ role: 'moderator' });
    search = 'tab=appeals';
    show('moderator');
    expect(screen.getByText('PAGE decision appeals')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Отзывы' }));
    expect(screen.getByText('PAGE review appeals')).toBeTruthy();
  });

  it('support: Обращения | Чаты | Мои | Мой рейтинг', () => {
    me = base({ role: 'support' });
    show('support');
    expect(tabLabels()).toEqual(['Обращения', 'Чаты', 'Мои', 'Мой рейтинг']);
    expect(screen.getByText('PAGE support inbox')).toBeTruthy();
    cleanup();
    search = 'tab=chats';
    show('support');
    expect(screen.getByText('PAGE chats')).toBeTruthy();
  });

  it('finance: Выплаты | Возвраты | Отчёты | Мои задачи', () => {
    me = base({ role: 'finance', workspace: 'finance' });
    show('finance');
    expect(tabLabels()).toEqual(['Выплаты', 'Возвраты', 'Отчёты', 'Мои задачи']);
    expect(screen.getByText('PAGE payroll')).toBeTruthy();
    cleanup();
    search = 'tab=refunds';
    show('finance');
    expect(screen.getByText('PAGE payments')).toBeTruthy();
    cleanup();
    search = 'tab=reports';
    show('finance');
    expect(screen.getByText('PAGE treasury')).toBeTruthy();
  });
});

describe('graceful degrade while the other APIs are missing (404 / 501)', () => {
  it('«Мои», «Проверено» and «Мой рейтинг» explain themselves instead of failing', () => {
    search = 'tab=mine';
    show('verifier');
    expect(screen.getByText('Закрепление пока выключено')).toBeTruthy();
    cleanup();
    search = 'tab=rating';
    show('verifier');
    expect(screen.getByText('Рейтинг пока не показывается')).toBeTruthy();
  });

  it('the appeal button and the presence controls are hidden when their endpoints are missing', () => {
    switches = { ...switches, 'staff.appeals_enabled': true, 'staff.presence_enabled': true };
    show('verifier');
    expect(screen.queryByText('Обжаловать главного')).toBeNull();
    expect(screen.queryByText('Отошёл')).toBeNull();
  });
});

describe('header: presence, items in work, limits from the settings, appeal', () => {
  it('shows presence, the load and the time limit per kind (numbers from the settings)', () => {
    switches = { ...switches, 'staff.lease_enabled': true, 'staff.presence_enabled': true };
    numbers = { 'staff.lease.ttl_verification_min': 25 };
    myLeases = {
      ok: true,
      data: {
        status: 'online',
        capacity: { chat: 3, other: 1 },
        wrapUpSec: 0,
        leases: [{ kind: 'verification', itemId: 'abcdef12-0000', takenAt: new Date().toISOString(), leasedUntil: new Date(Date.now() + 600_000).toISOString(), attempt: 1 }],
      },
    };
    show('verifier');
    const h = screen.getByTestId('desk-header');
    expect(h.textContent).toContain('на связи');
    expect(h.textContent).toContain('В работе: 1 из 1');
    expect(h.textContent).toContain('ближайший срок');
    expect(screen.getByTestId('desk-limits').textContent).toContain('заявка адвоката — 25 мин');
    expect(screen.getByText('Отошёл')).toBeTruthy();
  });

  it('«Мои» lists the held item with the time left and a button to let it go', () => {
    switches = { ...switches, 'staff.lease_enabled': true };
    search = 'tab=mine';
    myLeases = {
      ok: true,
      data: {
        status: 'online',
        capacity: { chat: 3, other: 1 },
        wrapUpSec: 0,
        leases: [
          { kind: 'verification', itemId: 'abcdef12-0000', takenAt: new Date().toISOString(), leasedUntil: new Date(Date.now() + 90_000).toISOString(), attempt: 1 },
          { kind: 'support_ticket', itemId: 'other', takenAt: new Date().toISOString(), leasedUntil: new Date(Date.now() + 90_000).toISOString(), attempt: 1 },
        ],
      },
    };
    show('verifier');
    expect(screen.getByText('Заявка адвоката')).toBeTruthy();
    // an item of another desk is not shown here
    expect(screen.queryByText('Обращение')).toBeNull();
    expect(screen.getByText('Отпустить')).toBeTruthy();
    expect(screen.getByText(/осталось 1:/)).toBeTruthy();
  });

  it('«обжаловать главного» appears for a worker only when the endpoint answers; never for the head', () => {
    switches = { ...switches, 'staff.appeals_enabled': true };
    appeals = { ok: true, data: [] };
    show('verifier');
    expect(screen.getByText('Обжаловать главного')).toBeTruthy();
    cleanup();
    me = base({ workspaceHead: true });
    show('verifier');
    expect(screen.queryByText('Обжаловать главного')).toBeNull();
  });

  it('the appeal dialog offers the anonymous checkbox and sends to the workspace route', async () => {
    switches = { ...switches, 'staff.appeals_enabled': true };
    appeals = { ok: true, data: [] };
    post.mockResolvedValue({ ok: true, data: {} });
    show('verifier');
    fireEvent.click(screen.getByText('Обжаловать главного'));
    expect(screen.getByText('Отправить анонимно')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('Что произошло'), { target: { value: 'Меня сняли без причины на этой неделе' } });
    fireEvent.click(screen.getByText('Отправить'));
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/admin/workspace/appeals', { kind: 'other', text: 'Меня сняли без причины на этой неделе', anonymous: true });
  });

  it('the guide button opens plain-Russian instructions for the role', () => {
    show('verifier');
    fireEvent.click(screen.getByText('Инструкция'));
    expect(screen.getByText('Как устроен ваш стол')).toBeTruthy();
    expect(screen.getByText('Проверка документов')).toBeTruthy();
  });
});

describe('«Мой рейтинг»: own score, band, soft suggestions, own pay', () => {
  const ok = (over: Partial<MyProgress>): DeskResult<MyProgress> => ({
    ok: true,
    data: { rating: 91, status: 'green', decisions: 120, rankPct: 3, flags: [], accuracy: 95, clean: 90, usersVerdict: 88, speed: 80, suggestionKinds: [], trend: [], ...over },
  });

  it('shows the score and the band', () => {
    switches = { ...switches, 'staff.rating_enabled': true, 'staff.worker_progress_enabled': true };
    search = 'tab=rating';
    progress = ok({});
    show('verifier');
    expect(screen.getByTestId('my-rating-score').textContent).toBe('91');
    expect(screen.getByText('Отлично')).toBeTruthy();
    expect(screen.getByText('Точность')).toBeTruthy();
  });

  it('low data says so kindly; harsh suggestions (replace, pull) are never shown to the worker', () => {
    switches = { ...switches, 'staff.rating_enabled': true, 'staff.worker_progress_enabled': true };
    search = 'tab=rating';
    progress = ok({ rating: null, status: 'low_data', suggestionKinds: ['replace', 'pull', 'warn', 'retrain'] });
    show('verifier');
    expect(screen.getByText('Мало данных')).toBeTruthy();
    expect(screen.getByText(/короткое обучение/)).toBeTruthy();
    expect(screen.queryByText(/замен/i)).toBeNull();
  });

  it('with the rating switched off it does not even ask', () => {
    search = 'tab=rating';
    show('verifier');
    expect(screen.getByText('Рейтинг пока не показывается')).toBeTruthy();
  });

  it('«Моя оплата» appears from the piecework API and shows only my own numbers', () => {
    switches = { ...switches, 'staff.piecework_enabled': true };
    search = 'tab=rating';
    piecework = {
      ok: true,
      data: {
        period: '2026-10',
        scope: 'self',
        currency: 'usd',
        totals: { people: 1, units: 40, heldUnits: 2, amountCents: 12500 },
        people: [{ adminId: 'a', name: 'Я', units: 40, heldUnits: 2, amountCents: 12500, days: [{ day: '2026-10-26', units: 10, heldUnits: 0, qualityMult: 1.1, amountCents: 3300, status: 'accrued', noRating: false }] }],
      },
    };
    show('verifier');
    expect(screen.getByText('Моя оплата')).toBeTruthy();
    expect(screen.getByTestId('my-pay-total').textContent).toBe('$125');
  });
});

describe('head / owner look at a desk', () => {
  const tiles: TeamTile[] = [
    { adminId: 'w1', name: 'Анна', role: 'verifier', status: 'online', items: [{ kind: 'verification', itemId: 'i1', takenAt: null, leasedUntil: null, heldMinutes: 7 }], doneToday: 12 },
    { adminId: 'w2', name: 'Борис', role: 'support', status: 'away', items: [], doneToday: 3 },
  ];

  it('the head sees the team of the desk with «в работе у X», no personal tabs, no Next button', () => {
    me = base({ role: 'support', workspaceHead: true });
    switches = { ...switches, 'staff.lease_enabled': true, 'staff.lease_verification_enabled': true };
    team = { ok: true, data: { tiles } };
    search = 'tab=team';
    show('verifier');
    expect(screen.getByText('просмотр: только чтение')).toBeTruthy();
    expect(tabLabels()).toEqual(['Очередь', 'Команда']);
    expect(screen.getByTestId('team-tiles').textContent).toContain('в работе у Анна: Заявка адвоката, 7 мин');
    // only this desk's people
    expect(screen.queryByText('Борис')).toBeNull();
    expect(screen.queryByText('Следующий')).toBeNull();
    expect(screen.queryByText('Обжаловать главного')).toBeNull();
    // the other mass desks are one click away, finance is not
    const nav = screen.getByRole('navigation', { name: 'Столы' });
    expect(within(nav).getAllByRole('link').map((l) => l.textContent).sort()).toEqual(['Модерация', 'Поддержка', 'Проверка']);
  });

  it('the head cannot open the finance desk', () => {
    me = base({ role: 'support', workspaceHead: true });
    show('finance');
    expect(screen.getByText('Такой страницы нет.')).toBeTruthy();
  });

  it('the owner looks at finance too; team missing → a calm hint', () => {
    me = base({ role: 'super_admin', workspace: 'owner' });
    switches = { ...switches, 'staff.lease_enabled': true };
    search = 'tab=team';
    show('finance');
    expect(screen.getByText('Команда пока не видна')).toBeTruthy();
    expect(screen.getByText('просмотр: только чтение')).toBeTruthy();
  });
});

describe('«Следующий»', () => {
  it('is drawn for the worker on a queue tab, not on a personal tab', () => {
    show('verifier');
    expect(screen.getByText('Следующий')).toBeTruthy();
    cleanup();
    search = 'tab=mine';
    show('verifier');
    expect(screen.queryByText('Следующий')).toBeNull();
  });

  it('calls the T3 endpoint with the kind of the tab when the engine serves the queue', async () => {
    switches = { ...switches, 'staff.lease_enabled': true, 'staff.lease_verification_enabled': true };
    post.mockResolvedValue({ ok: true, data: { status: 'empty' } });
    show('verifier');
    fireEvent.click(screen.getByText('Следующий'));
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith('/admin/desk/lease/next', { kind: 'verification' }));
  });

  it('moderation without the engine has no Next button (nothing to call yet)', () => {
    me = base({ role: 'moderator' });
    show('moderator');
    expect(screen.queryByText('Следующий')).toBeNull();
  });
});
