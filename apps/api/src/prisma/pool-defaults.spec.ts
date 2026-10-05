import { withPoolDefaults } from './prisma.service';

describe('withPoolDefaults', () => {
  it('adds the pool limit and timeouts', () => {
    const out = new URL(
      withPoolDefaults(
        'postgresql://app:p%40ss@db:26257/lawbid?sslmode=verify-full',
        {},
      )!,
    );
    expect(out.searchParams.get('connection_limit')).toBe('10');
    expect(out.searchParams.get('pool_timeout')).toBe('10');
    expect(out.searchParams.get('connect_timeout')).toBe('10');
    expect(out.searchParams.get('sslmode')).toBe('verify-full');
    expect(out.password).toBe('p%40ss');
  });

  it('keeps values already in the URL and reads DB_POOL_SIZE', () => {
    const out = new URL(
      withPoolDefaults('postgresql://a@db/x?connection_limit=3', {
        DB_POOL_SIZE: '25',
      })!,
    );
    expect(out.searchParams.get('connection_limit')).toBe('3');
    expect(
      new URL(
        withPoolDefaults('postgresql://a@db/x', { DB_POOL_SIZE: '25' })!,
      ).searchParams.get('connection_limit'),
    ).toBe('25');
  });

  it('leaves a missing or unparsable URL alone', () => {
    expect(withPoolDefaults(undefined, {})).toBeUndefined();
    expect(withPoolDefaults('not a url', {})).toBe('not a url');
  });
});
