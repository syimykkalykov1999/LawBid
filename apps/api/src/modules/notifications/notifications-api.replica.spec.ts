import { NotificationsApiService } from './notifications-api.service';
import { encodeCursor } from '../../common/pagination/cursor.util';

/**
 * Replica seam: older pages of the bell list (a cursor) may be a few seconds
 * old; the first page and the delta hold the newest rows and the read state
 * the person just changed, so they stay on the primary (read-your-writes).
 */
describe('NotificationsApiService replica reads', () => {
  const client = () => ({
    notification: { findMany: jest.fn().mockResolvedValue([]) },
  });
  function setup() {
    const primary = client();
    const replica = client();
    const readDb = jest.fn().mockReturnValue(replica);
    const svc = new NotificationsApiService(
      primary as never,
      {} as never,
      {} as never,
      { readDb } as never,
    );
    jest.spyOn(svc as never, 'present' as never).mockResolvedValue([] as never);
    return { svc, primary, replica, readDb };
  }

  it('older pages (cursor) read from the replica with a 5 s budget', async () => {
    const { svc, primary, replica, readDb } = setup();
    const cursor = encodeCursor({
      createdAt: new Date(),
      id: '11111111-1111-4111-8111-111111111111',
    });
    await svc.list('me', cursor);
    expect(readDb).toHaveBeenCalledWith({ maxStalenessMs: 5000 });
    expect(replica.notification.findMany).toHaveBeenCalledTimes(1);
    expect(primary.notification.findMany).not.toHaveBeenCalled();
  });

  it('the first page stays on the primary', async () => {
    const { svc, primary, replica, readDb } = setup();
    await svc.list('me');
    expect(readDb).not.toHaveBeenCalled();
    expect(primary.notification.findMany).toHaveBeenCalledTimes(1);
    expect(replica.notification.findMany).not.toHaveBeenCalled();
  });

  it('the delta (updatedSince) stays on the primary', async () => {
    const { svc, primary, replica } = setup();
    await svc.list(
      'me',
      undefined,
      undefined,
      undefined,
      new Date(Date.now() - 60_000).toISOString(),
    );
    expect(primary.notification.findMany).toHaveBeenCalledTimes(1);
    expect(replica.notification.findMany).not.toHaveBeenCalled();
  });
});
