import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@/lib/hooks';

let me: Me | undefined;
let deskOn = true;
let role = 'verifier';
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useParams: () => ({ role }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/lib/hooks', () => ({ useMe: () => ({ data: me }) }));
vi.mock('@/lib/desk-data', () => ({
  useDeskSettings: () => ({ loading: false, on: (k: string) => k === 'staff.desk_enabled' && deskOn, num: () => 0 }),
}));
vi.mock('@/components/desk/desk-page', () => ({ DeskPage: ({ role: r }: { role: string }) => <div>DESK {r}</div> }));

import DeskIndexPage from './page';
import DeskRolePage from './[role]/page';

const user = (over: Partial<Me>): Me => ({ id: 'a', email: 'a@x.io', role: 'support', permissions: {}, workspacesEnabled: true, workspace: 'mass', ...over }) as Me;

beforeEach(() => {
  deskOn = true;
  replace.mockClear();
});
afterEach(cleanup);

describe('/desk/[role] route', () => {
  it.each(['verifier', 'moderator', 'support', 'finance'])('passes the %s segment to the desk', (r) => {
    role = r;
    render(<DeskRolePage />);
    expect(screen.getByText(`DESK ${r}`)).toBeTruthy();
  });
});

describe('/desk index', () => {
  it('a worker goes straight to their own desk', () => {
    me = user({ role: 'moderator' });
    render(<DeskIndexPage />);
    expect(replace).toHaveBeenCalledWith('/desk/moderator');
  });

  it('the owner gets the four desks to look at', () => {
    me = user({ role: 'super_admin', workspace: 'owner' });
    render(<DeskIndexPage />);
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/desk/verifier', '/desk/moderator', '/desk/support', '/desk/finance']);
    expect(replace).not.toHaveBeenCalled();
  });

  it('the desk switch off → "not found", nothing redirects', () => {
    deskOn = false;
    me = user({ role: 'moderator' });
    render(<DeskIndexPage />);
    expect(screen.getByText('Такой страницы нет.')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});
