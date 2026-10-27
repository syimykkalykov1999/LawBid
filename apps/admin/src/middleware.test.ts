// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from './middleware';

const at = (path: string, cookie?: string) =>
  middleware(
    new NextRequest(`http://admin.test${path}`, cookie ? { headers: { cookie } } : undefined),
  );

describe('admin middleware (S18-12)', () => {
  it('sends a visitor without a session to /login and remembers the page', () => {
    const res = at('/users');
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get('location')!);
    expect(to.pathname).toBe('/login');
    expect(to.searchParams.get('next')).toBe('/users');
  });

  it('does not add ?next for the home page', () => {
    const to = new URL(at('/').headers.get('location')!);
    expect(to.search).toBe('');
  });

  it('lets a signed-in admin through and sets a nonce CSP', () => {
    const res = at('/users', 'lawbid_admin=tok');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toMatch(/nonce-/);
  });

  it('sends a signed-in admin away from /login', () => {
    const res = at('/login', 'lawbid_admin=tok');
    expect(new URL(res.headers.get('location')!).pathname).toBe('/');
  });

  it('opens /login and invite links without a session', () => {
    expect(at('/login').status).toBe(200);
    expect(at('/invite/abc').status).toBe(200);
  });
});
