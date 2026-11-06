import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@/lib/hooks';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('./country-switcher', () => ({ CountrySwitcher: () => null }));
vi.mock('./theme-toggle', () => ({ ThemeToggle: () => null, ThemeChoice: () => null }));
vi.mock('@/components/desk/presence-badge', () => ({ PresenceBadge: () => null }));

import { Topbar } from './topbar';

function me(over: Partial<Me>): Me {
  return {
    id: 'a',
    email: 'si@x.io',
    role: 'super_admin',
    totpEnabled: true,
    lastLoginAt: null,
    login: null,
    hasPassword: true,
    permissions: {},
    canManageAdmins: true,
    hasSecurityQuestion: false,
    securityQuestion: null,
    ...over,
  } as Me;
}

function bar(m: Me) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <Topbar me={m} onMenu={() => {}} onSearch={() => {}} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

// R-382 (owner 2026-11-04): the photo set for the account shows in the chip.
describe('Topbar avatar chip', () => {
  it('shows the account photo when «me» has one', () => {
    bar(me({ avatarUrl: 'https://media.lawbid.dev/a_w256.webp' }));
    const img = screen.getByTestId('topbar-avatar');
    expect(img.getAttribute('src')).toBe('https://media.lawbid.dev/a_w256.webp');
    expect(screen.queryByText('SI')).toBeNull();
  });

  it('a newly saved photo replaces the old one when «me» refreshes', () => {
    const qc = new QueryClient();
    const tree = (m: Me) => (
      <QueryClientProvider client={qc}>
        <Topbar me={m} onMenu={() => {}} onSearch={() => {}} />
      </QueryClientProvider>
    );
    const { rerender } = render(tree(me({ avatarUrl: null })));
    expect(screen.queryByTestId('topbar-avatar')).toBeNull();
    rerender(tree(me({ avatarUrl: 'https://media.lawbid.dev/new_w256.webp' })));
    expect(screen.getByTestId('topbar-avatar').getAttribute('src')).toBe('https://media.lawbid.dev/new_w256.webp');
  });

  it('no photo: the initials as before', () => {
    bar(me({ avatarUrl: null }));
    expect(screen.queryByTestId('topbar-avatar')).toBeNull();
    expect(screen.getByText('SI')).toBeTruthy();
  });

  it('a link that fails to load falls back to the initials', () => {
    bar(me({ avatarUrl: 'https://media.lawbid.dev/gone.webp' }));
    fireEvent.error(screen.getByTestId('topbar-avatar'));
    expect(screen.queryByTestId('topbar-avatar')).toBeNull();
    expect(screen.getByText('SI')).toBeTruthy();
  });
});
