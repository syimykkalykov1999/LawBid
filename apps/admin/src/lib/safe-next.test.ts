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

  it('rejects backslashes and control characters', () => {
    for (const bad of ['/\\evil.com', '/\\/evil.com', '/users\\..', '/\tevil', '/\n/evil.com', '/\u0000x']) {
      expect(safeNextPath(bad)).toBe('/');
    }
  });
});
