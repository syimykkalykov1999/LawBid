import {
  shardReplicaUrlsFromEnv,
  parseShardDatabaseUrls,
  shardDatabaseUrlsFromEnv,
} from './shard-databases';

describe('parseShardDatabaseUrls', () => {
  it('is empty without the variable', () => {
    expect(parseShardDatabaseUrls(undefined)).toEqual({});
    expect(parseShardDatabaseUrls('  ')).toEqual({});
  });

  it('reads a JSON object of key -> url', () => {
    expect(
      parseShardDatabaseUrls(
        '{"db1":"postgresql://a/b","db2":"postgresql://c/d"}',
      ),
    ).toEqual({ db1: 'postgresql://a/b', db2: 'postgresql://c/d' });
  });

  it('ignores bad input and reports it, never throws', () => {
    const errors: string[] = [];
    const on = (m: string) => errors.push(m);
    expect(parseShardDatabaseUrls('{nope', on)).toEqual({});
    expect(parseShardDatabaseUrls('[1]', on)).toEqual({});
    expect(
      parseShardDatabaseUrls('{"primary":"x","bad key":"y","db1":""}', on),
    ).toEqual({});
    expect(errors).toHaveLength(5);
  });
});

describe('shardDatabaseUrlsFromEnv', () => {
  const base =
    'postgresql://lawbid_app:secret@primary.rds:5432/lawbid?sslmode=verify-full';

  it('builds a URL from a host: DATABASE_URL with the host swapped, port 5432', () => {
    expect(
      shardDatabaseUrlsFromEnv({
        DATABASE_URL: base,
        DB_SHARD_HOSTS: '{"db1":"db1.rds"}',
      }),
    ).toEqual({
      db1: 'postgresql://lawbid_app:secret@db1.rds:5432/lawbid?sslmode=verify-full',
    });
  });

  it('a full URL in DATABASE_URL_SHARDS wins for its key', () => {
    expect(
      shardDatabaseUrlsFromEnv({
        DATABASE_URL: base,
        DB_SHARD_HOSTS: '{"db1":"db1.rds","db2":"db2.rds"}',
        DATABASE_URL_SHARDS: '{"db1":"postgresql://x@full/lawbid"}',
      }),
    ).toEqual({
      db1: 'postgresql://x@full/lawbid',
      db2: 'postgresql://lawbid_app:secret@db2.rds:5432/lawbid?sslmode=verify-full',
    });
  });

  it('nothing set = one database (no behaviour change)', () => {
    expect(shardDatabaseUrlsFromEnv({ DATABASE_URL: base })).toEqual({});
    expect(
      shardDatabaseUrlsFromEnv({ DB_SHARD_HOSTS: '{"db1":"db1.rds"}' }),
    ).toEqual({});
  });
});

// Owner 2026-11-11: each extra server's own read copy.
describe('shardReplicaUrlsFromEnv', () => {
  const base = {
    DATABASE_URL:
      'postgresql://app:pw@primary.example:5432/lawbid?sslmode=require',
    DB_SHARD_HOSTS: '{"db1":"db1.example","db2":"db2.example"}',
  };

  it('a server with a copy is read from the copy, the others from themselves', () => {
    expect(
      shardReplicaUrlsFromEnv({
        ...base,
        DB_SHARD_REPLICA_HOSTS: '{"db1":"db1-replica.example"}',
      }),
    ).toEqual({
      db1: 'postgresql://app:pw@db1-replica.example:5432/lawbid?sslmode=require',
      db2: 'postgresql://app:pw@db2.example:5432/lawbid?sslmode=require',
    });
  });

  it('no copies: every server is read from itself', () => {
    expect(shardReplicaUrlsFromEnv(base)).toEqual({
      db1: 'postgresql://app:pw@db1.example:5432/lawbid?sslmode=require',
      db2: 'postgresql://app:pw@db2.example:5432/lawbid?sslmode=require',
    });
  });

  it('one database: nothing', () => {
    expect(
      shardReplicaUrlsFromEnv({ DATABASE_URL: base.DATABASE_URL }),
    ).toEqual({});
  });
});
