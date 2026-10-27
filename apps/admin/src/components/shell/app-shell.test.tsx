import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@/lib/hooks';

let pathname = '/support';
let currentMe: Me | undefined;
let deskOn = false;
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...(rest as Record<string, unknown>)}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/hooks', () => ({ useMe: () => ({ data: currentMe }) }));
vi.mock('@/lib/desk-data', () => ({
  useDeskSettings: () => ({ loading: false, on: (k: string) => k === 'staff.desk_enabled' && deskOn, num: () => 0 }),
  useMyLeases: () => ({ data: undefined }),
  deskPost: vi.fn(),
}));
vi.mock('@/lib/api/client', () => ({
  api: { GET: vi.fn().mockResolvedValue({ data: { data: {} } }) },
  ApiError: class ApiError extends Error {},
  registerStepUpPrompt: vi.fn(),
  errorText: (e: unknown) => String(e),
}));
vi.mock('./step-up-host', () => ({ StepUpHost: () => null }));
vi.mock('./country-switcher', () => ({ CountrySwitcher: () => null }));
vi.mock('./theme-toggle', () => ({ ThemeToggle: () => null, ThemeChoice: () => null }));
vi.mock('./command-palette', () => ({ CommandPalette: () => null }));
vi.mock('@/components/ui/overflow-tabs', () => ({
  OverflowTabs: ({ items, label }: { items: { href: string; label: string }[]; label?: string }) => (
    <nav aria-label={label ?? 'tabs'} data-testid="tabs">
      {items.map((t) => (
        <a key={t.href} href={t.href}>
          {t.label}
        </a>
      ))}
    </nav>
  ),
}));

import { AppShell } from './app-shell';

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
    ...over,
  } as Me;
}

function shell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AppShell>
        <div>page body</div>
      </AppShell>
    </QueryClientProvider>,
  );
}

const SUPPORT_RIGHTS = { dashboard: 'view', support: 'manage', verification: 'manage', users: 'view', money: 'view' } as const;

describe('AppShell (staff package T2)', () => {
  beforeEach(() => {
    pathname = '/support';
    deskOn = false;
    replace.mockClear();
  });
  afterEach(cleanup);

  it('switch off: the left menu with the old section names, no desk', () => {
    currentMe = base({ role: 'super_admin', workspacesEnabled: false, workspace: 'owner' });
    shell();
    expect(screen.queryByTestId('tabs')).not.toBeNull(); // the section tabs of the page
    expect(screen.getAllByText('Люди').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Контент и модерация').length).toBeGreaterThan(0);
    expect(screen.queryByText('Очереди')).toBeNull();
  });

  it('switch on, owner: the left menu in the eight groups', () => {
    currentMe = base({ role: 'super_admin', workspacesEnabled: true, workspace: 'owner' });
    shell();
    for (const g of ['Сегодня', 'Очереди', 'Люди и кейсы', 'Контент и тексты', 'Деньги', 'Команда и контроль', 'Система', 'Запуск и право']) {
      expect(screen.getAllByText(g).length, g).toBeGreaterThan(0);
    }
    expect(screen.queryByText('Контент и модерация')).toBeNull();
  });

  it('switch on, worker: no left menu, no bottom bar — one page with tabs of their own workspace', () => {
    currentMe = base({ permissions: { ...SUPPORT_RIGHTS }, workspacesEnabled: true, workspace: 'mass' });
    const { container } = shell();
    expect(container.querySelector('aside')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Разделы' })).toBeNull();
    const tabs = screen.getByTestId('tabs');
    expect(tabs.getAttribute('aria-label')).toBe('Массовая работа');
    const labels = [...tabs.querySelectorAll('a')].map((a) => a.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Рабочее место', 'Поддержка', 'Адвокаты', 'Пользователи']));
    // the money toggle does not bring the money pages into the mass desk
    expect(labels).not.toContain('Платежи и возвраты');
    expect(screen.getByText('page body')).toBeTruthy();
    // the old group names are gone for the worker
    expect(screen.queryByText('Контент и модерация')).toBeNull();
  });

  it('switch on, worker on a page of another workspace: "not found"', () => {
    pathname = '/payments';
    currentMe = base({ permissions: { ...SUPPORT_RIGHTS }, workspacesEnabled: true, workspace: 'mass' });
    shell();
    expect(screen.queryByText('page body')).toBeNull();
    expect(screen.getByText('Такой страницы нет.')).toBeTruthy();
  });

  it('switch on, head: also the desk, with the team page among the tabs', () => {
    currentMe = base({ permissions: { ...SUPPORT_RIGHTS }, workspacesEnabled: true, workspace: 'mass', workspaceHead: true });
    shell();
    const labels = [...screen.getByTestId('tabs').querySelectorAll('a')].map((a) => a.textContent);
    expect(labels).toContain('Администраторы');
  });

  it('switch on, the deputy: still the old left menu (outside the workspaces)', () => {
    currentMe = base({ role: 'support', canManageAdmins: true, workspacesEnabled: true, workspace: 'mass' });
    const { container } = shell();
    expect(container.querySelector('aside')).not.toBeNull();
    expect(screen.queryByText('Очереди')).toBeNull();
  });
  describe('with the desk switch on (staff package T8)', () => {
    const worker = () => base({ role: 'support', permissions: { ...SUPPORT_RIGHTS }, workspacesEnabled: true, workspace: 'mass' });
    beforeEach(() => {
      deskOn = true;
    });

    it('the page tabs of T2 are gone; a card of the desk gets a way back to the desk', () => {
      currentMe = worker();
      shell();
      expect(screen.queryByTestId('tabs')).toBeNull();
      expect(screen.getByText('← На стол').getAttribute('href')).toBe('/desk/support');
      expect(screen.getByText('page body')).toBeTruthy();
    });

    it('on the desk itself nothing is added around the page', () => {
      pathname = '/desk/support';
      currentMe = worker();
      shell();
      expect(screen.queryByTestId('tabs')).toBeNull();
      expect(screen.queryByText('← На стол')).toBeNull();
      expect(screen.getByText('page body')).toBeTruthy();
    });

    it('a page of the workspace that is not on their desk: "not found"', () => {
      pathname = '/outreach';
      currentMe = worker();
      shell();
      expect(screen.queryByText('page body')).toBeNull();
      expect(screen.getByText('Такой страницы нет.')).toBeTruthy();
    });

    it('the dashboard / «Рабочее место» send the worker to their desk', () => {
      pathname = '/';
      currentMe = worker();
      shell();
      expect(replace).toHaveBeenCalledWith('/desk/support');
      expect(screen.queryByText('page body')).toBeNull();
    });

    it('the owner keeps the grouped menu, untouched by the desk', () => {
      currentMe = base({ role: 'super_admin', workspacesEnabled: true, workspace: 'owner' });
      const { container } = shell();
      expect(container.querySelector('aside')).not.toBeNull();
      expect(screen.queryByText('← На стол')).toBeNull();
    });
  });
});
