import { ScaleService } from './scale.service';

function make(env: Record<string, string>, engine?: unknown, fail = false) {
  const config = { get: (k: string) => env[k] };
  const settings = {
    raw: jest.fn(() =>
      fail ? Promise.reject(new Error('down')) : Promise.resolve(engine),
    ),
  };
  return new ScaleService(config as never, settings as never);
}

describe('ScaleService', () => {
  it('reads the Terraform switches and the pooler', async () => {
    const r = await make({
      OPS_DB_AUTOSCALE: 'on',
      OPS_REDIS_AUTOSCALE: 'off',
      DB_POOLER_HOST: 'pooler.local',
      OPS_POOLER_MIN: '1',
      OPS_POOLER_MAX: '4',
    }).report();
    expect(r).toEqual({
      dbAutoscale: 'on',
      redisAutoscale: 'off',
      poolerEnabled: true,
      poolerMinTasks: 1,
      poolerMaxTasks: 4,
      searchEngine: 'postgres',
    });
  });

  it('says unknown / off when nothing is set (local Mac, old stack)', async () => {
    const r = await make({}).report();
    expect(r).toMatchObject({
      dbAutoscale: 'unknown',
      redisAutoscale: 'unknown',
      poolerEnabled: false,
      poolerMinTasks: null,
      poolerMaxTasks: null,
    });
  });

  it('reports the search engine setting, ignoring junk and failures', async () => {
    expect((await make({}, 'opensearch').report()).searchEngine).toBe(
      'opensearch',
    );
    expect((await make({}, 'bogus').report()).searchEngine).toBe('postgres');
    expect((await make({}, 'meilisearch', true).report()).searchEngine).toBe(
      'postgres',
    );
  });
});
