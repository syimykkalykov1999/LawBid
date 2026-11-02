import { ChannelsService } from './channels.service';
import { encodeCursor } from '../../common/pagination/cursor.util';

const CURSOR = encodeCursor({
  createdAt: new Date(),
  id: '11111111-1111-4111-8111-111111111111',
});

/**
 * Replica seam: readers see a channel's post list a few seconds late; the
 * owner and the channel's admins (who just changed it) read the primary.
 */
describe('ChannelsService.posts replica reads', () => {
  const client = () => ({
    channelPost: { findMany: jest.fn().mockResolvedValue([]) },
  });
  function setup(role: string | null) {
    const primary = client();
    const replica = client();
    const readDb = jest.fn().mockReturnValue(replica);
    const svc = Object.create(ChannelsService.prototype) as ChannelsService;
    Object.assign(svc, { prisma: primary, read: { readDb } });
    const priv = svc as unknown as Record<string, unknown>;
    priv.assertEnabled = jest.fn().mockResolvedValue(undefined);
    priv.findReadable = jest
      .fn()
      .mockResolvedValue({ id: 'ch1', owner_id: 'owner' });
    priv.roleOf = jest.fn().mockResolvedValue(role);
    priv.presentPosts = jest.fn().mockResolvedValue([]);
    return { svc, primary, replica, readDb };
  }
  const as = (sub: string) => ({ sub }) as never;

  it('a reader gets older pages from the replica (5 s budget)', async () => {
    const { svc, primary, replica, readDb } = setup(null);
    await svc.posts(as('reader'), 'ch1', CURSOR);
    expect(readDb).toHaveBeenCalledWith({ maxStalenessMs: 5000 });
    expect(replica.channelPost.findMany).toHaveBeenCalledTimes(1);
    expect(primary.channelPost.findMany).not.toHaveBeenCalled();
  });

  it('the first page (newest posts) stays on the primary even for a reader', async () => {
    const { svc, primary, replica, readDb } = setup(null);
    await svc.posts(as('reader'), 'ch1');
    expect(readDb).not.toHaveBeenCalled();
    expect(primary.channelPost.findMany).toHaveBeenCalledTimes(1);
    expect(replica.channelPost.findMany).not.toHaveBeenCalled();
  });

  it('a guest reads older pages from the replica without a role lookup', async () => {
    const { svc, replica } = setup(null);
    await svc.posts(as('guest:abc'), 'ch1', CURSOR);
    expect(replica.channelPost.findMany).toHaveBeenCalledTimes(1);
  });

  it('the owner reads the primary', async () => {
    const { svc, primary, replica } = setup(null);
    await svc.posts(as('owner'), 'ch1', CURSOR);
    expect(primary.channelPost.findMany).toHaveBeenCalledTimes(1);
    expect(replica.channelPost.findMany).not.toHaveBeenCalled();
  });

  it('a channel admin reads the primary', async () => {
    const { svc, primary, replica } = setup('admin');
    await svc.posts(as('helper'), 'ch1', CURSOR);
    expect(primary.channelPost.findMany).toHaveBeenCalledTimes(1);
    expect(replica.channelPost.findMany).not.toHaveBeenCalled();
  });
});
