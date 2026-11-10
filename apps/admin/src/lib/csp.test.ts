import { describe, expect, it } from 'vitest';
import { buildCsp, newNonce, parseOrigins, socketOrigins } from './csp';

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
    // Stickers and gifts go to R2 by a presigned PUT once the switch is on.
    expect(connect).toContain('https://*.r2.cloudflarestorage.com');
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

describe('admin CSP: the live socket origin (speed matrix §3 #5)', () => {
  it('adds the API host in https and wss form, nothing for a bad URL', () => {
    expect(socketOrigins('https://api.lawbid.dev/api/v1')).toEqual(['https://api.lawbid.dev', 'wss://api.lawbid.dev']);
    expect(socketOrigins('http://localhost:3000/api/v1')).toEqual(['http://localhost:3000', 'ws://localhost:3000']);
    expect(socketOrigins('not a url')).toEqual([]);
    expect(socketOrigins(undefined)).toEqual([]);
    const csp = buildCsp({ nonce: 'n', dev: false, socketOrigin: 'https://api.lawbid.dev/api/v1' });
    expect(directive(csp, 'connect-src')).toContain('wss://api.lawbid.dev');
    expect(directive(csp, 'connect-src')).toContain('https://api.lawbid.dev');
    expect(parseOrigins('wss://x.example.com https://y.example.com ftp://no')).toEqual([
      'wss://x.example.com',
      'https://y.example.com',
    ]);
  });
});
