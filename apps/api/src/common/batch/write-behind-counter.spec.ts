import { WriteBehindCounter } from './write-behind-counter';

describe('WriteBehindCounter', () => {
  it('adds up increments and writes one batch', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    const c = new WriteBehindCounter(write, { intervalMs: 60_000 });
    for (let i = 0; i < 1000; i++) c.add('a');
    c.add('b', 5);
    await c.stop();
    expect(write).toHaveBeenCalledTimes(1);
    expect([...(write.mock.calls[0][0] as Map<string, number>)]).toEqual([
      ['a', 1000],
      ['b', 5],
    ]);
  });

  it('flushes at once when maxKeys distinct keys are waiting', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    const c = new WriteBehindCounter(write, { intervalMs: 60_000, maxKeys: 2 });
    c.add('a');
    c.add('b');
    await c.flush();
    expect(write).toHaveBeenCalledTimes(1);
    await c.stop();
  });

  it('keeps the counts when the write fails and retries them', async () => {
    const write = jest
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(undefined);
    const onError = jest.fn();
    const c = new WriteBehindCounter(write, { intervalMs: 60_000, onError });
    c.add('a', 2);
    await c.flush();
    expect(onError).toHaveBeenCalledTimes(1);
    c.add('a', 1);
    await c.stop();
    expect((write.mock.calls[1][0] as Map<string, number>).get('a')).toBe(3);
  });

  it('does not write when nothing is waiting', async () => {
    const write = jest.fn();
    const c = new WriteBehindCounter(write);
    await c.stop();
    expect(write).not.toHaveBeenCalled();
  });
});
