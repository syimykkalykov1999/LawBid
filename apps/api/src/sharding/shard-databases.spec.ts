import { parseShardDatabaseUrls } from './shard-databases';

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
