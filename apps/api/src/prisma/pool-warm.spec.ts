import { poolMaxOf, poolWarmEnabled, warmPool } from './pg-adapter';
import { withPoolDefaults } from './prisma.service';

/** F7 (14.11): the pool is opened before the task listens. */
describe('pool warm-up (Prisma 7 driver adapter)', () => {
  it('opens as many connections as the pool size, all at the same time', async () => {
    let open = 0;
    let peak = 0;
    const client = {
      $queryRawUnsafe: jest.fn(async (sql: string) => {
        expect(sql).toBe('SELECT 1');
        open += 1;
        peak = Math.max(peak, open);
        await new Promise((r) => setTimeout(r, 5));
        open -= 1;
        return [{ '?column?': 1 }];
      }),
    };
    const r = await warmPool(client, 7);
    expect(client.$queryRawUnsafe).toHaveBeenCalledTimes(7);
    expect(peak).toBe(7);
    expect(r).toMatchObject({ opened: 7, failed: 0 });
  });

  it('never throws when the database is down; counts the failures', async () => {
    const client = {
      $queryRawUnsafe: jest.fn(() =>
        Promise.reject(Object.assign(new Error(''), { code: 'ECONNREFUSED' })),
      ),
    };
    await expect(warmPool(client, 3)).resolves.toMatchObject({
      opened: 0,
      failed: 3,
    });
  });

  it('size 0 or nonsense = nothing to do', async () => {
    const client = { $queryRawUnsafe: jest.fn() };
    await warmPool(client, 0);
    await warmPool(client, Number.NaN);
    expect(client.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('the size is the existing pool setting (DB_POOL_SIZE → connection_limit → max)', () => {
    const url = withPoolDefaults('postgresql://u@db.example/lawbid', {
      DB_POOL_SIZE: '6',
    });
    expect(poolMaxOf(url)).toBe(6);
    expect(poolMaxOf(undefined)).toBe(0);
  });

  it('on by default outside jest; DB_POOL_WARM=off / on wins', () => {
    expect(poolWarmEnabled({ NODE_ENV: 'production' })).toBe(true);
    expect(
      poolWarmEnabled({ NODE_ENV: 'production', DB_POOL_WARM: 'off' }),
    ).toBe(false);
    expect(poolWarmEnabled({ JEST_WORKER_ID: '1' })).toBe(false);
    expect(poolWarmEnabled({ JEST_WORKER_ID: '1', DB_POOL_WARM: 'on' })).toBe(
      true,
    );
  });
});
