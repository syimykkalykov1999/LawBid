import { withPoolerRouting } from './pooler-url';
import { withPoolDefaults } from './prisma.service';

const DIRECT =
  'postgresql://lawbid_app:p%40ss@db.example.rds.amazonaws.com:5432/lawbid?sslmode=verify-full&schema=public';

describe('withPoolerRouting', () => {
  it('returns the URL untouched when no pooler is configured', () => {
    expect(withPoolerRouting(DIRECT, {})).toBe(DIRECT);
    expect(withPoolerRouting(DIRECT, { DB_POOLER_HOST: '  ' })).toBe(DIRECT);
    expect(
      withPoolerRouting(undefined, { DB_POOLER_HOST: 'x' }),
    ).toBeUndefined();
  });

  it('swaps host and port, keeps user, password and database', () => {
    const u = new URL(
      withPoolerRouting(DIRECT, {
        DB_POOLER_HOST: 'lawbid-prod-pgb.elb.us-east-1.amazonaws.com',
        DB_POOLER_PORT: '6432',
      })!,
    );
    expect(u.hostname).toBe('lawbid-prod-pgb.elb.us-east-1.amazonaws.com');
    expect(u.port).toBe('6432');
    expect(u.username).toBe('lawbid_app');
    expect(decodeURIComponent(u.password)).toBe('p@ss');
    expect(u.pathname).toBe('/lawbid');
    expect(u.searchParams.get('schema')).toBe('public');
  });

  it('forces an encrypted connection the self-signed pooler certificate passes', () => {
    const u = new URL(withPoolerRouting(DIRECT, { DB_POOLER_HOST: 'pgb' })!);
    expect(u.searchParams.get('sslmode')).toBe('require');
    expect(u.searchParams.get('sslaccept')).toBe('accept_invalid_certs');
    expect(u.port).toBe('5432');
  });

  it('adds DB_POOLER_QUERY (e.g. pgbouncer=true) and still gets pool defaults', () => {
    const routed = withPoolerRouting(DIRECT, {
      DB_POOLER_HOST: 'pgb',
      DB_POOLER_QUERY: 'pgbouncer=true',
    });
    const u = new URL(withPoolDefaults(routed, { DB_POOL_SIZE: '10' })!);
    expect(u.searchParams.get('pgbouncer')).toBe('true');
    expect(u.searchParams.get('connection_limit')).toBe('10');
  });

  it('leaves an unparsable URL alone', () => {
    expect(withPoolerRouting('not a url', { DB_POOLER_HOST: 'pgb' })).toBe(
      'not a url',
    );
  });
});
