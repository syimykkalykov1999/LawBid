import { ChannelsService } from './channels.service';

/** Views of channel posts: batched through the aggregator behind a flag. */
describe('ChannelsService.markViewed', () => {
  function setup(opts: {
    flag: boolean;
    counters?: boolean;
    fresh?: string[];
  }) {
    const fresh = opts.fresh ?? ['p1', 'p2'];
    const updateMany = jest.fn().mockResolvedValue({ count: fresh.length });
    const prisma = {
      channelPost: {
        findMany: jest.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]),
        updateMany,
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValue(fresh.map((post_id) => ({ post_id }))),
    };
    const bump = jest.fn();
    const isEnabled = jest.fn().mockResolvedValue(opts.flag);
    const svc = Object.create(ChannelsService.prototype) as ChannelsService;
    Object.assign(svc, {
      prisma,
      flags: { isEnabled },
      counters: opts.counters === false ? undefined : { bump },
    });
    const priv = svc as unknown as Record<string, unknown>;
    priv.assertEnabled = jest.fn().mockResolvedValue(undefined);
    priv.findReadable = jest.fn().mockResolvedValue({ id: 'ch1' });
    priv.roleOf = jest.fn().mockResolvedValue(null);
    return { svc, updateMany, bump };
  }
  const reader = { sub: 'reader' } as never;

  it('flag on: no UPDATE, one pending delta per new view', async () => {
    const { svc, updateMany, bump } = setup({ flag: true });
    await svc.markViewed(reader, 'ch1', ['p1', 'p2']);
    expect(updateMany).not.toHaveBeenCalled();
    expect(bump.mock.calls).toEqual([
      ['channel_post', 'p1', 'view_count', 1],
      ['channel_post', 'p2', 'view_count', 1],
    ]);
  });

  it('flag off: the old UPDATE, nothing pending', async () => {
    const { svc, updateMany, bump } = setup({ flag: false });
    await svc.markViewed(reader, 'ch1', ['p1', 'p2']);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(bump).not.toHaveBeenCalled();
  });

  it('flag on without the aggregator: the old UPDATE', async () => {
    const { svc, updateMany } = setup({ flag: true, counters: false });
    await svc.markViewed(reader, 'ch1', ['p1', 'p2']);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('an old view counts nothing', async () => {
    const { svc, updateMany, bump } = setup({ flag: true, fresh: [] });
    await svc.markViewed(reader, 'ch1', ['p1', 'p2']);
    expect(updateMany).not.toHaveBeenCalled();
    expect(bump).not.toHaveBeenCalled();
  });
});
