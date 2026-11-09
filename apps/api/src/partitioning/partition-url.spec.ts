import { partitionDatabaseUrl } from './partition-url';

const env = (m: Record<string, string>) => (k: string) => m[k];

describe('partitionDatabaseUrl', () => {
  it('prefers PARTITION_DATABASE_URL', () => {
    expect(
      partitionDatabaseUrl(
        env({
          PARTITION_DATABASE_URL: 'postgresql://p:x@h/db',
          PARTITION_DB_PASSWORD: 'test-partition-password',
          DATABASE_URL: 'postgresql://lawbid_app:a@h/db',
        }),
      ),
    ).toBe('postgresql://p:x@h/db');
  });

  it('builds the login from DATABASE_URL and the generated password', () => {
    const url = partitionDatabaseUrl(
      env({
        PARTITION_DB_PASSWORD: 'test-partition-password',
        DATABASE_URL:
          'postgresql://lawbid_app:app@db.example:5432/lawbid?sslmode=require',
      }),
    );
    const u = new URL(url!);
    expect(u.username).toBe('lawbid_partition');
    expect(u.password).toBe('test-partition-password');
    expect(u.host).toBe('db.example:5432');
    expect(u.pathname).toBe('/lawbid');
    expect(u.searchParams.get('sslmode')).toBe('require');
    expect(u.searchParams.get('connection_limit')).toBe('2');
  });

  it('is undefined without a password, a base URL, or with a bad URL', () => {
    expect(
      partitionDatabaseUrl(env({ DATABASE_URL: 'postgresql://a:b@h/d' })),
    ).toBeUndefined();
    expect(
      partitionDatabaseUrl(
        env({ PARTITION_DB_PASSWORD: 'test-partition-password' }),
      ),
    ).toBeUndefined();
    expect(
      partitionDatabaseUrl(
        env({
          PARTITION_DB_PASSWORD: 'test-partition-password',
          DATABASE_URL: 'not a url',
        }),
      ),
    ).toBeUndefined();
    expect(
      partitionDatabaseUrl(
        env({
          PARTITION_DB_PASSWORD: 'test-partition-password',
          DATABASE_URL: 'mysql://a:b@h/d',
        }),
      ),
    ).toBeUndefined();
  });
});
