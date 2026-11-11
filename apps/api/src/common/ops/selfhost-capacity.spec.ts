import {
  prometheusValue,
  redisMemoryPercentFromInfo,
  selfHostDbConnections,
  selfHostRedisMemoryPercent,
} from './selfhost-capacity';

describe('self-host load readers («Масштаб» без AWS)', () => {
  it('database: connections of this database and max_connections', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([{ connections: 37, max: 100 }]),
    };
    expect(await selfHostDbConnections(db)).toEqual({
      connections: 37,
      max: 100,
    });
  });

  it('database: a failing read is null, never a guess', async () => {
    const db = { $queryRaw: jest.fn().mockRejectedValue(new Error('x')) };
    expect(await selfHostDbConnections(db)).toEqual({
      connections: null,
      max: null,
    });
  });

  it('Redis: used_memory / maxmemory, else / the machine memory, else null', () => {
    expect(
      redisMemoryPercentFromInfo('used_memory:500\r\nmaxmemory:1000\r\n'),
    ).toBe(50);
    expect(
      redisMemoryPercentFromInfo(
        'used_memory:250\r\nmaxmemory:0\r\ntotal_system_memory:1000\r\n',
      ),
    ).toBe(25);
    expect(
      redisMemoryPercentFromInfo('used_memory:250\r\nmaxmemory:0\r\n'),
    ).toBeNull();
  });

  it('Redis: no client or a failing INFO is null', async () => {
    expect(await selfHostRedisMemoryPercent(undefined)).toBeNull();
    const redis = { info: jest.fn().mockRejectedValue(new Error('down')) };
    expect(await selfHostRedisMemoryPercent(redis as never)).toBeNull();
  });

  it('CPU: one Prometheus value, or null without a URL / on errors', async () => {
    const ok = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ data: { result: [{ value: [1, '63.44'] }] } }),
    });
    expect(await prometheusValue('http://p:9090/', 'q', ok as never)).toBe(
      63.4,
    );
    expect(ok.mock.calls[0][0]).toBe('http://p:9090/api/v1/query?query=q');
    expect(await prometheusValue(undefined, 'q', ok as never)).toBeNull();
    const bad = jest.fn().mockResolvedValue({ ok: false });
    expect(await prometheusValue('http://p', 'q', bad as never)).toBeNull();
  });
});
