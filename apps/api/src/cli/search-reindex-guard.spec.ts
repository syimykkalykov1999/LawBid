import { RECREATE_REFUSED, assertNoRecreate } from './search-reindex-guard';

describe('search-reindex --recreate guard', () => {
  it('refuses --recreate and points to the versioned reindex', () => {
    expect(() => assertNoRecreate(['node', 'x', '--recreate'])).toThrow(
      RECREATE_REFUSED,
    );
    expect(RECREATE_REFUSED).toContain('search-alias.js');
  });
  it('lets the other flags through', () => {
    expect(() =>
      assertNoRecreate(['node', 'x', '--restart', '--sync', '--entity=case']),
    ).not.toThrow();
  });
});
