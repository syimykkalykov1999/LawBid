import { ThemePref } from '@prisma/client';
import { normalizeThemePref } from './theme-pref.util';

describe('normalizeThemePref', () => {
  it.each([
    ['navy', 'blue'],
    ['glass', 'dark'],
    ['blue', 'blue'],
    ['green', 'green'],
    ['light', 'light'],
    ['dark', 'dark'],
    ['system', 'system'],
  ])('%s -> %s', (from, to) => {
    expect(normalizeThemePref(from as ThemePref)).toBe(to);
  });
});
