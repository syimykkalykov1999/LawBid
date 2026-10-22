import { describe, expect, it } from 'vitest';
import { buildCsp, newNonce, parseOrigins } from './csp';

const directive = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';

describe('admin CSP (audit #8)', () => {
  it('production: nonce scripts only, connect-src limited to self + configured origins', () => {
    const csp = buildCsp({
      nonce: 'abc123',
      dev: false,
      connectSrc: 'https://media.s3.us-east-1.amazonaws.com, https://cdn.example.com',
    });
    const script = directive(csp, 'script-src');
    expect(script).toContain("'nonce-abc123'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain('unsafe-inline');
    expect(script).not.toContain('unsafe-eval');
    const connect = directive(csp, 'connect-src');
    expect(connect).toContain("'self'");
    expect(connect).toContain('https://media.s3.us-east-1.amazonaws.com');
    expect(connect).toContain('https://cdn.example.com');
    expect(connect.split(' ')).not.toContain('https:');
    expect(connect).not.toContain('http:');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it('dev keeps eval and plain http for the local storage', () => {
    const csp = buildCsp({ nonce: 'n', dev: true });
    expect(directive(csp, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(csp, 'connect-src')).toContain('http:');
  });

  it('ignores junk in ADMIN_CONNECT_SRC', () => {
    expect(parseOrigins("https://ok.example.com javascript:alert(1) 'unsafe-inline' https: *")).toEqual(['https://ok.example.com']);
    expect(parseOrigins(undefined)).toEqual([]);
  });

  it('nonces are random base64', () => {
    const a = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(newNonce()).not.toBe(a);
  });
});
