import { Prisma } from '@prisma/client';
import { rawSqlIsGlobalOnly, rawSqlText } from './shard-delegates';

describe('hand-written SQL routing on two databases (step 8)', () => {
  it('only global tables -> primary', () => {
    expect(
      rawSqlIsGlobalOnly(
        'SELECT pa.code FROM practice_areas pa JOIN i18n_keys k ON k.key = pa.i18n_key JOIN i18n_translations t ON t.key_id = k.id',
      ),
    ).toBe(true);
    expect(
      rawSqlIsGlobalOnly(
        'SELECT * FROM users u LEFT JOIN attorney_profiles ap ON ap.user_id = u.id',
      ),
    ).toBe(true);
  });
  it('one sharded table anywhere keeps the shard routing', () => {
    expect(
      rawSqlIsGlobalOnly(
        'SELECT u.id FROM users u WHERE u.id IN (SELECT follower_id FROM follows)',
      ),
    ).toBe(false);
    expect(
      rawSqlIsGlobalOnly(
        'SELECT count(*) FROM notifications WHERE user_id = $1',
      ),
    ).toBe(false);
  });
  it('no known table keeps the old routing', () => {
    expect(rawSqlIsGlobalOnly('SELECT public.f_name_skel($1)')).toBe(false);
  });
  it('reads nested Prisma.sql fragments', () => {
    const edge = Prisma.sql`SELECT f.follower_id FROM follows f`;
    const tpl = Object.assign(['SELECT id FROM users WHERE id IN (', ')'], {
      raw: ['SELECT id FROM users WHERE id IN (', ')'],
    });
    expect(rawSqlIsGlobalOnly(rawSqlText([tpl, edge]))).toBe(false);
    expect(
      rawSqlIsGlobalOnly(rawSqlText([Prisma.sql`SELECT 1 FROM users`])),
    ).toBe(true);
  });
});
