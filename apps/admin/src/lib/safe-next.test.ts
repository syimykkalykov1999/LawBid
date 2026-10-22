import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-next';

describe('safeNextPath (audit #15)', () => {
  it('keeps same-site paths', () => {
    expect(safeNextPath('/users')).toBe('/users');
    expect(safeNextPath('/users/1?tab=a#x')).toBe('/users/1?tab=a#x');
  });

  it('rejects empty, absolute and protocol-relative targets', () => {
    for (const bad of [null, undefined, '', 'users', 'https://evil.com', '//evil.com', '///evil.com']) {
      expect(safeNextPath(bad)).toBe('/');
    }
  });

  // Security research #5 (2026-10-22), B6: a scheme is never a path.
  it('rejects javascript:, data: and other schemes', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'JAVASCRIPT:alert(1)', '/javascript:alert(1)x']) {
      // `/javascript:…` is a same-site path and stays; the others go.
      expect(safeNextPath(bad)).toBe(bad.startsWith('/') ? bad : '/');
    }
  });

  it('rejects backslashes and control characters', () => {
    for (const bad of ['/\\evil.com', '/\\/evil.com', '/users\\..', '/\tevil', '/\n/evil.com', '/\u0000x']) {
      expect(safeNextPath(bad)).toBe('/');
    }
  });
});
