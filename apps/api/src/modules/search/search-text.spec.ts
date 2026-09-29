import { escapeLike } from './cockroach-search.provider';
import { normalizeQuery } from './search.service';

describe('search text helpers (docs/05 §7)', () => {
  it('normalizeQuery: lowercase, single spaces, no leading @/#', () => {
    expect(normalizeQuery('  @Better   Call  ')).toBe('better call');
    expect(normalizeQuery('#DUI')).toBe('dui');
    expect(normalizeQuery('@@#')).toBe('');
  });

  it('escapeLike: wildcards are literal', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});
